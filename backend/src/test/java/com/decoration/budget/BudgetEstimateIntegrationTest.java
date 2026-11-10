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
                .andExpect(jsonPath("$.data.modelVersion").value("v5"))
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
                        .header("Idempotency-Key", "budget-save-" + UUID.randomUUID())
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

    // ---------- 阶段 2a-3：材料与人工分离计价 ----------

    /** 造一家已认证企业 + 一条 GROUND 材料报价（category 必须是「地板」，才会被 GROUND 板块匹配到）。 */
    private UUID seedGroundMaterialQuote(String price, String materialName) {
        var companyId = UUID.randomUUID();
        jdbc.update("insert into auth_companies(id, name, created_at) values (?, ?, now())", companyId, "Mat " + materialName);
        jdbc.update("""
                insert into company_certifications(company_id, id, company_name, contact_name, contact_info,
                    service_areas, document_refs, status, version, submitted_at, updated_at, reviewed_by, reviewed_at)
                values (?, ?, ?, 'A', 'a@b.c', ?::jsonb, '[]'::jsonb, 'APPROVED', 0, now(), now(), ?, now())
                """, companyId, UUID.randomUUID(), "Mat " + materialName, "[\"上海\"]", UUID.randomUUID());
        jdbc.update("""
                insert into material_quotes(id, company_id, name, specification, unit, price, category, region,
                    valid_until, unit_kind, unit_unknown, item_nature, created_at, updated_at)
                values (?, ?, ?, 'spec', '㎡', ?::numeric, '地板', '上海', current_date + 300, 'SQM', false, 'INCLUDED', now(), now())
                """, UUID.randomUUID(), companyId, materialName, price);
        return companyId;
    }

    /** 造一家已认证企业 + 一条 GROUND 人工报价。 */
    private UUID seedGroundLaborQuote(String price) {
        var companyId = UUID.randomUUID();
        jdbc.update("insert into auth_companies(id, name, created_at) values (?, ?, now())", companyId, "Lab " + price);
        jdbc.update("""
                insert into company_certifications(company_id, id, company_name, contact_name, contact_info,
                    service_areas, document_refs, status, version, submitted_at, updated_at, reviewed_by, reviewed_at)
                values (?, ?, ?, 'A', 'a@b.c', ?::jsonb, '[]'::jsonb, 'APPROVED', 0, now(), now(), ?, now())
                """, companyId, UUID.randomUUID(), "Lab " + price, "[\"上海\"]", UUID.randomUUID());
        jdbc.update("""
                insert into labor_quotes(id, company_id, labor_type, unit, price, region,
                    valid_until, unit_kind, unit_unknown, item_nature, created_at, updated_at)
                values (?, ?, '瓦匠工', '㎡', ?::numeric, '上海', current_date + 300, 'SQM', false, 'INCLUDED', now(), now())
                """, UUID.randomUUID(), companyId, price);
        return companyId;
    }

    private void dropCompany(UUID companyId) {
        jdbc.update("delete from material_quotes where company_id = ?", companyId);
        jdbc.update("delete from labor_quotes where company_id = ?", companyId);
        jdbc.update("delete from company_certifications where company_id = ?", companyId);
        jdbc.update("delete from auth_companies where id = ?", companyId);
    }

    /**
     * 验收 1 与 3：每板块可拆材料/人工且两者之和 = 小计；
     * 只有材料报价、没有人工报价时，人工部分走基准而不是 0。
     */
    @Test
    void splitsMaterialAndLaborAndKeepsLaborOnReferenceWhenOnlyMaterialIsQuoted() throws Exception {
        var companies = new java.util.ArrayList<UUID>();
        try {
            // 只有材料：3 家企业，价格 100 / 110 / 120。
            companies.add(seedGroundMaterialQuote("100", "FloorA"));
            companies.add(seedGroundMaterialQuote("110", "FloorB"));
            companies.add(seedGroundMaterialQuote("120", "FloorC"));

            var body = mockMvc.perform(post("/api/v1/budgets/estimate")
                            .contentType("application/json")
                            .content("""
                                    {"area":120,"region":"上海","finishLevel":"STANDARD"}
                                    """))
                    .andExpect(status().isOk())
                    // 材料有真报价、人工没有 → 整体是 PARTIAL，不能退化成 REFERENCE。
                    .andExpect(jsonPath("$.data.dataQuality").value("PARTIAL"))
                    .andExpect(jsonPath("$.data.items[?(@.itemKey == 'GROUND')].source").value("PARTIAL"))
                    .andExpect(jsonPath("$.data.items[?(@.itemKey == 'GROUND')].materialSource").value("QUOTED"))
                    .andExpect(jsonPath("$.data.items[?(@.itemKey == 'GROUND')].laborSource").value("REFERENCE"))
                    // 材料单价区间就是 P25/P75（100~120 的线性插值）。
                    .andExpect(jsonPath("$.data.items[?(@.itemKey == 'GROUND')].materialPriceLow").value(105.0))
                    .andExpect(jsonPath("$.data.items[?(@.itemKey == 'GROUND')].materialPriceHigh").value(115.0))
                    .andReturn().getResponse().getContentAsString();

            var tree = com.fasterxml.jackson.databind.json.JsonMapper.builder().build().readTree(body);
            var ground = tree.path("data").path("items").get(0);
            var materialCostLow = ground.path("materialCostLow").decimalValue();
            var laborCostLow = ground.path("laborCostLow").decimalValue();
            var costLow = ground.path("costLow").decimalValue();

            // 验收 3：人工不是 0，而是基准回填。
            org.junit.jupiter.api.Assertions.assertTrue(laborCostLow.signum() > 0,
                    "只有材料报价时人工部分必须走基准，实际为 " + laborCostLow);
            // 验收 1：两路之和 = 小计。
            org.junit.jupiter.api.Assertions.assertEquals(0,
                    materialCostLow.add(laborCostLow).compareTo(costLow),
                    "材料 " + materialCostLow + " + 人工 " + laborCostLow + " 应等于小计 " + costLow);
        } finally {
            companies.forEach(this::dropCompany);
        }
    }

    /**
     * 验收 2：材料报价 +10%，只有 materialCost 变，laborCost 不动。
     *
     * <p>人工报价固定，材料报价整体上浮一成，人工成本必须逐位不变。
     */
    @Test
    void raisingMaterialPricesMovesOnlyMaterialCost() throws Exception {
        var companies = new java.util.ArrayList<UUID>();
        try {
            companies.add(seedGroundLaborQuote("50"));
            companies.add(seedGroundLaborQuote("52"));
            companies.add(seedGroundLaborQuote("54"));
            companies.add(seedGroundMaterialQuote("100", "BaseA"));
            companies.add(seedGroundMaterialQuote("110", "BaseB"));
            companies.add(seedGroundMaterialQuote("120", "BaseC"));

            var before = mockMvc.perform(post("/api/v1/budgets/estimate")
                            .contentType("application/json")
                            .content("""
                                    {"area":120,"region":"上海","finishLevel":"STANDARD"}
                                    """))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.items[?(@.itemKey == 'GROUND')].materialSource").value("QUOTED"))
                    .andExpect(jsonPath("$.data.items[?(@.itemKey == 'GROUND')].laborSource").value("QUOTED"))
                    .andReturn().getResponse().getContentAsString();

            // 材料整体 +10%。
            jdbc.update("update material_quotes set price = price * 1.1 where category = '地板' and region = '上海'");

            var after = mockMvc.perform(post("/api/v1/budgets/estimate")
                            .contentType("application/json")
                            .content("""
                                    {"area":120,"region":"上海","finishLevel":"STANDARD"}
                                    """))
                    .andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString();

            var mapper = com.fasterxml.jackson.databind.json.JsonMapper.builder().build();
            var beforeGround = mapper.readTree(before).path("data").path("items").get(0);
            var afterGround = mapper.readTree(after).path("data").path("items").get(0);

            // 人工成本与人工单价逐位不变。
            org.junit.jupiter.api.Assertions.assertEquals(0, beforeGround.path("laborCostLow").decimalValue()
                    .compareTo(afterGround.path("laborCostLow").decimalValue()), "材料涨价不应影响人工成本");
            org.junit.jupiter.api.Assertions.assertEquals(0, beforeGround.path("laborCostHigh").decimalValue()
                    .compareTo(afterGround.path("laborCostHigh").decimalValue()), "材料涨价不应影响人工成本（高值）");
            org.junit.jupiter.api.Assertions.assertEquals(0, beforeGround.path("laborPriceLow").decimalValue()
                    .compareTo(afterGround.path("laborPriceLow").decimalValue()), "材料涨价不应影响人工单价");
            // 材料成本必须真的变了。
            org.junit.jupiter.api.Assertions.assertTrue(afterGround.path("materialCostLow").decimalValue()
                    .compareTo(beforeGround.path("materialCostLow").decimalValue()) > 0, "材料涨价后材料成本应上升");
        } finally {
            companies.forEach(this::dropCompany);
        }
    }

    // ---------- 阶段 2a-4：套餐式计价 ----------

    /**
     * 验收 1：90㎡ 与 60㎡ 的基础价完全相同（最低计价面积 90㎡ 兜底生效）。
     *
     * <p>平台通用套餐是 1180 元/㎡、最低 90㎡：
     * 90㎡ → 实测面积 70.20 + 0.24 × 41.74 = 80.22，低于 90，按 90 计 → 106200；
     * 60㎡ → 实测面积 46.80 + 0.24 × 34.08 = 54.98，同样低于 90 → 仍是 106200。
     */
    @Test
    void packageModeAppliesMinimumAreaFloor() throws Exception {
        var body90 = mockMvc.perform(post("/api/v1/budgets/estimate")
                        .contentType("application/json")
                        .content("""
                                {"area":90,"region":"上海","pricingMode":"PACKAGE"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.pricingMode").value("PACKAGE"))
                .andExpect(jsonPath("$.data.modelVersion").value("v5"))
                .andExpect(jsonPath("$.data.dataQuality").value("PACKAGE"))
                .andExpect(jsonPath("$.data.packageProduct.minAreaApplied").value(true))
                .andExpect(jsonPath("$.data.packageProduct.minArea").value(90))
                .andExpect(jsonPath("$.data.packageProduct.billableArea").value(90))
                .andExpect(jsonPath("$.data.packageProduct.pricePerSqm").value(1180))
                .andExpect(jsonPath("$.data.totalLow").value(106200))
                .andExpect(jsonPath("$.data.totalHigh").value(106200))
                // 套餐模式不返回逐板块清单，避免「套餐价 + 分项」被前端叠加。
                .andExpect(jsonPath("$.data.items.length()").value(0))
                .andExpect(jsonPath("$.data.addonItems.length()").value(0))
                .andReturn().getResponse().getContentAsString();

        var body60 = mockMvc.perform(post("/api/v1/budgets/estimate")
                        .contentType("application/json")
                        .content("""
                                {"area":60,"region":"上海","pricingMode":"PACKAGE"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.packageProduct.minAreaApplied").value(true))
                .andExpect(jsonPath("$.data.totalLow").value(106200))
                .andReturn().getResponse().getContentAsString();

        var mapper = com.fasterxml.jackson.databind.json.JsonMapper.builder().build();
        // 验收 1 的实质：两个不同输入拿到同一个基础价。
        org.junit.jupiter.api.Assertions.assertEquals(
                mapper.readTree(body90).path("data").path("totalLow").decimalValue(),
                mapper.readTree(body60).path("data").path("totalLow").decimalValue(),
                "90㎡ 与 60㎡ 都应兜底到 90㎡，基础价必须相同");
    }

    /**
     * 验收 2：套餐模式只出「套餐价 + 增项」，不出现家具制作、结构改造等分项清单。
     *
     * <p>120㎡ 的实测框架面积 = 93.60 + 0.24 × 48.20 = 105.17，
     * 套餐价 = 1180 × 105.17 = 124100.60。
     * 显式点名 CARPENTRY 作为增项：STANDARD 档基准 240–420 元/㎡ × 120㎡ = 28800–50400。
     */
    @Test
    void packageModeSeparatesAddonsAndKeepsListItemsOut() throws Exception {
        mockMvc.perform(post("/api/v1/budgets/estimate")
                        .contentType("application/json")
                        .content("""
                                {"area":120,"region":"上海","finishLevel":"STANDARD",
                                 "pricingMode":"PACKAGE","enabledItems":["CARPENTRY"]}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.pricingMode").value("PACKAGE"))
                .andExpect(jsonPath("$.data.packageProduct.minAreaApplied").value(false))
                .andExpect(jsonPath("$.data.packageProduct.measuredArea").value(105.17))
                .andExpect(jsonPath("$.data.packageProduct.baseCostLow").value(124100.60))
                // 套餐内清单 7 项，且刻意不含 CARPENTRY / STRUCTURE。
                .andExpect(jsonPath("$.data.packageItems.length()").value(7))
                .andExpect(jsonPath("$.data.packageItems[?(@.itemKey == 'CARPENTRY')]").isEmpty())
                .andExpect(jsonPath("$.data.packageItems[?(@.itemKey == 'STRUCTURE')]").isEmpty())
                // 增项只有点名的那一项，独立成列，不与套餐价混在一起。
                .andExpect(jsonPath("$.data.addonItems.length()").value(1))
                .andExpect(jsonPath("$.data.addonItems[0].itemKey").value("CARPENTRY"))
                .andExpect(jsonPath("$.data.addonItems[0].costLow").value(28800.0))
                // 总造价 = 套餐价 + 增项；分项清单整体为空。
                .andExpect(jsonPath("$.data.totalLow").value(152900.60))
                .andExpect(jsonPath("$.data.totalHigh").value(174500.60))
                .andExpect(jsonPath("$.data.items.length()").value(0))
                // 2a-3 的不变量在套餐模式下同样成立：材料 + 人工 = 总额。
                // 材料 = 套餐价 93075.45 + 增项材料 22464.00；人工 = 31025.15 + 6336.00。
                .andExpect(jsonPath("$.data.materialCostLow").value(115539.45))
                .andExpect(jsonPath("$.data.laborCostLow").value(37361.15));
    }

    /** 验收 3：LIST 与 PACKAGE 各自可复算，且 LIST 结果不带套餐字段。 */
    @Test
    void listModeCarriesNoPackageFields() throws Exception {
        mockMvc.perform(post("/api/v1/budgets/estimate")
                        .contentType("application/json")
                        .content("""
                                {"area":100,"region":"上海","finishLevel":"BASIC"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.pricingMode").value("LIST"))
                .andExpect(jsonPath("$.data.packageProduct").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.data.packageItems.length()").value(0))
                .andExpect(jsonPath("$.data.addonItems.length()").value(0))
                .andExpect(jsonPath("$.data.items.length()").value(9));
    }

    /** 指定一个不存在的套餐要报 404，而不是悄悄回落到平台通用套餐。 */
    @Test
    void unknownPackageIsRejected() throws Exception {
        mockMvc.perform(post("/api/v1/budgets/estimate")
                        .contentType("application/json")
                        .content("""
                                {"area":100,"pricingMode":"PACKAGE","packageId":"%s"}
                                """.formatted(UUID.randomUUID())))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }
}
