package com.decoration.business;

import com.decoration.shared.api.BusinessApiException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static com.decoration.business.CertificationDtos.*;

@Service
public class CertificationService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final AdminAuditLogService auditLogService;

    public CertificationService(JdbcTemplate jdbc, ObjectMapper objectMapper, AdminAuditLogService auditLogService) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.auditLogService = auditLogService;
    }

    public Certification get(UUID companyId) {
        var rows = jdbc.query("""
                select id, company_name, contact_name, contact_info, service_areas, document_refs,
                    status, review_note, reviewed_by, reviewed_at, version, submitted_at, updated_at
                from company_certifications where company_id = ?
                """, (rs, row) -> map(rs), companyId);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public List<AdminCertification> listForAdmin(CertificationStatus status, String query) {
        return listForAdmin(status, query, "ALL");
    }

    public List<AdminCertification> listForAdmin(CertificationStatus status, String query, String kind) {
        var hasStatus = status != null;
        var hasQuery = query != null && !query.isBlank();
        var sql = """
                select cc.company_id, ac.name as registered_company_name, ac.is_demo,
                    (select u.email from auth_users u where u.company_id = cc.company_id order by u.created_at limit 1) as account_email,
                    cc.id, cc.company_name, cc.contact_name, cc.contact_info, cc.service_areas, cc.document_refs,
                    cc.status, cc.review_note, cc.reviewed_by, cc.reviewed_at, cc.version, cc.submitted_at, cc.updated_at
                from company_certifications cc
                join auth_companies ac on ac.id = cc.company_id
                """;
        var where = new java.util.ArrayList<String>();
        var args = new java.util.ArrayList<Object>();
        if (hasStatus) { where.add("cc.status = ?"); args.add(status.name()); }
        if (hasQuery) {
            where.add("(lower(coalesce(cc.company_name, ac.name, '')) like ? or lower(ac.name) like ? or lower(coalesce((select u.email from auth_users u where u.company_id = cc.company_id order by u.created_at limit 1), '')) like ?)");
            var pattern = "%" + query.trim().toLowerCase() + "%";
            args.add(pattern); args.add(pattern); args.add(pattern);
        }
        if ("REAL".equals(kind)) where.add("ac.is_demo = false");
        if ("DEMO".equals(kind)) where.add("ac.is_demo = true");
        if (!where.isEmpty()) sql += " where " + String.join(" and ", where);
        sql += " order by cc.submitted_at asc, cc.company_id";
        return jdbc.query(sql, (rs, row) -> new AdminCertification(rs.getObject("company_id", UUID.class),
                rs.getString("registered_company_name"), rs.getString("account_email"), rs.getBoolean("is_demo"), map(rs)), args.toArray());
    }

    @Transactional
    public Certification submit(UUID companyId, CertificationRequest request) {
        requireCompany(companyId);
        requireOwnedDocuments(companyId, request.documentRefs());
        var current = get(companyId);
        var now = Timestamp.from(Instant.now());
        var areas = json(request.serviceAreas());
        var documents = json(request.documentRefs());
        if (current == null) {
            jdbc.update("""
                    insert into company_certifications(company_id, id, company_name, contact_name, contact_info,
                        service_areas, document_refs, status, version, submitted_at, updated_at)
                    values (?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, 'PENDING', 0, ?, ?)
                    """, companyId, UUID.randomUUID(), clean(request.companyName()), clean(request.contactName()),
                    clean(request.contactInfo()), areas, documents, now, now);
        } else {
            if (request.version() == null || request.version() != current.version()) throw versionConflict();
            jdbc.update("""
                    update company_certifications set company_name = ?, contact_name = ?, contact_info = ?,
                        service_areas = ?::jsonb, document_refs = ?::jsonb, status = 'PENDING', review_note = null,
                        reviewed_by = null, reviewed_at = null, version = version + 1, submitted_at = ?, updated_at = ?
                    where company_id = ? and version = ?
                    """, clean(request.companyName()), clean(request.contactName()), clean(request.contactInfo()),
                    areas, documents, now, now, companyId, request.version());
        }
        for (var documentRef : request.documentRefs().stream().map(String::trim).filter(value -> !value.isBlank()).distinct().toList()) {
            jdbc.update("""
                    insert into company_certification_documents(company_id, asset_id, submitted_at)
                    values (?, ?, ?) on conflict (company_id, asset_id) do nothing
                    """, companyId, UUID.fromString(documentRef), now);
        }
        return get(companyId);
    }

    @Transactional
    public Certification decide(UUID companyId, UUID reviewerId, CertificationDecision request) {
        if (request.status() == CertificationStatus.PENDING) throw invalid("审核结果必须是 APPROVED 或 REJECTED");
        var current = get(companyId);
        if (current == null) throw notFound();
        if (current.status() != CertificationStatus.PENDING) throw conflict("只能审核待审核的企业认证");
        var changed = jdbc.update("""
                update company_certifications set status = ?, review_note = ?, reviewed_by = ?, reviewed_at = ?,
                    version = version + 1, updated_at = ? where company_id = ? and version = ? and status = 'PENDING'
                """, request.status().name(), cleanNullable(request.reviewNote()), reviewerId,
                Timestamp.from(Instant.now()), Timestamp.from(Instant.now()), companyId, request.version());
        if (changed == 0) throw versionConflict();
        var reviewed = get(companyId);
        auditLogService.record(reviewerId, "CERTIFICATION_REVIEW", "COMPANY", companyId,
                (request.status() == CertificationStatus.APPROVED ? "通过" : "驳回") + "企业认证：" + current.companyName());
        return reviewed;
    }

    private Certification map(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Certification(rs.getObject("id", UUID.class), rs.getString("company_name"),
                rs.getString("contact_name"), rs.getString("contact_info"), list(rs.getString("service_areas")),
                list(rs.getString("document_refs")), CertificationStatus.valueOf(rs.getString("status")),
                rs.getString("review_note"), rs.getObject("reviewed_by", UUID.class),
                instant(rs.getTimestamp("reviewed_at")), rs.getInt("version"),
                instant(rs.getTimestamp("submitted_at")), instant(rs.getTimestamp("updated_at")));
    }

    private List<String> list(String value) {
        try { return objectMapper.readValue(value, objectMapper.getTypeFactory().constructCollectionType(List.class, String.class)); }
        catch (JsonProcessingException exception) { throw new IllegalStateException("Certification JSON is invalid", exception); }
    }

    private String json(List<String> values) {
        try { return objectMapper.writeValueAsString(values.stream().map(String::trim).filter(value -> !value.isBlank()).distinct().toList()); }
        catch (JsonProcessingException exception) { throw new IllegalStateException("Unable to serialize certification", exception); }
    }

    private void requireCompany(UUID companyId) {
        var rows = jdbc.query("select id from auth_companies where id = ? for update", (rs, row) -> rs.getObject(1, UUID.class), companyId);
        if (rows.isEmpty()) throw notFound();
    }

    private void requireOwnedDocuments(UUID companyId, List<String> documentRefs) {
        var ids = documentRefs.stream().map(String::trim).filter(value -> !value.isBlank()).distinct()
                .map(value -> {
                    try { return UUID.fromString(value); }
                    catch (IllegalArgumentException exception) { throw invalid("认证材料必须是已上传文件"); }
                }).toList();
        if (ids.isEmpty()) return;
        var placeholders = String.join(",", java.util.Collections.nCopies(ids.size(), "?"));
        var args = new java.util.ArrayList<Object>();
        args.add(companyId);
        args.addAll(ids);
        var count = jdbc.queryForObject("select count(*) from business_assets where company_id = ? and id in (" + placeholders + ")",
                Long.class, args.toArray());
        if (count == null || count != ids.size()) throw invalid("认证材料必须是本企业已上传的文件");
    }

    private static Instant instant(Timestamp timestamp) { return timestamp == null ? null : timestamp.toInstant(); }
    private static String clean(String value) { return value.trim(); }
    private static String cleanNullable(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private static BusinessApiException invalid(String value) { return new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", value); }
    private static BusinessApiException notFound() { return new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Company certification was not found"); }
    private static BusinessApiException versionConflict() { return new BusinessApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT", "Certification was changed by another request"); }
    private static BusinessApiException conflict(String message) { return new BusinessApiException(HttpStatus.CONFLICT, "CERTIFICATION_CONFLICT", message); }
}
