package com.decoration.business;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static com.decoration.business.PublicCaseCatalogDtos.*;

@Service
public class PublicCaseCatalogService {
    private final JdbcTemplate jdbc;

    public PublicCaseCatalogService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional(readOnly = true)
    public Page<PublicCase> list(String query, String style, String city, BigDecimal minArea, BigDecimal maxArea,
                                 BigDecimal minBudget, BigDecimal maxBudget, int page, int size) {
        var where = new StringBuilder(" where c.status = 'published' and cert.status = 'APPROVED'");
        var args = new ArrayList<Object>();
        if (query != null && !query.isBlank()) {
            where.append(" and (lower(c.title) like ? or lower(coalesce(c.style, '')) like ? or lower(coalesce(p.name, a.name)) like ?)");
            var term = "%" + query.trim().toLowerCase() + "%";
            args.add(term); args.add(term); args.add(term);
        }
        if (style != null && !style.isBlank()) { where.append(" and c.style = ?"); args.add(style.trim()); }
        if (city != null && !city.isBlank()) { where.append(" and p.city = ?"); args.add(city.trim()); }
        if (minArea != null) { where.append(" and c.area >= ?"); args.add(minArea); }
        if (maxArea != null) { where.append(" and c.area <= ?"); args.add(maxArea); }
        if (minBudget != null) { where.append(" and c.budget >= ?"); args.add(minBudget); }
        if (maxBudget != null) { where.append(" and c.budget <= ?"); args.add(maxBudget); }
        var from = " from business_cases c join company_certifications cert on cert.company_id = c.company_id "
                + "join auth_companies a on a.id = c.company_id left join company_profiles p on p.company_id = c.company_id";
        where.append(" and a.is_demo = false");
        var total = jdbc.queryForObject("select count(*)" + from + where, Long.class, args.toArray());
        var pageArgs = new ArrayList<>(args);
        pageArgs.add(size); pageArgs.add((long) (page - 1) * size);
        var rows = jdbc.query("""
                select c.id, c.title, c.area, c.style, c.budget, c.company_id,
                       coalesce(p.name, a.name) as company_name, p.city, p.services, c.updated_at
                """ + from + where + " order by c.updated_at desc, c.id limit ? offset ?",
                (rs, row) -> new PublicCase(rs.getObject("id", UUID.class), rs.getString("title"), rs.getBigDecimal("area"),
                        rs.getString("style"), rs.getBigDecimal("budget"), rs.getObject("company_id", UUID.class).toString(),
                        rs.getString("company_name"), rs.getString("city"), rs.getString("services"), List.of(),
                        instant(rs.getTimestamp("updated_at"))), pageArgs.toArray());
        var items = rows.stream().map(this::withFiles).toList();
        var count = total == null ? 0L : total;
        return new Page<>(items, new PageMeta(page, size, count, (int) Math.ceil(count / (double) size)));
    }

    @Transactional(readOnly = true)
    public List<CaseFile> filesForPublishedCase(UUID caseId) {
        return jdbc.query("""
                select a.id, a.file_name, a.media_type
                from business_cases c
                join company_certifications cert on cert.company_id = c.company_id and cert.status = 'APPROVED'
                join business_case_files cf on cf.company_id = c.company_id and cf.case_id = c.id
                join business_assets a on a.company_id = cf.company_id and a.id = cf.file_id
                join auth_companies ac on ac.id = c.company_id and ac.is_demo = false
                where c.id = ? and c.status = 'published'
                order by cf.position
                """, (rs, row) -> new CaseFile(rs.getObject("id", UUID.class), rs.getString("file_name"), rs.getString("media_type")), caseId);
    }

    private PublicCase withFiles(PublicCase item) {
        var files = jdbc.query("""
                select a.id, a.file_name, a.media_type
                from business_case_files cf join business_assets a on a.company_id = cf.company_id and a.id = cf.file_id
                where cf.case_id = ? order by cf.position
                """, (rs, row) -> new CaseFile(rs.getObject("id", UUID.class), rs.getString("file_name"), rs.getString("media_type")), item.id());
        return new PublicCase(item.id(), item.title(), item.area(), item.style(), item.budget(), item.companyId(),
                item.companyName(), item.city(), item.services(), files, item.updatedAt());
    }

    private static Instant instant(java.sql.Timestamp value) { return value == null ? null : value.toInstant(); }
}
