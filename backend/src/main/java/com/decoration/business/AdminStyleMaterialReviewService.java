package com.decoration.business;

import com.decoration.shared.api.BusinessApiException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class AdminStyleMaterialReviewService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final AdminAuditLogService audit;
    private final Path sourceRoot;

    public AdminStyleMaterialReviewService(JdbcTemplate jdbc, ObjectMapper mapper, AdminAuditLogService audit,
                                           @org.springframework.beans.factory.annotation.Value("${app.style-material-source-dir:D:/开发/主流风格}") String sourceDir) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.audit = audit;
        this.sourceRoot = Path.of(sourceDir).toAbsolutePath().normalize();
    }

    public List<Candidate> list(String status, String styleKey, String query) {
        var where = new StringBuilder(" where 1 = 1");
        var args = new java.util.ArrayList<Object>();
        if (status != null && !status.isBlank() && !"ALL".equals(status)) { where.append(" and status = ?"); args.add(status); }
        if (styleKey != null && !styleKey.isBlank()) { where.append(" and style_key = ?"); args.add(styleKey); }
        if (query != null && !query.isBlank()) { where.append(" and (lower(name) like ? or lower(style_name) like ? or lower(category) like ?)"); var p = "%" + query.trim().toLowerCase() + "%"; args.add(p); args.add(p); args.add(p); }
        return jdbc.query("select * from style_material_review_candidates" + where + " order by updated_at desc, id", this::map, args.toArray());
    }

    public SourceImage sourceImage(UUID id, int index) {
        var candidates = jdbc.query("select source_images from style_material_review_candidates where id = ?",
                (rs, row) -> readArray(rs.getString("source_images")), id);
        if (candidates.isEmpty()) throw new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Style material candidate was not found");
        var sources = candidates.getFirst();
        if (index < 0 || index >= sources.size()) throw new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Source image was not found");
        var path = Path.of(sources.get(index)).toAbsolutePath().normalize();
        var extension = path.getFileName().toString().toLowerCase(java.util.Locale.ROOT);
        var mediaType = switch (extension.substring(extension.lastIndexOf('.') + 1)) {
            case "jpg", "jpeg" -> "image/jpeg";
            case "png" -> "image/png";
            case "webp" -> "image/webp";
            case "gif" -> "image/gif";
            case "bmp" -> "image/bmp";
            default -> null;
        };
        try {
            if (mediaType == null || !path.startsWith(sourceRoot) || Files.isSymbolicLink(path) || !Files.isRegularFile(path)) {
                throw new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Source image was not found");
            }
            var realRoot = sourceRoot.toRealPath();
            var realPath = path.toRealPath();
            if (!realPath.startsWith(realRoot)) throw new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Source image was not found");
            return new SourceImage(new FileSystemResource(realPath), mediaType);
        } catch (java.io.IOException exception) {
            throw new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Source image was not found");
        }
    }

    @Transactional
    public int importCandidates(List<ImportCandidate> candidates, UUID actorId) {
        var count = 0;
        for (var candidate : candidates) {
            if (candidate == null || candidate.candidateKey() == null || candidate.candidateKey().isBlank()) continue;
            var updated = jdbc.update("""
                    insert into style_material_review_candidates
                        (id, candidate_key, style_key, style_name, name, category, confidence, source_images, source_rooms, brand, specification, unit, price, status, review_note, created_at, updated_at)
                    values (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, ?, ?, 'NEEDS_REVIEW', ?, ?, ?)
                    on conflict (candidate_key) do update set style_key = excluded.style_key, style_name = excluded.style_name,
                        name = excluded.name, category = excluded.category, confidence = excluded.confidence,
                        source_images = excluded.source_images, source_rooms = excluded.source_rooms, updated_at = excluded.updated_at
                    """, UUID.randomUUID(), candidate.candidateKey(), required(candidate.styleKey(), "styleKey"), required(candidate.styleName(), "styleName"),
                    required(candidate.name(), "name"), required(candidate.category(), "category"), confidence(candidate.confidence()), json(candidate.sourceImages()),
                    json(candidate.sourceRooms()), blankToNull(candidate.brand()), blankToNull(candidate.specification()), blankToNull(candidate.unit()), candidate.price(),
                    blankToNull(candidate.reviewNote()), Timestamp.from(Instant.now()), Timestamp.from(Instant.now()));
            count += updated > 0 ? 1 : 0;
        }
        if (count > 0) audit.record(actorId, "STYLE_MATERIAL_REVIEW_IMPORT", "STYLE_MATERIAL_REVIEW", null, "导入风格软装候选 " + count + " 条");
        return count;
    }

    @Transactional
    public Candidate review(UUID id, UUID actorId, ReviewRequest request) {
        var status = request.status();
        if (!List.of("NEEDS_REVIEW", "APPROVED", "REJECTED").contains(status)) throw new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Unknown review status");
        if ("APPROVED".equals(status) && (blank(request.brand()) || blank(request.specification()) || blank(request.unit()) || request.price() == null || request.price().signum() < 0))
            throw new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "通过审核前必须填写品牌、规格、单位和非负价格");
        var rows = jdbc.update("""
                update style_material_review_candidates set brand = ?, specification = ?, unit = ?, price = ?, status = ?, review_note = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? where id = ?
                """, blankToNull(request.brand()), blankToNull(request.specification()), blankToNull(request.unit()), request.price(), status,
                blankToNull(request.reviewNote()), actorId, Timestamp.from(Instant.now()), Timestamp.from(Instant.now()), id);
        if (rows == 0) throw new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Style material candidate was not found");
        audit.record(actorId, "STYLE_MATERIAL_REVIEW", "STYLE_MATERIAL_REVIEW", id, status + " 风格软装候选");
        return jdbc.query("select * from style_material_review_candidates where id = ?", this::map, id).getFirst();
    }

    private Candidate map(java.sql.ResultSet rs, int row) throws java.sql.SQLException {
        return new Candidate(rs.getObject("id", UUID.class), rs.getString("candidate_key"), rs.getString("style_key"), rs.getString("style_name"),
                rs.getString("name"), rs.getString("category"), rs.getBigDecimal("confidence"), readArray(rs.getString("source_images")),
                readArray(rs.getString("source_rooms")), rs.getString("brand"), rs.getString("specification"), rs.getString("unit"), rs.getBigDecimal("price"),
                rs.getString("status"), rs.getString("review_note"), rs.getTimestamp("updated_at").toInstant());
    }

    private List<String> readArray(String value) {
        try { return mapper.readValue(value == null ? "[]" : value, mapper.getTypeFactory().constructCollectionType(List.class, String.class)); }
        catch (JsonProcessingException e) { return List.of(); }
    }
    private String json(List<String> values) { try { return mapper.writeValueAsString(values == null ? List.of() : values); } catch (JsonProcessingException e) { throw new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Invalid source list"); } }
    private static BigDecimal confidence(BigDecimal value) { return value == null ? BigDecimal.ZERO : value.max(BigDecimal.ZERO).min(BigDecimal.ONE); }
    private static String required(String value, String field) { if (blank(value)) throw new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", field + " is required"); return value.trim(); }
    private static String blankToNull(String value) { return blank(value) ? null : value.trim(); }
    private static boolean blank(String value) { return value == null || value.isBlank(); }

    public record Candidate(UUID id, String candidateKey, String styleKey, String styleName, String name, String category,
                            BigDecimal confidence, List<String> sourceImages, List<String> sourceRooms, String brand,
                            String specification, String unit, BigDecimal price, String status, String reviewNote, Instant updatedAt) { }
    public record ImportCandidate(String candidateKey, String styleKey, String styleName, String name, String category,
                                  BigDecimal confidence, List<String> sourceImages, List<String> sourceRooms, String brand,
                                  String specification, String unit, BigDecimal price, String reviewNote) { }
    public record ReviewRequest(String status, String brand, String specification, String unit, BigDecimal price, String reviewNote) { }
    public record SourceImage(Resource resource, String mediaType) { }
}
