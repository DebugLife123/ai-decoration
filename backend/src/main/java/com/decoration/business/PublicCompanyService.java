package com.decoration.business;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

import static com.decoration.business.PublicCompanyDtos.PublicCompany;

@Service
public class PublicCompanyService {
    private final JdbcTemplate jdbc;

    public PublicCompanyService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional(readOnly = true)
    public PublicCompany get(UUID companyId) {
        var rows = jdbc.query("""
                select c.id, coalesce(p.name, c.name) as name, p.city, p.services, p.intro,
                       p.service_areas, p.business_hours, p.public_contact_name, p.public_contact_info,
                       p.logo_asset_id, p.storefront_asset_id, p.updated_at
                from auth_companies c
                join company_certifications cert on cert.company_id = c.id and cert.status = 'APPROVED'
                left join company_profiles p on p.company_id = c.id
                where c.id = ? and c.is_demo = false
                  and not exists (select 1 from auth_users u where u.company_id = c.id and u.role = 'COMPANY_ADMIN' and u.account_status <> 'ACTIVE')
                """, (rs, row) -> new PublicCompany(
                rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("city"),
                rs.getString("services"), rs.getString("intro"), splitAreas(rs.getString("service_areas")),
                rs.getString("business_hours"), rs.getString("public_contact_name"),
                rs.getString("public_contact_info"), rs.getObject("logo_asset_id", UUID.class),
                rs.getObject("storefront_asset_id", UUID.class), 0, 0, "APPROVED",
                rs.getTimestamp("updated_at") == null ? null : rs.getTimestamp("updated_at").toInstant()), companyId);
        if (rows.isEmpty()) throw new com.decoration.shared.api.BusinessApiException(org.springframework.http.HttpStatus.NOT_FOUND, "NOT_FOUND", "企业主页不存在");
        var base = rows.getFirst();
        var caseCount = jdbc.queryForObject("select count(*) from business_cases where company_id = ? and status = 'published'", Long.class, companyId);
        var materialCount = jdbc.queryForObject("""
                select count(*) from material_quotes m
                where m.company_id = ? and m.valid_until >= current_date and m.admin_hidden = false and m.review_status = 'APPROVED'
                and exists (select 1 from company_certifications c where c.company_id = m.company_id and c.status = 'APPROVED')
                """, Long.class, companyId);
        return new PublicCompany(base.companyId(), base.name(), base.city(), base.services(), base.intro(), base.serviceAreas(),
                base.businessHours(), base.publicContactName(), base.publicContactInfo(), base.logoAssetId(), base.storefrontAssetId(),
                caseCount == null ? 0 : caseCount, materialCount == null ? 0 : materialCount, base.certificationStatus(), base.updatedAt());
    }

    private static List<String> splitAreas(String value) {
        if (value == null || value.isBlank()) return List.of();
        return Arrays.stream(value.split("[,，、\\n]"))
                .map(String::trim).filter(item -> !item.isBlank()).distinct().limit(20).toList();
    }
}
