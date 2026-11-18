package com.decoration.design;

import com.decoration.business.AdminAuditLogService;
import com.decoration.shared.api.BusinessApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class InspirationSubmissionService {
    private static final java.util.Set<String> ALLOWED_TYPES = java.util.Set.of("image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp");
    private static final long MAX_FILE_SIZE = 15L * 1024 * 1024;
    private static final String PUBLIC_VISIBILITY = "s.status = 'APPROVED' and u.account_status = 'ACTIVE' and (s.submitter_type = 'PERSONAL' or (c.is_demo = false and exists(select 1 from company_certifications cert where cert.company_id = s.company_id and cert.status = 'APPROVED') and not exists(select 1 from auth_users a where a.company_id = s.company_id and a.role = 'COMPANY_ADMIN' and a.account_status <> 'ACTIVE')))";

    private final JdbcTemplate jdbc;
    private final Path storageRoot;
    private final AdminAuditLogService auditLog;

    public InspirationSubmissionService(JdbcTemplate jdbc,
                                        @Value("${app.storage.local-dir:./var/uploads}") String storageDir,
                                        AdminAuditLogService auditLog) {
        this.jdbc = jdbc;
        this.storageRoot = Path.of(storageDir).toAbsolutePath().normalize();
        this.auditLog = auditLog;
    }

    @Transactional
    public Submission create(UUID ownerId, String title, String style, String description, String area, List<MultipartFile> files) {
        var cleanTitle = required(title, "标题不能为空");
        var cleanStyle = required(style, "风格不能为空");
        if (files == null || files.isEmpty() || files.size() > 8) throw invalid("请上传 1 至 8 张方案图片");
        var parsedArea = parseArea(area);
        var id = UUID.randomUUID();
        var now = Timestamp.from(Instant.now());
        jdbc.update("insert into inspiration_submissions(id, owner_id, title, style, description, area, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)",
                id, ownerId, cleanTitle, cleanStyle, nullable(description), parsedArea, now, now);
        storeImages(ownerId, id, files);
        return getOwned(ownerId, id);
    }

    @Transactional
    public Submission createBusiness(UUID ownerId, UUID companyId, String title, String style,
                                     String description, List<UUID> quoteIds, List<MultipartFile> files) {
        requireCertified(companyId);
        var cleanTitle = required(title, "风格名称不能为空");
        var cleanStyle = required(style, "展示风格不能为空");
        validateBusinessFields(cleanTitle, cleanStyle, description);
        validateQuoteIds(companyId, quoteIds);
        if (files == null || files.isEmpty() || files.size() > 8) throw invalid("请上传 1 至 8 张效果图");
        var id = UUID.randomUUID();
        var now = Timestamp.from(Instant.now());
        jdbc.update("insert into inspiration_submissions(id, owner_id, company_id, submitter_type, title, style, description, area, status, created_at, updated_at) values (?, ?, ?, 'BUSINESS', ?, ?, ?, null, 'PENDING', ?, ?)",
                id, ownerId, companyId, cleanTitle, cleanStyle, nullable(description), now, now);
        storeImages(ownerId, id, files);
        saveSubmissionMaterials(id, quoteIds);
        return getOwned(ownerId, id);
    }

    public List<Submission> listBusiness(UUID companyId) {
        return list("where s.company_id = ? and s.submitter_type = 'BUSINESS'", companyId);
    }

    @Transactional
    public Submission updateBusiness(UUID companyId, UUID id, String title, String style,
                                     String description, List<UUID> quoteIds) {
        requireCertified(companyId);
        getBusinessOwned(companyId, id);
        validateBusinessFields(required(title, "风格名称不能为空"), required(style, "展示风格不能为空"), description);
        validateQuoteIds(companyId, quoteIds);
        var changed = jdbc.update("update inspiration_submissions set title = ?, style = ?, description = ?, status = 'PENDING', review_note = null, reviewed_by = null, reviewed_at = null, updated_at = now() where id = ? and company_id = ? and submitter_type = 'BUSINESS'",
                required(title, "风格名称不能为空"), required(style, "展示风格不能为空"), nullable(description), id, companyId);
        if (changed == 0) throw notFoundException();
        jdbc.update("delete from inspiration_submission_materials where submission_id = ?", id);
        saveSubmissionMaterials(id, quoteIds);
        return getBusinessOwned(companyId, id);
    }

    @Transactional
    public void deleteBusiness(UUID companyId, UUID id) {
        var submission = getBusinessOwned(companyId, id);
        delete(submission.ownerId(), id);
    }

    private Submission getBusinessOwned(UUID companyId, UUID id) {
        var result = jdbc.query(baseSelect() + " where s.id = ? and s.company_id = ? and s.submitter_type = 'BUSINESS'", this::mapOne, id, companyId);
        if (result == null) throw notFoundException();
        return result;
    }

    public List<Submission> listMine(UUID ownerId) {
        return list("where s.owner_id = ?", ownerId);
    }

    @Transactional
    public Submission update(UUID ownerId, UUID id, String title, String style, String description, java.math.BigDecimal area) {
        var cleanTitle = required(title, "标题不能为空");
        var cleanStyle = required(style, "风格不能为空");
        if (area != null && area.signum() < 0) throw invalid("面积必须是非负数字");
        var changed = jdbc.update("update inspiration_submissions set title = ?, style = ?, description = ?, area = ?, status = 'PENDING', review_note = null, reviewed_by = null, reviewed_at = null, updated_at = ? where id = ? and owner_id = ?",
                cleanTitle, cleanStyle, nullable(description), area, Timestamp.from(Instant.now()), id, ownerId);
        if (changed == 0) throw notFoundException();
        return getOwned(ownerId, id);
    }

    @Transactional
    public void delete(UUID ownerId, UUID id) {
        var objectKeys = jdbc.query("select object_key from inspiration_submission_images where submission_id = ? and owner_id = ?", (rs, row) -> rs.getString("object_key"), id, ownerId);
        var changed = jdbc.update("delete from inspiration_submissions where id = ? and owner_id = ?", id, ownerId);
        if (changed == 0) throw notFoundException();
        Runnable cleanup = () -> objectKeys.forEach(key -> {
            var path = storageRoot.resolve(key).normalize();
            if (path.startsWith(storageRoot)) {
                try { Files.deleteIfExists(path); } catch (IOException ignored) { }
            }
        });
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { cleanup.run(); }
            });
        } else cleanup.run();
    }

    public List<Submission> listPublic() {
        return list("where " + PUBLIC_VISIBILITY, new Object[0]).stream()
                .map(item -> new Submission(item.id(), null, null, item.submitterType(), item.companyId(),
                        item.companyName(), item.title(), item.style(), item.description(), item.area(), item.status(),
                        null, item.createdAt(), item.updatedAt(), item.images(), List.of())).toList();
    }

    public List<Submission> listForAdmin(String status, String query) {
        var where = new StringBuilder("where 1=1");
        var args = new java.util.ArrayList<>();
        if (status != null && !status.isBlank() && !status.equals("ALL")) { where.append(" and s.status = ?"); args.add(status); }
        if (query != null && !query.isBlank()) { where.append(" and (lower(s.title) like lower(?) or lower(s.style) like lower(?) or lower(u.email) like lower(?) or lower(coalesce(p.name, c.name, '')) like lower(?))"); var q = "%" + query.trim() + "%"; args.add(q); args.add(q); args.add(q); args.add(q); }
        return list(where.toString(), args.toArray());
    }

    @Transactional
    public Submission review(UUID id, UUID reviewerId, String status, String note) {
        if (status == null || !List.of("APPROVED", "REJECTED", "PENDING").contains(status)) throw invalid("审核状态不正确");
        if (note != null && note.length() > 1000) throw invalid("审核备注不能超过 1000 字");
        var current = get(id);
        if ("APPROVED".equals(status) && current.companyId() != null) requireCertified(current.companyId());
        var changed = jdbc.update("update inspiration_submissions set status = ?, review_note = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? where id = ?",
                status, nullable(note), reviewerId, Timestamp.from(Instant.now()), Timestamp.from(Instant.now()), id);
        if (changed == 0) throw notFoundException();
        auditLog.record(reviewerId, "INSPIRATION_SUBMISSION_REVIEW", "INSPIRATION_SUBMISSION", id, status + "：审核" + (current.companyId() == null ? "用户方案" : "企业风格模板"));
        return get(id);
    }

    public ImageFile image(UUID submissionId, UUID imageId, boolean publicOnly) {
        var row = jdbc.query("select i.file_name, i.object_key, i.media_type from inspiration_submission_images i join inspiration_submissions s on s.id = i.submission_id join auth_users u on u.id = s.owner_id left join auth_companies c on c.id = s.company_id where i.id = ? and i.submission_id = ?" + (publicOnly ? " and " + PUBLIC_VISIBILITY : ""),
                rs -> rs.next() ? new ImageFile(rs.getString("file_name"), rs.getString("object_key"), rs.getString("media_type")) : null, imageId, submissionId);
        if (row == null) throw notFoundException();
        var path = storageRoot.resolve(row.objectKey()).normalize();
        if (!path.startsWith(storageRoot) || !Files.isRegularFile(path)) throw notFoundException();
        return row.withResource(new FileSystemResource(path));
    }

    public ImageFile businessImage(UUID companyId, UUID submissionId, UUID imageId) {
        var row = jdbc.query("select i.file_name, i.object_key, i.media_type from inspiration_submission_images i join inspiration_submissions s on s.id = i.submission_id where i.id = ? and i.submission_id = ? and s.company_id = ? and s.submitter_type = 'BUSINESS'",
                rs -> rs.next() ? new ImageFile(rs.getString("file_name"), rs.getString("object_key"), rs.getString("media_type")) : null,
                imageId, submissionId, companyId);
        if (row == null) throw notFoundException();
        var path = storageRoot.resolve(row.objectKey()).normalize();
        if (!path.startsWith(storageRoot) || !Files.isRegularFile(path)) throw notFoundException();
        return row.withResource(new FileSystemResource(path));
    }

    public Submission getOwned(UUID ownerId, UUID id) {
        var result = jdbc.query(baseSelect() + " where s.id = ? and s.owner_id = ?", this::mapOne, id, ownerId);
        if (result == null) throw notFoundException();
        return result;
    }

    private Submission get(UUID id) {
        var result = jdbc.query(baseSelect() + " where s.id = ?", this::mapOne, id);
        if (result == null) throw notFoundException();
        return result;
    }

    private List<Submission> list(String where, Object... args) {
        return jdbc.query(baseSelect() + " " + where + " order by s.updated_at desc, s.id", this::map, args);
    }

    private String baseSelect() {
        return "select s.*, u.email owner_email, coalesce(p.name, c.name) company_name from inspiration_submissions s join auth_users u on u.id = s.owner_id left join auth_companies c on c.id = s.company_id left join company_profiles p on p.company_id = s.company_id";
    }

    private Submission mapOne(java.sql.ResultSet rs) throws java.sql.SQLException { return rs.next() ? map(rs, 0) : null; }

    private Submission map(java.sql.ResultSet rs, int row) throws java.sql.SQLException {
        var id = rs.getObject("id", UUID.class);
        var images = jdbc.query("select id, file_name, media_type, position from inspiration_submission_images where submission_id = ? order by position", (imageRs, imageRow) -> new Image(imageRs.getObject("id", UUID.class), imageRs.getString("file_name"), imageRs.getString("media_type"), imageRs.getInt("position")), id);
        var materials = jdbc.query("select m.id, m.name, m.brand, m.specification, m.unit, m.price from inspiration_submission_materials sm join material_quotes m on m.id = sm.quote_id where sm.submission_id = ? order by sm.position", (materialRs, materialRow) -> new SubmissionMaterial(materialRs.getObject("id", UUID.class), materialRs.getString("name"), materialRs.getString("brand"), materialRs.getString("specification"), materialRs.getString("unit"), materialRs.getBigDecimal("price")), id);
        var area = rs.getBigDecimal("area");
        return new Submission(id, rs.getObject("owner_id", UUID.class), rs.getString("owner_email"), rs.getString("submitter_type"), rs.getObject("company_id", UUID.class), rs.getString("company_name"), rs.getString("title"), rs.getString("style"), rs.getString("description"), area, rs.getString("status"), rs.getString("review_note"), rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("updated_at").toInstant(), images, materials);
    }

    private void requireCertified(UUID companyId) {
        var certified = Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from company_certifications where company_id = ? and status = 'APPROVED')", Boolean.class, companyId));
        if (!certified) throw new BusinessApiException(HttpStatus.CONFLICT, "CERTIFICATION_REQUIRED", "企业认证通过后才能发布风格模板");
    }

    private void validateQuoteIds(UUID companyId, List<UUID> quoteIds) {
        if (quoteIds == null || quoteIds.size() > 20 || quoteIds.stream().anyMatch(java.util.Objects::isNull) || quoteIds.stream().distinct().count() != quoteIds.size()) throw invalid("关联材料不能超过 20 项且不能重复");
        if (quoteIds.isEmpty()) return;
        var placeholders = String.join(",", java.util.Collections.nCopies(quoteIds.size(), "?"));
        var args = new java.util.ArrayList<Object>();
        args.add(companyId);
        args.addAll(quoteIds);
        var ownedCount = jdbc.queryForObject("select count(*) from material_quotes where company_id = ? and id in (" + placeholders + ")", Integer.class, args.toArray());
        if (ownedCount == null || ownedCount != quoteIds.size()) throw invalid("只能关联本企业的材料报价");
    }

    private void saveSubmissionMaterials(UUID submissionId, List<UUID> quoteIds) {
        for (var index = 0; index < quoteIds.size(); index++) jdbc.update("insert into inspiration_submission_materials(submission_id, quote_id, position) values (?, ?, ?)", submissionId, quoteIds.get(index), index);
    }

    private void validateBusinessFields(String title, String style, String description) {
        if (title.length() > 160 || style.length() > 80 || (description != null && description.length() > 2000)) throw invalid("名称最多 160 字，风格最多 80 字，说明最多 2000 字");
        if (!Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from design_style_prompts where style_key = ?)", Boolean.class, style))) throw invalid("请选择平台已有风格");
    }

    private void storeImages(UUID ownerId, UUID submissionId, List<MultipartFile> files) {
        for (var index = 0; index < files.size(); index++) {
            var file = files.get(index);
            if (file == null || file.isEmpty() || file.getSize() > MAX_FILE_SIZE) throw invalid("图片不能为空且单张不能超过 15 MB");
            var type = file.getContentType() == null ? "" : file.getContentType().toLowerCase(java.util.Locale.ROOT);
            if (type.isBlank() || type.equals("application/octet-stream")) type = inferredType(file.getOriginalFilename());
            if (!ALLOWED_TYPES.contains(type)) throw new BusinessApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "UNSUPPORTED_MEDIA_TYPE", "仅支持 JPG、PNG、WEBP、GIF、BMP 图片");
            var original = Path.of(file.getOriginalFilename() == null ? "image" : file.getOriginalFilename()).getFileName().toString();
            var id = UUID.randomUUID();
            var key = ownerId + "/inspiration/" + submissionId + "/" + id;
            var target = storageRoot.resolve(key).normalize();
            if (TransactionSynchronizationManager.isSynchronizationActive()) {
                TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                    @Override public void afterCompletion(int status) {
                        if (status != STATUS_COMMITTED) {
                            try { Files.deleteIfExists(target); } catch (IOException ignored) { }
                        }
                    }
                });
            }
            try { Files.createDirectories(target.getParent()); file.transferTo(target); }
            catch (IOException exception) { throw new BusinessApiException(HttpStatus.INTERNAL_SERVER_ERROR, "FILE_STORAGE_ERROR", "图片保存失败"); }
            jdbc.update("insert into inspiration_submission_images(id, submission_id, owner_id, file_name, object_key, media_type, byte_size, position, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)", id, submissionId, ownerId, original, key, type, file.getSize(), index, Timestamp.from(Instant.now()));
        }
    }

    private static String required(String value, String message) { if (value == null || value.isBlank()) throw invalid(message); return value.trim(); }
    private static String inferredType(String fileName) {
        var name = fileName == null ? "" : fileName.toLowerCase(java.util.Locale.ROOT);
        if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
        if (name.endsWith(".png")) return "image/png";
        if (name.endsWith(".webp")) return "image/webp";
        if (name.endsWith(".gif")) return "image/gif";
        if (name.endsWith(".bmp")) return "image/bmp";
        return "";
    }
    private static String nullable(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private static java.math.BigDecimal parseArea(String value) { if (value == null || value.isBlank()) return null; try { var parsed = new java.math.BigDecimal(value); if (parsed.signum() < 0) throw new NumberFormatException(); return parsed; } catch (NumberFormatException e) { throw invalid("面积必须是非负数字"); } }
    private static BusinessApiException invalid(String message) { return new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", message); }
    private static BusinessApiException notFoundException() { return new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "投稿不存在"); }

    public record Submission(UUID id, UUID ownerId, String ownerEmail, String submitterType, UUID companyId,
                             String companyName, String title, String style, String description,
                             java.math.BigDecimal area, String status, String reviewNote,
                             Instant createdAt, Instant updatedAt, List<Image> images,
                             List<SubmissionMaterial> materials) { }
    public record Image(UUID id, String fileName, String mediaType, int position) { }
    public record SubmissionMaterial(UUID id, String name, String brand, String specification,
                                     String unit, java.math.BigDecimal price) { }
    public record ImageFile(String fileName, String objectKey, String mediaType, Resource resource) { ImageFile(String f, String k, String m) { this(f, k, m, null); } ImageFile withResource(Resource r) { return new ImageFile(fileName, objectKey, mediaType, r); } }
}
