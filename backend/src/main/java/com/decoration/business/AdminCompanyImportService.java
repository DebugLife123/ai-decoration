package com.decoration.business;

import com.decoration.shared.api.BusinessApiException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
public class AdminCompanyImportService {
    private final JdbcTemplate jdbc;
    private final AdminAuditLogService audit;
    private final ObjectMapper objectMapper;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    public AdminCompanyImportService(JdbcTemplate jdbc, AdminAuditLogService audit, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public ImportResult create(UUID actorId, ImportRequest request) {
        var email = request.email().trim().toLowerCase(Locale.ROOT);
        if (request.password().getBytes(StandardCharsets.UTF_8).length > 72)
            throw invalid("初始密码不能超过 72 个 UTF-8 字节");
        if (Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from auth_users where lower(email) = ?)", Boolean.class, email)))
            throw new BusinessApiException(HttpStatus.CONFLICT, "ACCOUNT_EXISTS", "该邮箱已注册");

        var now = Timestamp.from(Instant.now());
        var companyId = UUID.randomUUID();
        var userId = UUID.randomUUID();
        jdbc.update("insert into auth_companies(id, name, is_demo, created_at) values (?, ?, false, ?)", companyId, request.companyName().trim(), now);
        try {
            jdbc.update("""
                insert into auth_users(id, email, password_hash, display_name, account_type, company_id, role, created_at)
                values (?, ?, ?, ?, 'BUSINESS', ?, 'COMPANY_ADMIN', ?)
                """, userId, email, encoder.encode(request.password()), request.contactName().trim(), companyId, now);
        } catch (DuplicateKeyException exception) {
            throw new BusinessApiException(HttpStatus.CONFLICT, "ACCOUNT_EXISTS", "该邮箱已注册");
        }
        jdbc.update("""
                insert into company_profiles(company_id, id, name, city, services, intro, public_contact_name,
                    public_contact_info, version, created_at, updated_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
                """, companyId, UUID.randomUUID(), request.companyName().trim(), clean(request.city()), clean(request.services()),
                clean(request.intro()), request.contactName().trim(), request.contactInfo().trim(), now, now);
        jdbc.update("""
                insert into company_certifications(company_id, id, company_name, contact_name, contact_info,
                    service_areas, document_refs, status, version, submitted_at, updated_at)
                values (?, ?, ?, ?, ?, ?::jsonb, '[]'::jsonb, 'PENDING', 0, ?, ?)
                """, companyId, UUID.randomUUID(), request.companyName().trim(), request.contactName().trim(),
                request.contactInfo().trim(), toJsonArray(request.serviceAreas()), now, now);

        UUID firstCaseId = null;
        for (var item : request.cases()) {
            var caseId = UUID.randomUUID();
            if (firstCaseId == null) firstCaseId = caseId;
            jdbc.update("""
                    insert into business_cases(id, company_id, title, area, style, budget, status, version, created_at, updated_at)
                    values (?, ?, ?, ?, ?, ?, 'draft', 0, ?, ?)
                    """, caseId, companyId, item.title().trim(), item.area(), clean(item.style()), item.budget(), now, now);
        }
        UUID firstQuoteId = null;
        int skippedQuotes = 0;
        for (var item : request.materials()) {
            var quoteId = UUID.randomUUID();
            if (firstQuoteId == null) firstQuoteId = quoteId;
            // 批量录入里出现同名称同规格同品牌同单位的重复行时跳过，不让整批导入因为唯一索引失败。
            var inserted = jdbc.update("""
                    insert into material_quotes(id, company_id, name, specification, brand, unit, price, category,
                        region, valid_until, version, created_at, updated_at)
                    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
                    on conflict do nothing
                    """, quoteId, companyId, item.name().trim(), item.specification().trim(), clean(item.brand()),
                    item.unit().trim(), item.price(), item.category().trim(), item.region().trim(), item.validUntil(), now, now);
            if (inserted == 0) {
                skippedQuotes++;
                if (firstQuoteId.equals(quoteId)) firstQuoteId = null;
            }
        }
        audit.record(actorId, "COMPANY_IMPORT", "COMPANY", companyId,
                "录入真实企业：" + request.companyName().trim() + "；案例 " + request.cases().size() + " 条；报价 "
                        + (request.materials().size() - skippedQuotes) + " 条"
                        + (skippedQuotes > 0 ? "（跳过重复报价 " + skippedQuotes + " 条）" : ""));
        return new ImportResult(companyId, email, "PENDING", request.cases().size(),
                request.materials().size() - skippedQuotes, firstCaseId, firstQuoteId);
    }

    @Transactional
    public void attachCaseFiles(UUID companyId, UUID caseId, List<UUID> fileIds) {
        if (fileIds.size() > 30 || fileIds.stream().distinct().count() != fileIds.size())
            throw invalid("案例图片最多 30 个且不能重复");
        var exists = Boolean.TRUE.equals(jdbc.queryForObject(
                "select exists(select 1 from business_cases where company_id = ? and id = ? and status = 'draft')",
                Boolean.class, companyId, caseId));
        if (!exists) throw new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "案例草稿不存在");
        if (!fileIds.isEmpty()) {
            var placeholders = String.join(",", java.util.Collections.nCopies(fileIds.size(), "?"));
            var args = new java.util.ArrayList<Object>(); args.add(companyId); args.addAll(fileIds);
            var count = jdbc.queryForObject("select count(*) from business_assets where company_id = ? and id in (" + placeholders + ")", Long.class, args.toArray());
            if (count == null || count != fileIds.size()) throw invalid("案例图片必须是该企业已上传的文件");
        }
        jdbc.update("delete from business_case_files where company_id = ? and case_id = ?", companyId, caseId);
        for (int i = 0; i < fileIds.size(); i++) {
            jdbc.update("insert into business_case_files(company_id, case_id, file_id, position) values (?, ?, ?, ?)", companyId, caseId, fileIds.get(i), i);
        }
    }

