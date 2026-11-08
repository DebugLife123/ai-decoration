package com.decoration.business;

import com.decoration.shared.api.BusinessApiException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static com.decoration.business.BusinessDtos.*;
import static com.decoration.business.CertificationDtos.Certification;
import static com.decoration.business.StyleDtos.CompanyStyleProfile;

@Service
public class AdminCompanyDetailService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final CertificationService certifications;
    private final BusinessDataService businessData;
    private final StyleProfileService styleProfiles;
    private final BusinessAssetService businessAssets;

    public AdminCompanyDetailService(JdbcTemplate jdbc, ObjectMapper objectMapper, CertificationService certifications,
                                     BusinessDataService businessData, StyleProfileService styleProfiles,
                                     BusinessAssetService businessAssets) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.certifications = certifications;
        this.businessData = businessData;
        this.styleProfiles = styleProfiles;
        this.businessAssets = businessAssets;
    }

    public CompanyDetail get(UUID companyId) {
        var company = jdbc.query("""
                select c.id, c.name registered_name,
                    coalesce((select json_agg(u.email order by u.created_at) from auth_users u where u.company_id = c.id), '[]'::json) accounts
                from auth_companies c where c.id = ?
                """, (rs, row) -> new Object[]{rs.getString("registered_name"), rs.getString("accounts")}, companyId);
        if (company.isEmpty()) throw new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Company was not found");
        var profile = businessData.getProfile(companyId);
        var cases = jdbc.query("""
                select id, title, area, style, budget, status, version, created_at, updated_at
                from business_cases where company_id = ? order by updated_at desc, id
                """, (rs, row) -> {
            var id = rs.getObject("id", UUID.class);
            var files = jdbc.query("""
                    select a.id, a.file_name, a.media_type, a.object_key, a.created_at
                    from business_case_files f join business_assets a on a.company_id = f.company_id and a.id = f.file_id
                    where f.case_id = ? order by f.position
                    """, this::mapAsset, id);
            return new CaseItem(id, rs.getString("title"), rs.getBigDecimal("area"), rs.getString("style"),
                    rs.getBigDecimal("budget"), rs.getString("status"), instant(rs, "created_at"),
                    instant(rs, "updated_at"), files);
        }, companyId);
        var materialQuotes = jdbc.query("""
                select id, name, specification, brand, category, region, unit, price, valid_until,
                    admin_hidden, admin_hidden_reason, updated_at
                from material_quotes where company_id = ? order by updated_at desc, id
                """, (rs, row) -> {
            var id = rs.getObject("id", UUID.class);
            var images = jdbc.query("""
                    select a.id, a.file_name, a.media_type, a.object_key, a.created_at
                    from material_quote_images i join business_assets a on a.company_id = i.company_id and a.id = i.image_id
                    where i.quote_id = ? order by i.position
                    """, this::mapAsset, id);
            return new MaterialItem(id, rs.getString("name"), rs.getString("specification"), rs.getString("brand"),
                    rs.getString("category"), rs.getString("region"), rs.getString("unit"), rs.getBigDecimal("price"),
                    rs.getObject("valid_until", LocalDate.class), rs.getBoolean("admin_hidden"),
                    rs.getString("admin_hidden_reason"), instant(rs, "updated_at"), images);
        }, companyId);
        var laborQuotes = jdbc.query("""
                select labor_type, unit, price, region, valid_until, updated_at from labor_quotes
                where company_id = ? order by updated_at desc
                """, (rs, row) -> new LaborItem(rs.getString("labor_type"), rs.getString("unit"),
                rs.getBigDecimal("price"), rs.getString("region"), rs.getObject("valid_until", LocalDate.class),
                instant(rs, "updated_at")), companyId);
        var assets = jdbc.query("""
                select id, file_name, media_type, object_key, created_at from business_assets
                where company_id = ? order by created_at desc, id
                """, this::mapAsset, companyId);
        return new CompanyDetail(companyId, (String) company.getFirst()[0], parseEmails((String) company.getFirst()[1]),
                certifications.get(companyId), profile, styleProfiles.get(companyId), cases,
                materialQuotes, laborQuotes, assets);
    }

    private List<String> parseEmails(String json) {
        try { return objectMapper.readValue(json, new TypeReference<>() { }); }
        catch (JsonProcessingException exception) {
            throw new IllegalStateException("Stored account list is invalid", exception);
        }
    }

    private AssetItem mapAsset(java.sql.ResultSet rs, int row) throws java.sql.SQLException {
        var name = rs.getString("file_name");
        var mediaType = BusinessAssetService.normalizedMediaType(name, rs.getString("media_type"));
        var objectKey = rs.getString("object_key");
        return new AssetItem(rs.getObject("id", UUID.class), name, mediaType,
                instant(rs, "created_at"), businessAssets.isFileAvailable(objectKey));
    }

    private static Instant instant(java.sql.ResultSet rs, String column) throws java.sql.SQLException {
        var value = rs.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }

    public record CompanyDetail(UUID companyId, String registeredName, List<String> accountEmails,
                                Certification certification, Profile profile, CompanyStyleProfile styleProfile,
                                List<CaseItem> cases, List<MaterialItem> materialQuotes,
                                List<LaborItem> laborQuotes, List<AssetItem> assets) { }
    public record AssetItem(UUID id, String fileName, String mediaType, Instant uploadedAt, boolean available) { }
    public record CaseItem(UUID id, String title, BigDecimal area, String style, BigDecimal budget,
                           String status, Instant createdAt, Instant updatedAt, List<AssetItem> files) { }
    public record MaterialItem(UUID id, String name, String specification, String brand, String category,
                               String region, String unit, BigDecimal price, LocalDate validUntil,
                               boolean hidden, String hiddenReason, Instant updatedAt, List<AssetItem> images) { }
    public record LaborItem(String type, String unit, BigDecimal price, String region,
                            LocalDate validUntil, Instant updatedAt) { }
}
