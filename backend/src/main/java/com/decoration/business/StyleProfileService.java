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
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;

import static com.decoration.business.StyleDtos.CompanyStyleProfile;
import static com.decoration.business.StyleDtos.CompanyStyleProfileStore;
import static com.decoration.business.StyleDtos.RecommendationProfile;
import static com.decoration.business.StyleDtos.StyleProfileRequest;

/**
 * 企业风格资料：每个企业一份（company_style_profiles 一行，profiles 存 jsonb 数组）。
 * 写接口按企业隔离；读接口在平台侧汇总「已认证企业」的资料，供 C 端预算推荐使用。
 */
@Service
public class StyleProfileService {
    private static final String BASE_FROM = """
            from company_style_profiles sp
            join company_certifications cert
              on cert.company_id = sp.company_id and cert.status = 'APPROVED'
            left join company_profiles p on p.company_id = sp.company_id
            left join auth_companies c on c.id = sp.company_id and c.is_demo = false
            """;

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public StyleProfileService(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    public CompanyStyleProfile get(UUID companyId) {
        var rows = jdbc.query("""
                select sp.company_id, sp.profiles, sp.version, sp.updated_at, coalesce(p.name, c.name) as company_name
                from company_style_profiles sp
                left join company_profiles p on p.company_id = sp.company_id
                left join auth_companies c on c.id = sp.company_id
                where sp.company_id = ?
                """, (rs, row) -> {
            var name = rs.getString("company_name");
            return new CompanyStyleProfile(rs.getObject("company_id", UUID.class), name,
                    parse(rs.getString("profiles")), rs.getInt("version"), instant(rs));
        }, companyId);
        return rows.isEmpty()
                ? new CompanyStyleProfile(companyId, companyName(companyId), List.of(), 0, null)
                : rows.getFirst();
    }

    @Transactional
    public CompanyStyleProfile replace(UUID companyId, List<StyleProfileRequest> profiles) {
        var normalized = normalize(profiles);
        var now = Timestamp.from(Instant.now());
        var json = serialize(normalized);
        var changed = jdbc.update("""
                update company_style_profiles set profiles = cast(? as jsonb), version = version + 1, updated_at = ?
                where company_id = ?
                """, json, now, companyId);
        if (changed == 0) {
            jdbc.update("""
                    insert into company_style_profiles(company_id, profiles, version, updated_at)
                    values (?, cast(? as jsonb), 0, ?)
                    on conflict (company_id) do update
                    set profiles = excluded.profiles, version = company_style_profiles.version + 1,
                        updated_at = excluded.updated_at
                    """, companyId, json, now);
        }
        return get(companyId);
    }

    /** C 端推荐候选集合：只取已认证企业的资料。 */
    public List<RecommendationProfile> publishedProfiles() {
        return jdbc.query("select sp.profiles, sp.company_id, coalesce(p.name, c.name) as company_name " + BASE_FROM + " where c.is_demo = false and not exists (select 1 from auth_users u where u.company_id = sp.company_id and u.role = 'COMPANY_ADMIN' and u.account_status <> 'ACTIVE')",
                (rs, row) -> {
                    var companyId = rs.getObject("company_id", UUID.class);
                    var companyName = rs.getString("company_name");
                    var items = parse(rs.getString("profiles"));
                    return items.stream()
                            .map(item -> new RecommendationProfile(item.style(), item.name(), item.note(), item.reason(),
                                    item.minBudgetWan(), item.maxBudgetWan(), item.regions(), item.priority(),
                                    companyId, companyName))
                            .toList();
                }).stream().flatMap(List::stream).toList();
    }

    private String companyName(UUID companyId) {
        var rows = jdbc.query("""
                select coalesce(p.name, c.name) as company_name
                from auth_companies c left join company_profiles p on p.company_id = c.id
                where c.id = ?
                """, (rs, row) -> rs.getString("company_name"), companyId);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    /** 同一风格只能出现一次；预算区间颠倒视为非法输入。 */
    private static List<StyleProfileRequest> normalize(List<StyleProfileRequest> profiles) {
        var seen = new LinkedHashSet<String>();
        return profiles.stream().map(item -> {
            var style = item.style().trim();
            if (!seen.add(style)) throw invalid("同一风格只能配置一条资料：" + style);
            var min = item.minBudgetWan();
            var max = item.maxBudgetWan();
            if (max != null && max.compareTo(min) < 0) throw invalid("最高预算不能小于最低预算：" + style);
            var regions = item.regions() == null ? List.<String>of()
                    : item.regions().stream().map(String::trim).filter(value -> !value.isEmpty()).distinct().toList();
            return new StyleProfileRequest(style, item.name().trim(),
                    clean(item.note()), clean(item.reason()),
                    min.stripTrailingZeros(), max == null ? null : max.stripTrailingZeros(),
                    regions, item.priority() == null ? 1 : item.priority());
        }).toList();
    }

    private List<StyleProfileRequest> parse(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return List.of(objectMapper.readValue(json, StyleProfileRequest[].class));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Stored style profiles are not readable", exception);
        }
    }

    private String serialize(List<StyleProfileRequest> profiles) {
        try {
            return objectMapper.writeValueAsString(profiles);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Unable to store style profiles", exception);
        }
    }

    private static Instant instant(java.sql.ResultSet rs) throws java.sql.SQLException {
        var timestamp = rs.getTimestamp("updated_at");
        return timestamp == null ? null : timestamp.toInstant();
    }

    private static String clean(String value) {
        if (value == null) return null;
        var trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static BusinessApiException invalid(String message) {
        return new BusinessApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", message);
    }
}
