package com.decoration.business;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class BusinessCompletenessService {
    private final JdbcTemplate jdbc;

    public BusinessCompletenessService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional(readOnly = true)
    public Completeness get(UUID companyId) {
        var profile = jdbc.query("""
                select exists(select 1 from company_profiles
                    where company_id = ? and nullif(trim(public_contact_name), '') is not null
                      and nullif(trim(public_contact_info), '') is not null)
                """, (ResultSetExtractor<Boolean>) rs -> { rs.next(); return rs.getBoolean(1); }, companyId);
        var certificationAssets = jdbc.queryForObject("""
                select count(distinct a.id) from company_certifications c
                cross join lateral jsonb_array_elements_text(
                    case when jsonb_typeof(c.document_refs) = 'array' then c.document_refs else '[]'::jsonb end
                ) ref
                join business_assets a on a.company_id = c.company_id and a.id::text = ref.value
                where c.company_id = ?
                """, Integer.class, companyId);
        var caseCounts = jdbc.queryForObject("""
                select count(distinct c.id) as total,
                       count(distinct c.id) filter (where exists (
                           select 1 from business_case_files cf
                           join business_assets a on a.company_id = cf.company_id and a.id = cf.file_id
                           where cf.company_id = c.company_id and cf.case_id = c.id
                             and (a.media_type like 'image/%' or lower(a.file_name) like '%.bmp')
                       )) as with_images
                from business_cases c where c.company_id = ?
                """, (rs, row) -> new int[]{rs.getInt("total"), rs.getInt("with_images")}, companyId);
        var counts = caseCounts == null ? new int[]{0, 0} : caseCounts;
        return new Completeness(certificationAssets == null ? 0 : certificationAssets, counts[0], counts[1], profile);
    }

    public record Completeness(int certificationMaterialCount, int caseCount, int casesWithImages,
                               boolean hasPublicContact) { }
}
