package com.decoration.budget;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.JwtRequestPostProcessor;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.sql.DriverManager;
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 预算试算集成测试。
 *
 * <p>回归基准：清空企业报价时，9 个板块合计必须等于前端原 6 项 referenceCosts
 * 的计算总额（BASIC 档 1790–3110 元/㎡ 严格守恒）。
 */
@SpringBootTest
@AutoConfigureMockMvc
class BudgetEstimateIntegrationTest {
    private static final String TEST_SCHEMA = "decoration_test_" + UUID.randomUUID().toString().replace("-", "");
    private static final String DATABASE_URL = env("DATABASE_TEST_URL", "jdbc:postgresql://localhost:5432/decoration");
    private static final String DATABASE_USERNAME = env("DATABASE_TEST_USERNAME", env("DATABASE_USERNAME", "decoration"));
    private static final String DATABASE_PASSWORD = env("DATABASE_TEST_PASSWORD", env("DATABASE_PASSWORD", "decoration"));

    @DynamicPropertySource
    static void configureDatabase(DynamicPropertyRegistry registry) {
        var separator = DATABASE_URL.contains("?") ? "&" : "?";
        registry.add("spring.datasource.url", () -> DATABASE_URL + separator + "currentSchema=" + TEST_SCHEMA);
        registry.add("spring.datasource.username", () -> DATABASE_USERNAME);
        registry.add("spring.datasource.password", () -> DATABASE_PASSWORD);
        registry.add("spring.flyway.schemas", () -> TEST_SCHEMA);
        registry.add("spring.flyway.default-schema", () -> TEST_SCHEMA);
    }

    @AfterAll
    static void dropTestSchema() throws Exception {
        try (var connection = DriverManager.getConnection(DATABASE_URL, DATABASE_USERNAME, DATABASE_PASSWORD);
             var statement = connection.createStatement()) {
            statement.execute("drop schema if exists " + TEST_SCHEMA + " cascade");
        }
    }

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private JwtDecoder jwtDecoder;

    private static JwtRequestPostProcessor token(UUID companyId, String role) {
        return jwt().jwt(jwt -> jwt.claim("companyId", companyId.toString()).claim("roles", java.util.List.of(role)))
                .authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_" + role));
    }

    private static String env(String name, String fallback) {
        var value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }

