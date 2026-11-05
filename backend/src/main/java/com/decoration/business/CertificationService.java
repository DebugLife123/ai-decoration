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

    public CertificationService(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    public Certification get(UUID companyId) {
        var rows = jdbc.query("""
                select id, company_name, contact_name, contact_info, service_areas, document_refs,
                    status, review_note, reviewed_by, reviewed_at, version, submitted_at, updated_at
                from company_certifications where company_id = ?
                """, (rs, row) -> map(rs), companyId);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public List<AdminCertification> listForAdmin(CertificationStatus status) {
        var sql = """
                select cc.company_id, ac.name as registered_company_name,
                    (select u.email from auth_users u where u.company_id = cc.company_id order by u.created_at limit 1) as account_email,
                    cc.id, cc.company_name, cc.contact_name, cc.contact_info, cc.service_areas, cc.document_refs,
                    cc.status, cc.review_note, cc.reviewed_by, cc.reviewed_at, cc.version, cc.submitted_at, cc.updated_at
                from company_certifications cc
                join auth_companies ac on ac.id = cc.company_id
                """ + (status == null ? "" : " where cc.status = ? ") + " order by cc.submitted_at asc, cc.company_id";
        if (status == null) {
            return jdbc.query(sql, (rs, row) -> new AdminCertification(rs.getObject("company_id", UUID.class),
                    rs.getString("registered_company_name"), rs.getString("account_email"), map(rs)));
        }
        return jdbc.query(sql, (rs, row) -> new AdminCertification(rs.getObject("company_id", UUID.class),
                rs.getString("registered_company_name"), rs.getString("account_email"), map(rs)), status.name());
    }

    @Transactional
    public Certification submit(UUID companyId, CertificationRequest request) {
        requireCompany(companyId);
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
        return get(companyId);
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
        if (!Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from auth_companies where id = ?)", Boolean.class, companyId))) throw notFound();
    }

    private static Instant instant(Timestamp timestamp) { return timestamp == null ? null : timestamp.toInstant(); }
    private static String clean(String value) { return value.trim(); }
    private static String cleanNullable(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private static BusinessApiException invalid(String value) { return new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", value); }
    private static BusinessApiException notFound() { return new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Company certification was not found"); }
    private static BusinessApiException versionConflict() { return new BusinessApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT", "Certification was changed by another request"); }
    private static BusinessApiException conflict(String message) { return new BusinessApiException(HttpStatus.CONFLICT, "CERTIFICATION_CONFLICT", message); }
}
