package com.decoration.business;

import com.decoration.shared.api.BusinessApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Service
public class AdminMarketplaceService {
    private final JdbcTemplate jdbc;
    private final AdminAuditLogService audit;

    public AdminMarketplaceService(JdbcTemplate jdbc, AdminAuditLogService audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    public Page listQuotes(String query, String visibility, int requestedPage, int requestedSize) {
        return listQuotes(query, visibility, null, requestedPage, requestedSize);
    }

    public Page listQuotes(String query, String visibility, UUID companyId, int requestedPage, int requestedSize) {
        var page = Math.max(1, requestedPage);
        var size = Math.max(1, Math.min(100, requestedSize));
        var where = new StringBuilder(" where 1 = 1");
        var args = new java.util.ArrayList<Object>();
        if (query != null && !query.isBlank()) {
            where.append(" and (lower(m.name) like ? or lower(m.brand) like ? or lower(m.category) like ? or lower(coalesce(p.name, c.name)) like ?)");
            var pattern = "%" + query.trim().toLowerCase() + "%";
            args.add(pattern); args.add(pattern); args.add(pattern); args.add(pattern);
        }
        if (companyId != null) {
            where.append(" and m.company_id = ?");
            args.add(companyId);
        }
        if ("PUBLISHED".equals(visibility)) where.append(" and m.review_status = 'APPROVED' and not m.admin_hidden and m.valid_until >= current_date and cert.status = 'APPROVED'");
        else if ("HIDDEN".equals(visibility)) where.append(" and m.admin_hidden");
        else if ("EXPIRED".equals(visibility)) where.append(" and m.valid_until < current_date");
        else if ("PENDING".equals(visibility)) where.append(" and m.review_status = 'PENDING'");
        else if ("REJECTED".equals(visibility)) where.append(" and m.review_status = 'REJECTED'");
        var from = " from material_quotes m join auth_companies c on c.id = m.company_id "
                + "left join company_profiles p on p.company_id = m.company_id "
                + "left join company_certifications cert on cert.company_id = m.company_id";
        var total = jdbc.queryForObject("select count(*)" + from + where, Long.class, args.toArray());
        var queryArgs = new java.util.ArrayList<>(args);
        queryArgs.add(size); queryArgs.add((long) (page - 1) * size);
        var items = jdbc.query("""
                select m.id, m.company_id, coalesce(p.name, c.name) company_name,
                    coalesce(cert.status, 'NOT_SUBMITTED') certification_status,
                    m.name, m.specification, m.brand, m.category, m.region, m.unit, m.price,
                    m.valid_until, m.admin_hidden, m.admin_hidden_reason, m.updated_at, c.is_demo,
                    m.review_status, m.review_note,
                    coalesce((select string_agg(style_key, ', ' order by position) from material_quote_styles where quote_id = m.id), '') style_keys
                """ + from + where + " order by m.updated_at desc, m.id limit ? offset ?",
                (rs, row) -> new Quote(rs.getObject("id", UUID.class), rs.getObject("company_id", UUID.class),
                        rs.getString("company_name"), rs.getString("certification_status"), rs.getString("name"),
                        rs.getString("specification"), rs.getString("brand"), rs.getString("category"),
                        rs.getString("region"), rs.getString("unit"), rs.getBigDecimal("price"),
                        rs.getObject("valid_until", LocalDate.class), rs.getBoolean("admin_hidden"),
                        rs.getString("admin_hidden_reason"), rs.getTimestamp("updated_at").toInstant(), rs.getBoolean("is_demo"),
                        rs.getString("review_status"), rs.getString("review_note"), rs.getString("style_keys")), queryArgs.toArray());
        var count = total == null ? 0 : total;
        return new Page(items, page, size, count, (int) Math.ceil(count / (double) size));
    }

    @Transactional
    public Quote setVisibility(UUID quoteId, UUID actorId, VisibilityRequest request) {
        var rows = jdbc.query("""
                select m.company_id, m.name, m.admin_hidden, coalesce(p.name, c.name) company_name
                from material_quotes m join auth_companies c on c.id = m.company_id
                left join company_profiles p on p.company_id = m.company_id where m.id = ? for update of m
                """, (rs, row) -> new Object[]{rs.getObject("company_id", UUID.class), rs.getString("name"),
                rs.getBoolean("admin_hidden"), rs.getString("company_name")}, quoteId);
        if (rows.isEmpty()) throw new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Material quote was not found");
        var current = rows.getFirst();
        var hidden = Boolean.TRUE.equals(request.hidden());
        var reason = hidden && request.reason() != null && !request.reason().isBlank() ? request.reason().trim() : null;
        jdbc.update("update material_quotes set admin_hidden = ?, admin_hidden_reason = ?, updated_at = ? where id = ?",
                hidden, reason, java.sql.Timestamp.from(Instant.now()), quoteId);
        audit.record(actorId, "MATERIAL_MODERATION", "MATERIAL_QUOTE", quoteId,
                (hidden ? "下架" : "恢复展示") + "材料报价：" + current[3] + " / " + current[1]
                        + (hidden && reason != null ? "；原因：" + reason : ""));
        return jdbc.query("""
                select m.id, m.company_id, coalesce(p.name, c.name) company_name,
                    coalesce(cert.status, 'NOT_SUBMITTED') certification_status,
                    m.name, m.specification, m.brand, m.category, m.region, m.unit, m.price,
                    m.valid_until, m.admin_hidden, m.admin_hidden_reason, m.updated_at, c.is_demo,
                    m.review_status, m.review_note,
                    coalesce((select string_agg(style_key, ', ' order by position) from material_quote_styles where quote_id = m.id), '') style_keys
                from material_quotes m join auth_companies c on c.id = m.company_id
                left join company_profiles p on p.company_id = m.company_id
                left join company_certifications cert on cert.company_id = m.company_id where m.id = ?
                """, (rs, row) -> mapQuote(rs), quoteId).getFirst();
    }

    @Transactional
    public Quote reviewQuote(UUID quoteId, UUID actorId, ReviewRequest request) {
        var status = request.status().trim().toUpperCase();
        if (!List.of("APPROVED", "REJECTED").contains(status)) {
            throw new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REVIEW_STATUS", "审核状态只能是通过或驳回");
        }
        var note = request.reviewNote() == null || request.reviewNote().isBlank() ? null : request.reviewNote().trim();
        if ("REJECTED".equals(status) && note == null) {
            throw new BusinessApiException(HttpStatus.BAD_REQUEST, "REVIEW_NOTE_REQUIRED", "驳回时请填写审核意见");
        }
        var rows = jdbc.query("select name, review_status from material_quotes where id = ? for update",
                (rs, row) -> new String[]{rs.getString("name"), rs.getString("review_status")}, quoteId);
        if (rows.isEmpty()) throw new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Material quote was not found");
        jdbc.update("update material_quotes set review_status = ?, review_note = ?, reviewed_at = ?, reviewed_by = ?, updated_at = ? where id = ?",
                status, note, java.sql.Timestamp.from(Instant.now()), actorId, java.sql.Timestamp.from(Instant.now()), quoteId);
        audit.record(actorId, "MATERIAL_REVIEW", "MATERIAL_QUOTE", quoteId,
                ("APPROVED".equals(status) ? "审核通过" : "审核驳回") + "材料报价：" + rows.getFirst()[0]
                        + (note == null ? "" : "；意见：" + note));
        return jdbc.query("""
                select m.id, m.company_id, coalesce(p.name, c.name) company_name,
                    coalesce(cert.status, 'NOT_SUBMITTED') certification_status,
                    m.name, m.specification, m.brand, m.category, m.region, m.unit, m.price,
                    m.valid_until, m.admin_hidden, m.admin_hidden_reason, m.updated_at, c.is_demo,
                    m.review_status, m.review_note,
                    coalesce((select string_agg(style_key, ', ' order by position) from material_quote_styles where quote_id = m.id), '') style_keys
                from material_quotes m join auth_companies c on c.id = m.company_id
                left join company_profiles p on p.company_id = m.company_id
                left join company_certifications cert on cert.company_id = m.company_id where m.id = ?
                """, (rs, row) -> mapQuote(rs), quoteId).getFirst();
    }

    private static Quote mapQuote(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Quote(rs.getObject("id", UUID.class), rs.getObject("company_id", UUID.class),
                rs.getString("company_name"), rs.getString("certification_status"), rs.getString("name"),
                rs.getString("specification"), rs.getString("brand"), rs.getString("category"),
                rs.getString("region"), rs.getString("unit"), rs.getBigDecimal("price"),
                rs.getObject("valid_until", LocalDate.class), rs.getBoolean("admin_hidden"),
                rs.getString("admin_hidden_reason"), rs.getTimestamp("updated_at").toInstant(), rs.getBoolean("is_demo"),
                rs.getString("review_status"), rs.getString("review_note"), rs.getString("style_keys"));
    }

    public record Quote(UUID id, UUID companyId, String companyName, String certificationStatus,
                        String name, String specification, String brand, String category, String region,
                        String unit, BigDecimal price, LocalDate validUntil, boolean hidden,
                        String hiddenReason, Instant updatedAt, boolean demo, String reviewStatus,
                        String reviewNote, String styleKeys) { }
    public record Page(List<Quote> items, int page, int size, long total, int totalPages) { }
    public record VisibilityRequest(@jakarta.validation.constraints.NotNull Boolean hidden,
                                   @jakarta.validation.constraints.Size(max = 500) String reason) { }
    public record ReviewRequest(@jakarta.validation.constraints.NotBlank String status,
                                @jakarta.validation.constraints.Size(max = 500) String reviewNote) { }
}