    @Test
    void estimateWithoutQuotesMatchesLegacyReferenceBands() throws Exception {
        mockMvc.perform(post("/api/v1/budgets/estimate")
                        .contentType("application/json")
                        .content("""
                                {"area":120,"region":"上海","finishLevel":"STANDARD"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dataQuality").value("REFERENCE"))
                .andExpect(jsonPath("$.data.pricingMode").value("LIST"))
                .andExpect(jsonPath("$.data.modelVersion").value("v3"))
                .andExpect(jsonPath("$.data.items.length()").value(9))
                // 9 板块合计 = 1790 × 120 / 3110 × 120（守恒）
                .andExpect(jsonPath("$.data.totalLow").value(214800))
                .andExpect(jsonPath("$.data.totalHigh").value(373200))
                .andExpect(jsonPath("$.data.items[0].source").value("REFERENCE"))
                .andExpect(jsonPath("$.data.items[0].disabled").value(false))
                .andExpect(jsonPath("$.data.items[5].source").value("REFERENCE"));
    }

    @Test
    void estimateExcludesUnrecognizedUnitsAndGiftItems() throws Exception {
        var companyId = UUID.randomUUID();
        jdbc.update("insert into auth_companies(id, name, created_at) values (?, ?, now())", companyId, "Quote Studio");
        jdbc.update("""
                insert into company_certifications(company_id, id, company_name, contact_name, contact_info,
                    service_areas, document_refs, status, version, submitted_at, updated_at, reviewed_by, reviewed_at)
                values (?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, 'APPROVED', 0, now(), now(), ?, now())
                """, companyId, UUID.randomUUID(), "Quote Studio", "A", "a@b.c",
                "[\"Shanghai\"]", "[]", UUID.randomUUID());

        // 单位不可识别 → 不参与计算。
        jdbc.update("""
                insert into material_quotes(id, company_id, name, specification, unit, price, category, region,
                    valid_until, unit_kind, unit_unknown, item_nature, created_at, updated_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, current_date + 300, 'UNKNOWN', true, 'INCLUDED', now(), now())
                """, UUID.randomUUID(), companyId, "bad unit floor", "spec", "mm", 99, "地板", "上海");
        // 赠送项 → 不参与计算。
        jdbc.update("""
                insert into material_quotes(id, company_id, name, specification, unit, price, category, region,
                    valid_until, unit_kind, unit_unknown, item_nature, created_at, updated_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, current_date + 300, 'SQM', false, 'GIFT', now(), now())
                """, UUID.randomUUID(), companyId, "gift floor", "spec", "㎡", 99, "地板", "上海");

        mockMvc.perform(post("/api/v1/budgets/estimate")
                        .contentType("application/json")
                        .content("""
                                {"area":120,"region":"上海","finishLevel":"STANDARD"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dataQuality").value("REFERENCE"))
                .andExpect(jsonPath("$.data.totalLow").value(214800))
                .andExpect(jsonPath("$.data.totalHigh").value(373200));

        jdbc.update("delete from material_quotes where company_id = ?", companyId);
        jdbc.update("delete from company_certifications where company_id = ?", companyId);
        jdbc.update("delete from auth_companies where id = ?", companyId);
    }

    @Test
    void minQuantityRuleLiftsSmallApartments() throws Exception {
        // 水电板块按面积计费，最低 85㎡：60㎡ 的房子按 85㎡ 计，
        // 数量字段仍是原始推算值（46.8），appliedMinQty 标记兜底已生效。
        mockMvc.perform(post("/api/v1/budgets/estimate")
                        .contentType("application/json")
                        .content("""
                                {"area":60,"region":"上海","finishLevel":"STANDARD"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[?(@.itemKey == 'PLUMBING_ELEC')].appliedMinQty").value(true))
                .andExpect(jsonPath("$.data.items[?(@.itemKey == 'PLUMBING_ELEC')].appliedMinQtyRule")
                        .value("水电改造面积不足 85㎡ 按 85㎡ 计算"))
                // 60㎡ 本应 320 × 60 = 19200，兜底后 320 × 85 = 27200
                .andExpect(jsonPath("$.data.items[?(@.itemKey == 'PLUMBING_ELEC')].costLow").value(27200.0))
                .andExpect(jsonPath("$.data.items[?(@.itemKey == 'PLUMBING_ELEC')].costHigh").value(44200.0));
    }

    @Test
    void structureSectionParticipatesByDefault() throws Exception {
        mockMvc.perform(post("/api/v1/budgets/estimate")
                        .contentType("application/json")
                        .content("""
                                {"area":120,"region":"上海","finishLevel":"STANDARD"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[?(@.itemKey == 'STRUCTURE')].disabled").value(false))
                .andExpect(jsonPath("$.data.items[?(@.itemKey == 'STRUCTURE')].costLow").value(6000.0));

        // 用户显式关闭后不计价。
        mockMvc.perform(post("/api/v1/budgets/estimate")
                        .contentType("application/json")
                        .content("""
                                {"area":120,"region":"上海","finishLevel":"STANDARD","disabledItems":["STRUCTURE"]}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[?(@.itemKey == 'STRUCTURE')].disabled").value(true))
                .andExpect(jsonPath("$.data.items[?(@.itemKey == 'STRUCTURE')].costLow").value(0))
                // 关闭后总额应减少 50 × 120 = 6000（低值）
                .andExpect(jsonPath("$.data.totalLow").value(208800));
    }

    @Test
    void savingAndListingBudgetsAreScopedToOwner() throws Exception {
        var ownerA = UUID.randomUUID();
        var ownerB = UUID.randomUUID();
        var body = """
                {"area":100,"region":"上海","finishLevel":"BASIC","projectId":null}
                """;

        var saved = mockMvc.perform(post("/api/v1/budgets")
                        .with(token(ownerA, "PERSONAL_USER"))
                        .contentType("application/json").content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.totalLow").value(179000))
                .andExpect(jsonPath("$.data.dataQuality").value("REFERENCE"))
                .andReturn().getResponse().getContentAsString();
        var id = com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
                .readTree(saved).path("data").path("id").asText();

        // 另一个用户看不到。
        mockMvc.perform(get("/api/v1/budgets").with(token(ownerB, "PERSONAL_USER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isEmpty());

        // 匿名不能保存。
        mockMvc.perform(post("/api/v1/budgets").contentType("application/json").content(body))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(delete("/api/v1/budgets/{id}", id).with(token(ownerB, "PERSONAL_USER")))
                .andExpect(status().isNotFound());

        mockMvc.perform(delete("/api/v1/budgets/{id}", id).with(token(ownerA, "PERSONAL_USER")))
                .andExpect(status().isNoContent());

        jdbc.update("delete from project_budget_estimates where owner_id = ?", ownerA);
    }

    @Test
    void premiumBandScalesFromBasic() throws Exception {
        mockMvc.perform(post("/api/v1/budgets/estimate")
                        .contentType("application/json")
                        .content("""
                                {"area":100,"region":"上海","finishLevel":"PREMIUM"}
                                """))
                .andExpect(status().isOk())
                // 1790 × 1.34 = 2398.6 → 239860；3110 × 1.34 = 4167.4 → 416740
                .andExpect(jsonPath("$.data.totalLow").value(239860))
                .andExpect(jsonPath("$.data.totalHigh").value(416740));
    }
}