    @Transactional
    public void attachMaterialImages(UUID companyId, UUID quoteId, List<UUID> imageIds) {
        if (imageIds.size() > 8 || imageIds.stream().distinct().count() != imageIds.size())
            throw invalid("材料图片最多 8 张且不能重复");
        var quoteExists = Boolean.TRUE.equals(jdbc.queryForObject(
                "select exists(select 1 from material_quotes where company_id = ? and id = ?)", Boolean.class, companyId, quoteId));
        if (!quoteExists) throw new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "材料报价不存在");
        if (!imageIds.isEmpty()) {
            var placeholders = String.join(",", java.util.Collections.nCopies(imageIds.size(), "?"));
            var args = new java.util.ArrayList<Object>(); args.add(companyId); args.addAll(imageIds);
            var count = jdbc.queryForObject("select count(*) from business_assets where company_id = ? and media_type like 'image/%' and id in (" + placeholders + ")", Long.class, args.toArray());
            if (count == null || count != imageIds.size()) throw invalid("材料图片必须是该企业已上传的图片文件");
        }
        jdbc.update("delete from material_quote_images where company_id = ? and quote_id = ?", companyId, quoteId);
        for (int i = 0; i < imageIds.size(); i++) {
            jdbc.update("insert into material_quote_images(company_id, quote_id, image_id, position) values (?, ?, ?, ?)", companyId, quoteId, imageIds.get(i), i);
        }
    }

    private String toJsonArray(List<String> values) {
        try { return objectMapper.writeValueAsString(values.stream().map(String::trim).filter(value -> !value.isBlank()).distinct().toList()); }
        catch (JsonProcessingException exception) { throw new IllegalStateException("Unable to serialize service areas", exception); }
    }
    private static String clean(String value) { return value == null ? "" : value.trim(); }
    private static BusinessApiException invalid(String message) { return new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", message); }

    public record ImportRequest(
            @jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max = 160) String companyName,
            @jakarta.validation.constraints.Email @jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max = 320) String email,
            @jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(min = 8, max = 128) String password,
            @jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max = 120) String contactName,
            @jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max = 160) String contactInfo,
            @jakarta.validation.constraints.Size(max = 80) String city,
            @jakarta.validation.constraints.Size(max = 500) String services,
            @jakarta.validation.constraints.Size(max = 2000) String intro,
            @jakarta.validation.constraints.NotNull @jakarta.validation.constraints.Size(max = 20) List<@jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max = 80) String> serviceAreas,
            @jakarta.validation.constraints.NotNull @jakarta.validation.constraints.Size(max = 30) List<@jakarta.validation.Valid CaseInput> cases,
            @jakarta.validation.constraints.NotNull @jakarta.validation.constraints.Size(max = 50) List<@jakarta.validation.Valid MaterialInput> materials) { }
    public record CaseInput(@jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max = 160) String title,
            @jakarta.validation.constraints.DecimalMin("0") java.math.BigDecimal area,
            @jakarta.validation.constraints.Size(max = 80) String style,
            @jakarta.validation.constraints.DecimalMin("0") java.math.BigDecimal budget) { }
    public record MaterialInput(@jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max = 160) String name,
            @jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max = 240) String specification,
            @jakarta.validation.constraints.Size(max = 120) String brand,
            @jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max = 40) String unit,
            @jakarta.validation.constraints.NotNull @jakarta.validation.constraints.DecimalMin(value = "0.01") java.math.BigDecimal price,
            @jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max = 80) String category,
            @jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max = 80) String region,
            @jakarta.validation.constraints.NotNull LocalDate validUntil) { }
    public record ImportResult(UUID companyId, String email, String certificationStatus, int caseDrafts, int quotes,
                               UUID firstCaseId, UUID firstQuoteId) { }
}
