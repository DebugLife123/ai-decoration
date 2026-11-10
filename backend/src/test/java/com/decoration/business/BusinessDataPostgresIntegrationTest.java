package com.decoration.business;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.JwtRequestPostProcessor;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;

import java.sql.DriverManager;
import java.sql.Timestamp;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class BusinessDataPostgresIntegrationTest {
    private static final UUID COMPANY_A = UUID.fromString("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    private static final UUID COMPANY_B = UUID.fromString("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    private static final String TEST_SCHEMA = "decoration_test_" + UUID.randomUUID().toString().replace("-", "");
    private static final Path CLEANUP_STORAGE_ROOT = Path.of(System.getProperty("java.io.tmpdir"), TEST_SCHEMA + "-uploads");
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
        registry.add("app.storage.local-dir", () -> CLEANUP_STORAGE_ROOT.toString());
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
    @Autowired private BusinessAssetCleanupService assetCleanup;
    @Autowired private AdminAuditLogService auditLogService;

    @BeforeEach
    void clearRows() {
        jdbc.update("delete from admin_audit_logs");
        jdbc.update("delete from business_idempotency_keys");
        jdbc.update("delete from company_inquiries");
        jdbc.update("delete from business_case_files");
        jdbc.update("delete from business_cases");
        jdbc.update("delete from material_quotes");
        jdbc.update("delete from labor_quotes");
        jdbc.update("delete from company_profiles");
        jdbc.update("delete from company_certifications");
        jdbc.update("delete from company_style_profiles");
    }

    @Test
    void persistsProfilesAndSeparatesCompanies() throws Exception {
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/v1/business/profile")
                        .with(token(COMPANY_A, "COMPANY_ADMIN"))
                        .contentType("application/json")
                        .content("""
                                {"name":"Company A","city":"Shanghai","services":"design","intro":"A","publicContactName":"Sales","publicContactInfo":"sales@example.test"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.name").value("Company A"))
                .andExpect(jsonPath("$.data.publicContactName").value("Sales"))
                .andExpect(jsonPath("$.data.publicContactInfo").value("sales@example.test"))
                .andExpect(jsonPath("$.data.version").value(0));

        mockMvc.perform(get("/api/v1/business/profile").with(token(COMPANY_B, "COMPANY_VIEWER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void persistsProjectAssetsTasksAndVersionsSeparately() throws Exception {
        var owner = UUID.randomUUID();
        var projectId = UUID.randomUUID();
        var taskId = UUID.randomUUID();
        var versionId = UUID.randomUUID();
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(
                        "/api/v1/projects/{projectId}", projectId)
                        .with(token(owner, "PERSONAL_USER"))
                        .contentType("application/json")
                        .content("""
                                {"id":"%s","name":"Studio","tasks":[{"id":"%s","mode":"photo","status":"completed","startedAt":"2026-11-02T00:00:00Z"}],"versions":[{"id":"%s","mode":"photo","createdAt":"2026-11-02T00:01:00Z"}]}
                                """.formatted(projectId, taskId, versionId)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/projects/{projectId}/tasks", projectId).with(token(owner, "PERSONAL_USER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].id").value(taskId.toString()))
                .andExpect(jsonPath("$.data[0].status").value("SUCCEEDED"));
        mockMvc.perform(get("/api/v1/projects/{projectId}/versions", projectId).with(token(owner, "PERSONAL_USER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].id").value(versionId.toString()));
        mockMvc.perform(get("/api/v1/tasks/{taskId}", taskId).with(token(owner, "PERSONAL_USER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.projectId").value(projectId.toString()));

        mockMvc.perform(post("/api/v1/projects/{projectId}/assets", projectId)
                        .with(token(owner, "PERSONAL_USER"))
                        .contentType("application/json")
                        .content("""
                                {"originalName":"room.png","mediaType":"image/png","byteSize":1200,"objectKey":"%s/%s/source/room.png"}
                                """.formatted(owner, projectId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.projectId").value(projectId.toString()));
        mockMvc.perform(get("/api/v1/projects/{projectId}/assets", projectId).with(token(owner, "PERSONAL_USER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].originalName").value("room.png"));
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject(
                "select count(*) from project_versions where owner_id = ? and project_id = ?", Integer.class, owner, projectId)).isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject(
                "select count(*) from generation_tasks where owner_id = ? and project_id = ?", Integer.class, owner, projectId)).isEqualTo(1);
        jdbc.update("delete from workspace_project_aggregates where company_id = ? and project_id = ?", owner, projectId);
    }

    @Test
    void scopesQuotesAndReplaysIdempotentCreate() throws Exception {
        var body = """
                {"name":"oak","brand":"Oak & Co","spec":"solid","unit":"sqm","price":12.50,"category":"floor","region":"Shanghai","validUntil":"%s"}
                """.formatted(futureDate());
        var first = mockMvc.perform(post("/api/v1/business/material-quotes")
                        .with(token(COMPANY_A, "COMPANY_EDITOR"))
                        .header("Idempotency-Key", "material-key-0001")
                        .contentType("application/json").content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.brand").value("Oak & Co"))
                .andReturn().getResponse().getContentAsString();
        var id = com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
                .readTree(first).path("data").path("id").asText();

        mockMvc.perform(post("/api/v1/business/material-quotes")
                        .with(token(COMPANY_A, "COMPANY_EDITOR"))
                        .header("Idempotency-Key", "material-key-0001")
                        .contentType("application/json").content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.id").value(id));

        mockMvc.perform(post("/api/v1/business/material-quotes")
                        .with(token(COMPANY_A, "COMPANY_EDITOR"))
                        .header("Idempotency-Key", "material-key-0001")
                        .contentType("application/json")
                        .content(body.replace("oak", "pine")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("IDEMPOTENCY_CONFLICT"));

        mockMvc.perform(get("/api/v1/business/material-quotes").with(token(COMPANY_B, "COMPANY_VIEWER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items").isEmpty())
                .andExpect(jsonPath("$.data.page.total").value(0));

        mockMvc.perform(get("/api/v1/business/material-quotes/{id}", id).with(token(COMPANY_B, "COMPANY_ADMIN")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    void materialQuotesCanReferenceAndRemoveCompanyImages() throws Exception {
        var imageId = UUID.randomUUID();
        var secondImageId = UUID.randomUUID();
        jdbc.update("""
                insert into business_assets(company_id, id, file_name, object_key, media_type, created_at)
                values (?, ?, ?, ?, ?, now()), (?, ?, ?, ?, ?, now())
                """, COMPANY_A, imageId, "oak-floor.png", COMPANY_A + "/" + imageId, "image/png",
                COMPANY_A, secondImageId, "oak-floor-detail.png", COMPANY_A + "/" + secondImageId, "image/png");
        var body = """
                {"name":"Oak floor","spec":"solid","unit":"sqm","price":12.50,"category":"floor","region":"Shanghai","validUntil":"%s","imageIds":["%s","%s"]}
                """.formatted(futureDate(), imageId, secondImageId);

        var response = mockMvc.perform(post("/api/v1/business/material-quotes")
                        .with(token(COMPANY_A, "COMPANY_EDITOR"))
                        .header("Idempotency-Key", "material-image-0001")
                        .contentType("application/json").content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.imageId").value(imageId.toString()))
                .andExpect(jsonPath("$.data.imageIds[0]").value(imageId.toString()))
                .andExpect(jsonPath("$.data.imageIds[1]").value(secondImageId.toString()))
                .andReturn().getResponse().getContentAsString();
        var quoteId = com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
                .readTree(response).path("data").path("id").asText();

        mockMvc.perform(patch("/api/v1/business/material-quotes/{id}", quoteId)
                        .with(token(COMPANY_A, "COMPANY_EDITOR"))
                        .contentType("application/json")
                        .content("""
                                {"imageIds":["%s","%s"],"version":0}
                                """.formatted(secondImageId, imageId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.imageId").value(secondImageId.toString()))
                .andExpect(jsonPath("$.data.imageIds[0]").value(secondImageId.toString()))
                .andExpect(jsonPath("$.data.imageIds[1]").value(imageId.toString()));

        mockMvc.perform(patch("/api/v1/business/material-quotes/{id}", quoteId)
                        .with(token(COMPANY_A, "COMPANY_EDITOR"))
                        .contentType("application/json")
                        .content("""
                                {"imageIds":["%s"],"version":1}
                                """.formatted(imageId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.imageId").value(imageId.toString()))
                .andExpect(jsonPath("$.data.imageIds.length()").value(1));

        var foreignImage = UUID.randomUUID();
        mockMvc.perform(post("/api/v1/business/material-quotes")
                        .with(token(COMPANY_B, "COMPANY_EDITOR"))
                        .header("Idempotency-Key", "foreign-image-0001")
                        .contentType("application/json")
                        .content(body.replace(imageId.toString(), foreignImage.toString()).replace("Oak floor", "Pine floor")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void rejectsDuplicateMaterialQuoteNaturalKey() throws Exception {
        // 自然键 = 企业 + 名称 + 规格 + 品牌 + 单位；大小写和首尾空格不影响判定。
        var body = """
                {"name":"Quartz counter","brand":"StoneCo","spec":"20mm","unit":"sqm","price":88.00,"category":"counter","region":"Shanghai","validUntil":"%s"}
                """.formatted(futureDate());
        var created = mockMvc.perform(post("/api/v1/business/material-quotes")
                        .with(token(COMPANY_A, "COMPANY_EDITOR"))
                        .header("Idempotency-Key", "natural-key-0001")
                        .contentType("application/json").content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        var duplicate = body.replace("Quartz counter", "  quartz COUNTER  ").replace("\"StoneCo\"", "\"stoneco\"");

        mockMvc.perform(post("/api/v1/business/material-quotes")
                        .with(token(COMPANY_A, "COMPANY_EDITOR"))
                        .header("Idempotency-Key", "natural-key-0002")
                        .contentType("application/json").content(duplicate))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DUPLICATE_QUOTE"));

        // 换个单位就是另一条报价，允许创建。
        mockMvc.perform(post("/api/v1/business/material-quotes")
                        .with(token(COMPANY_A, "COMPANY_EDITOR"))
                        .header("Idempotency-Key", "natural-key-0003")
                        .contentType("application/json").content(body.replace("\"sqm\"", "\"m\"")))
                .andExpect(status().isCreated());

        // 品牌是身份的一部分（契约决策 9：name+spec+brand+unit），换品牌是另一条报价，允许创建。
        var otherBrand = body.replace("\"StoneCo\"", "\"OtherBrand\"");
        org.junit.jupiter.api.Assertions.assertNotEquals(body, otherBrand, "品牌替换没有生效，这条断言就失去意义");
        mockMvc.perform(post("/api/v1/business/material-quotes")
                        .with(token(COMPANY_A, "COMPANY_EDITOR"))
                        .header("Idempotency-Key", "natural-key-0005")
                        .contentType("application/json").content(otherBrand))
                .andExpect(status().isCreated());

        // 反过来，地区或有效期不同不构成新报价：它们不是材料的身份。
        // 这条专门盯住 V2 旧索引把 region/valid_until 算进键的问题——旧索引下这里会误放行。
        mockMvc.perform(post("/api/v1/business/material-quotes")
                        .with(token(COMPANY_A, "COMPANY_EDITOR"))
                        .header("Idempotency-Key", "natural-key-0006")
                        .contentType("application/json")
                        .content(body.replace("\"Shanghai\"", "\"Beijing\"")
                                .replace(futureDate(), java.time.LocalDate.now().plusYears(2).toString())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DUPLICATE_QUOTE"));

        // 把已有一条改名撞到另一条上，同样 409。
        var otherId = com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
                .readTree(mockMvc.perform(post("/api/v1/business/material-quotes")
                                .with(token(COMPANY_A, "COMPANY_EDITOR"))
                                .header("Idempotency-Key", "natural-key-0004")
                                .contentType("application/json")
                                .content(body.replace("Quartz counter", "Granite counter")))
                        .andExpect(status().isCreated())
                        .andReturn().getResponse().getContentAsString())
                .path("data").path("id").asText();
        mockMvc.perform(patch("/api/v1/business/material-quotes/{id}", otherId)
                        .with(token(COMPANY_A, "COMPANY_EDITOR"))
                        .contentType("application/json")
                        .content("{\"name\":\"Quartz counter\",\"unit\":\"sqm\",\"version\":0}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DUPLICATE_QUOTE"));
        org.assertj.core.api.Assertions.assertThat(
                com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
                        .readTree(created).path("data").path("name").asText()).isEqualTo("Quartz counter");
    }

    @Test
    void cleanupRemovesOnlyOldUnreferencedImages() throws Exception {
        var companyId = UUID.randomUUID();
        var now = Instant.now();
        var old = now.minusSeconds(10L * 24 * 60 * 60);
        jdbc.update("insert into auth_companies(id, name, created_at) values (?, ?, ?)", companyId, "Cleanup Studio", Timestamp.from(now));

        var orphanId = UUID.randomUUID();
        var recentId = UUID.randomUUID();
        var caseImageId = UUID.randomUUID();
        var materialImageId = UUID.randomUUID();
        var certificationId = UUID.randomUUID();
        var previouslySubmittedCertificationId = UUID.randomUUID();
        var pdfId = UUID.randomUUID();
        insertCleanupAsset(companyId, orphanId, "orphan.png", "image/png", old);
        insertCleanupAsset(companyId, recentId, "recent.png", "image/png", now);
        insertCleanupAsset(companyId, caseImageId, "case.png", "image/png", old);
        insertCleanupAsset(companyId, materialImageId, "material.png", "image/png", old);
        insertCleanupAsset(companyId, certificationId, "certificate.png", "image/png", old);
        insertCleanupAsset(companyId, previouslySubmittedCertificationId, "previous-certificate.png", "image/png", old);
        insertCleanupAsset(companyId, pdfId, "certificate.pdf", "application/pdf", old);

        var caseId = UUID.randomUUID();
        jdbc.update("""
                insert into business_cases(id, company_id, title, status, version, created_at, updated_at)
                values (?, ?, 'Case', 'draft', 0, ?, ?)
                """, caseId, companyId, Timestamp.from(now), Timestamp.from(now));
        jdbc.update("insert into business_case_files(company_id, case_id, file_id, position) values (?, ?, ?, 0)",
                companyId, caseId, caseImageId);

        var quoteId = UUID.randomUUID();
        jdbc.update("""
                insert into material_quotes(id, company_id, name, specification, unit, price, category, region,
                    valid_until, version, created_at, updated_at)
                values (?, ?, 'Oak', 'Solid', 'sqm', 100, 'floor', 'Shanghai', current_date + 30, 0, ?, ?)
                """, quoteId, companyId, Timestamp.from(now), Timestamp.from(now));
        jdbc.update("insert into material_quote_images(company_id, quote_id, image_id, position) values (?, ?, ?, 0)",
                companyId, quoteId, materialImageId);
        jdbc.update("""
                insert into company_certifications(company_id, id, company_name, contact_name, contact_info,
                    service_areas, document_refs, status, version, submitted_at, updated_at)
                values (?, ?, 'Cleanup Studio', 'Contact', 'contact@example.test', '[]'::jsonb, ?::jsonb, 'PENDING', 0, ?, ?)
                """, companyId, UUID.randomUUID(), "[\"" + certificationId + "\"]", Timestamp.from(now), Timestamp.from(now));
        jdbc.update("""
                insert into company_certification_documents(company_id, asset_id, submitted_at)
                values (?, ?, ?)
                """, companyId, previouslySubmittedCertificationId, Timestamp.from(old));

        for (var id : java.util.List.of(orphanId, recentId, caseImageId, materialImageId, certificationId,
                previouslySubmittedCertificationId, pdfId)) {
            var file = CLEANUP_STORAGE_ROOT.resolve(companyId.toString()).resolve(id.toString());
            Files.createDirectories(file.getParent());
            Files.write(file, new byte[]{1, 2, 3});
        }

        var preview = assetCleanup.preview();
        org.assertj.core.api.Assertions.assertThat(preview.eligibleImageCount()).isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat(preview.estimatedBytes()).isEqualTo(3);
        org.assertj.core.api.Assertions.assertThat(preview.candidates()).singleElement()
                .satisfies(candidate -> {
                    org.assertj.core.api.Assertions.assertThat(candidate.assetId()).isEqualTo(orphanId);
                    org.assertj.core.api.Assertions.assertThat(candidate.companyName()).isEqualTo("Cleanup Studio");
                    org.assertj.core.api.Assertions.assertThat(candidate.fileName()).isEqualTo("orphan.png");
                    org.assertj.core.api.Assertions.assertThat(candidate.byteSize()).isEqualTo(3);
                });
        var previewImage = assetCleanup.getPreviewImage(orphanId);
        org.assertj.core.api.Assertions.assertThat(previewImage.fileName()).isEqualTo("orphan.png");
        org.assertj.core.api.Assertions.assertThat(previewImage.resource().getInputStream().readAllBytes()).containsExactly(1, 2, 3);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> assetCleanup.getPreviewImage(caseImageId))
                .isInstanceOf(com.decoration.shared.api.BusinessApiException.class);

        // This attachment was submitted previously and then replaced in the current certification request.
        org.assertj.core.api.Assertions.assertThat(assetCleanup.cleanSelected(java.util.List.of(previouslySubmittedCertificationId)))
                .isZero();
        org.assertj.core.api.Assertions.assertThat(Files.exists(CLEANUP_STORAGE_ROOT.resolve(companyId.toString())
                .resolve(previouslySubmittedCertificationId.toString()))).isTrue();

        var removed = assetCleanup.cleanSelected(java.util.List.of(orphanId));

        org.assertj.core.api.Assertions.assertThat(removed).isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat(Files.exists(CLEANUP_STORAGE_ROOT.resolve(companyId.toString()).resolve(orphanId.toString()))).isFalse();
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select count(*) from business_assets where company_id = ?", Integer.class, companyId)).isEqualTo(6);
        for (var retained : java.util.List.of(recentId, caseImageId, materialImageId, certificationId,
                previouslySubmittedCertificationId, pdfId)) {
            org.assertj.core.api.Assertions.assertThat(Files.exists(CLEANUP_STORAGE_ROOT.resolve(companyId.toString()).resolve(retained.toString()))).isTrue();
        }
    }

    @Test
    void companyCanRemoveMistakenUnsubmittedCertificationFilesButNotSubmittedFiles() throws Exception {
        var companyId = UUID.randomUUID();
        jdbc.update("insert into auth_companies(id, name, created_at) values (?, ?, now())", companyId, "Certification Studio");
        var uploaded = mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .multipart("/api/v1/business/assets")
                        .file(new org.springframework.mock.web.MockMultipartFile("file", "wrong-license.png", "image/png", new byte[]{1, 2, 3}))
                        .with(token(companyId, "COMPANY_ADMIN")))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        var mapper = com.fasterxml.jackson.databind.json.JsonMapper.builder().build();
        var assetId = UUID.fromString(mapper.readTree(uploaded).path("data").path("id").asText());
        var filePath = CLEANUP_STORAGE_ROOT.resolve(companyId.toString()).resolve(assetId.toString());
        org.assertj.core.api.Assertions.assertThat(Files.exists(filePath)).isTrue();

        mockMvc.perform(delete("/api/v1/business/assets/{assetId}", assetId)
                        .with(token(companyId, "COMPANY_ADMIN")))
                .andExpect(status().isNoContent());
        org.assertj.core.api.Assertions.assertThat(Files.exists(filePath)).isFalse();
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject(
                "select count(*) from business_assets where company_id = ? and id = ?", Integer.class, companyId, assetId)).isZero();

        var submitted = mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .multipart("/api/v1/business/assets")
                        .file(new org.springframework.mock.web.MockMultipartFile("file", "license.png", "image/png", new byte[]{4, 5, 6}))
                        .with(token(companyId, "COMPANY_ADMIN")))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        var submittedAssetId = UUID.fromString(mapper.readTree(submitted).path("data").path("id").asText());
        var submittedPath = CLEANUP_STORAGE_ROOT.resolve(companyId.toString()).resolve(submittedAssetId.toString());
        mockMvc.perform(get("/api/v1/business/assets/{assetId}", submittedAssetId)
                        .with(token(companyId, "COMPANY_ADMIN")))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content().contentType("image/png"));
        mockMvc.perform(pu("/api/v1/business/certification")
                        .with(token(companyId, "COMPANY_ADMIN"))
                        .contentType("application/json")
                        .content("""
                                {"companyName":"Certification Studio","contactName":"Contact","contactInfo":"contact@example.test","serviceAreas":[],"documentRefs":["%s"]}
                                """.formatted(submittedAssetId)))
                .andExpect(status().isOk());

        mockMvc.perform(delete("/api/v1/business/assets/{assetId}", submittedAssetId)
                        .with(token(companyId, "COMPANY_ADMIN")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ASSET_ALREADY_IN_USE"));
        org.assertj.core.api.Assertions.assertThat(Files.exists(submittedPath)).isTrue();
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject(
                "select count(*) from business_assets where company_id = ? and id = ?", Integer.class, companyId, submittedAssetId)).isEqualTo(1);
    }

    private void insertCleanupAsset(UUID companyId, UUID assetId, String name, String mediaType, Instant createdAt) {
        jdbc.update("""
                insert into business_assets(company_id, id, file_name, object_key, media_type, created_at)
                values (?, ?, ?, ?, ?, ?)
                """, companyId, assetId, name, companyId + "/" + assetId, mediaType, Timestamp.from(createdAt));
    }

    @Test
    void appliesOptimisticVersionChecks() throws Exception {
        var body = """
                {"type":"electrician","unit":"day","price":450,"region":"Shanghai","validUntil":"%s"}
                """.formatted(futureDate());
        var response = mockMvc.perform(post("/api/v1/business/labor-quotes")
                        .with(token(COMPANY_A, "COMPANY_ADMIN"))
                        .header("Idempotency-Key", "labor-key-00001")
                        .contentType("application/json").content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        var json = com.fasterxml.jackson.databind.json.JsonMapper.builder().build().readTree(response);
        var id = json.path("data").path("id").asText();

        mockMvc.perform(patch("/api/v1/business/labor-quotes/{id}", id)
                        .with(token(COMPANY_A, "COMPANY_EDITOR"))
                        .contentType("application/json")
                        .content("""
                                {"price":460,"version":8}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"));
    }

    @Test
    void registersPersonalAndBusinessAccountsAndIssuesScopedTokens() throws Exception {
        mockMvc.perform(get("/api/v1/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));

        var personalEmail = "person-" + UUID.randomUUID() + "@example.test";
        var personalResponse = mockMvc.perform(post("/api/v1/auth/register")
                        .contentType("application/json")
                        .content("""
                                {"email":"%s","password":"password-123","displayName":"Test Person","accountType":"PERSONAL"}
                                """.formatted(personalEmail)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.user.accountType").value("personal"))
                .andReturn().getResponse().getContentAsString();
        var personalToken = com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
                .readTree(personalResponse).path("data").path("accessToken").asText();
        mockMvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + personalToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.email").value(personalEmail));
        var personalJwt = jwtDecoder.decode(personalToken);
        org.assertj.core.api.Assertions.assertThat(personalJwt.getClaimAsString("accountType")).isEqualTo("personal");
        org.assertj.core.api.Assertions.assertThat(personalJwt.getClaimAsString("companyId")).isEqualTo(personalJwt.getSubject());
        org.assertj.core.api.Assertions.assertThat(personalJwt.getClaimAsStringList("roles")).containsExactly("PERSONAL_USER");
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject(
                "select password_hash from auth_users where email = ?", String.class, personalEmail))
                .startsWith("$2a$").isNotEqualTo("password-123");

        var projectId = UUID.randomUUID();
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(
                        "/api/v1/projects/{projectId}", projectId)
                        .header("Authorization", "Bearer " + personalToken)
                        .contentType("application/json")
                        .content("""
                                {"id":"%s","name":"Personal project"}
                                """.formatted(projectId)))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/v1/projects").header("Authorization", "Bearer " + personalToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].id").value(projectId.toString()));
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete(
                        "/api/v1/projects/{projectId}", projectId)
                        .header("Authorization", "Bearer " + personalToken))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType("application/json")
                        .content("""
                                {"email":"%s","password":"password-123","accountType":"BUSINESS"}
                                """.formatted(personalEmail)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType("application/json")
                        .content("""
                                {"email":"%s","password":"password-123","accountType":"PERSONAL"}
                                """.formatted(personalEmail)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.user.accountType").value("personal"));

        var businessEmail = "team-" + UUID.randomUUID() + "@example.test";
        var businessResponse = mockMvc.perform(post("/api/v1/auth/register")
                        .contentType("application/json")
                        .content("""
                                {"email":"%s","password":"password-456","displayName":"Team Admin","accountType":"BUSINESS","companyName":"Test Studio"}
                                """.formatted(businessEmail)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.user.accountType").value("business"))
                .andReturn().getResponse().getContentAsString();
        var businessToken = com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
                .readTree(businessResponse).path("data").path("accessToken").asText();
        var businessJwt = jwtDecoder.decode(businessToken);
        org.assertj.core.api.Assertions.assertThat(businessJwt.getClaimAsString("accountType")).isEqualTo("business");
        org.assertj.core.api.Assertions.assertThat(businessJwt.getClaimAsString("companyId")).isNotBlank();
        org.assertj.core.api.Assertions.assertThat(businessJwt.getClaimAsStringList("roles")).containsExactly("COMPANY_ADMIN");
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject(
                "select count(*) from company_profiles where company_id = ?", Integer.class,
                UUID.fromString(businessJwt.getClaimAsString("companyId")))).isEqualTo(1);
    }

    @Test
    void personalUserCanSubmitInquiryAndOnlyOwningCompanyCanFollowItUp() throws Exception {
        var mapper = com.fasterxml.jackson.databind.json.JsonMapper.builder().build();
        var consumerEmail = "inquiry-user-" + UUID.randomUUID() + "@example.test";
        var consumerRegistration = mockMvc.perform(post("/api/v1/auth/register")
                        .contentType("application/json")
                        .content("""
                                {"email":"%s","password":"password-123","displayName":"Inquiry User","accountType":"PERSONAL"}
                                """.formatted(consumerEmail)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        var consumerToken = mapper.readTree(consumerRegistration).path("data").path("accessToken").asText();

        var ownerRegistration = mockMvc.perform(post("/api/v1/auth/register")
                        .contentType("application/json")
                        .content("""
                                {"email":"owner-%s@example.test","password":"password-123","displayName":"Owner","accountType":"BUSINESS","companyName":"Inquiry Studio"}
                                """.formatted(UUID.randomUUID())))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        var ownerData = mapper.readTree(ownerRegistration).path("data");
        var ownerId = UUID.fromString(ownerData.path("user").path("companyId").asText());
        var ownerToken = ownerData.path("accessToken").asText();

        var otherRegistration = mockMvc.perform(post("/api/v1/auth/register")
                        .contentType("application/json")
                        .content("""
                                {"email":"other-%s@example.test","password":"password-123","displayName":"Other","accountType":"BUSINESS","companyName":"Other Studio"}
                                """.formatted(UUID.randomUUID())))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        var otherToken = mapper.readTree(otherRegistration).path("data").path("accessToken").asText();

        var now = Timestamp.from(Instant.now());
        var materialId = UUID.randomUUID();
        jdbc.update("""
                insert into material_quotes(id, company_id, name, specification, unit, price, category, region,
                    valid_until, version, created_at, updated_at)
                values (?, ?, 'Oak Flooring', 'Solid oak', 'sqm', 100, 'floor', 'Shanghai', current_date + 30, 0, ?, ?)
                """, materialId, ownerId, now, now);
        jdbc.update("""
                insert into company_certifications(company_id, id, company_name, contact_name, contact_info,
                    service_areas, document_refs, status, reviewed_by, reviewed_at, version, submitted_at, updated_at)
                values (?, ?, 'Inquiry Studio', 'Owner', 'owner@example.test', '[]'::jsonb, '[]'::jsonb,
                    'APPROVED', ?, ?, 1, ?, ?)
                """, ownerId, UUID.randomUUID(), UUID.randomUUID(), now, now, now);

        var response = mockMvc.perform(post("/api/v1/inquiries")
                        .header("Authorization", "Bearer " + consumerToken)
                        .header("Idempotency-Key", "inquiry-e2e-" + UUID.randomUUID())
                        .contentType("application/json")
                        .content("""
                                {"materialId":"%s","contactName":"Lin","contactInfo":"13800000000","message":"Please send a quote."}
                                """.formatted(materialId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.materialName").value("Oak Flooring"))
                .andExpect(jsonPath("$.data.status").value("NEW"))
                .andReturn().getResponse().getContentAsString();
        var inquiryId = mapper.readTree(response).path("data").path("id").asText();

        mockMvc.perform(get("/api/v1/business/inquiries").header("Authorization", "Bearer " + ownerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].contactInfo").value("13800000000"));
        mockMvc.perform(get("/api/v1/business/inquiries").header("Authorization", "Bearer " + otherToken))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data").isEmpty());
        mockMvc.perform(patch("/api/v1/business/inquiries/{id}/status", inquiryId)
                        .header("Authorization", "Bearer " + ownerToken).contentType("application/json")
                        .content("{\"status\":\"CONTACTED\",\"version\":0}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("CONTACTED"))
                .andExpect(jsonPath("$.data.version").value(1));
        mockMvc.perform(patch("/api/v1/business/inquiries/{id}/status", inquiryId)
                        .header("Authorization", "Bearer " + otherToken).contentType("application/json")
                        .content("{\"status\":\"CLOSED\",\"version\":1}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void reportsCertificationContactAndActualCaseImageCompleteness() throws Exception {
        var companyId = UUID.randomUUID();
        var now = Timestamp.from(Instant.now());
        jdbc.update("insert into auth_companies(id, name, created_at) values (?, 'Completeness Studio', ?)", companyId, now);
        jdbc.update("""
                insert into company_profiles(company_id, id, name, city, services, intro, version, created_at, updated_at)
                values (?, ?, 'Completeness Studio', '', '', '', 0, ?, ?)
                """, companyId, UUID.randomUUID(), now, now);
        var certificateId = UUID.randomUUID();
        jdbc.update("insert into business_assets(company_id, id, file_name, object_key, media_type, created_at) values (?, ?, 'license.pdf', ?, 'application/pdf', ?)",
                companyId, certificateId, companyId + "/" + certificateId, now);
        var pdfId = UUID.randomUUID();
        jdbc.update("insert into business_assets(company_id, id, file_name, object_key, media_type, created_at) values (?, ?, 'plans.pdf', ?, 'application/pdf', ?)",
                companyId, pdfId, companyId + "/" + pdfId, now);
        var imageId = UUID.randomUUID();
        jdbc.update("insert into business_assets(company_id, id, file_name, object_key, media_type, created_at) values (?, ?, 'project.jpg', ?, 'image/jpeg', ?)",
                companyId, imageId, companyId + "/" + imageId, now);
        jdbc.update("""
                insert into company_certifications(company_id, id, company_name, contact_name, contact_info,
                    service_areas, document_refs, status, version, submitted_at, updated_at)
                values (?, ?, 'Completeness Studio', 'Owner', 'owner@example.test', '[]'::jsonb, ?::jsonb,
                    'PENDING', 0, ?, ?)
                """, companyId, UUID.randomUUID(), "[\"" + certificateId + "\"]", now, now);
        var caseId = UUID.randomUUID();
        jdbc.update("""
                insert into business_cases(id, company_id, title, status, version, created_at, updated_at)
                values (?, ?, 'Living Room', 'draft', 0, ?, ?)
                """, caseId, companyId, now, now);
        jdbc.update("insert into business_case_files(company_id, case_id, file_id, position) values (?, ?, ?, 0)", companyId, caseId, pdfId);

        mockMvc.perform(get("/api/v1/business/completeness").with(token(companyId, "COMPANY_ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.certificationMaterialCount").value(1))
                .andExpect(jsonPath("$.data.caseCount").value(1))
                .andExpect(jsonPath("$.data.casesWithImages").value(0))
                .andExpect(jsonPath("$.data.hasPublicContact").value(false));

        jdbc.update("insert into business_case_files(company_id, case_id, file_id, position) values (?, ?, ?, 1)", companyId, caseId, imageId);
        jdbc.update("update company_profiles set public_contact_name = 'Sales', public_contact_info = '13800000000' where company_id = ?", companyId);
        mockMvc.perform(get("/api/v1/business/completeness").with(token(companyId, "COMPANY_ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.casesWithImages").value(1))
                .andExpect(jsonPath("$.data.hasPublicContact").value(true));
    }

    @Test
    void listsOnlyPublishedCasesFromApprovedCompaniesForPersonalUsers() throws Exception {
        var approvedCompany = UUID.randomUUID();
        var pendingCompany = UUID.randomUUID();
        var now = Timestamp.from(Instant.now());
        jdbc.update("insert into auth_companies(id, name, created_at) values (?, 'Approved Studio', ?)", approvedCompany, now);
        jdbc.update("insert into auth_companies(id, name, created_at) values (?, 'Pending Studio', ?)", pendingCompany, now);
        jdbc.update("""
                insert into company_certifications(company_id, id, company_name, contact_name, contact_info,
                    service_areas, document_refs, status, reviewed_by, reviewed_at, version, submitted_at, updated_at)
                values (?, ?, 'Approved Studio', 'Owner', 'owner@approved.test', '[]'::jsonb, '[]'::jsonb,
                    'APPROVED', ?, ?, 0, ?, ?)
                """, approvedCompany, UUID.randomUUID(), UUID.randomUUID(), now, now, now);
        jdbc.update("""
                insert into company_certifications(company_id, id, company_name, contact_name, contact_info,
                    service_areas, document_refs, status, version, submitted_at, updated_at)
                values (?, ?, 'Pending Studio', 'Owner', 'owner@pending.test', '[]'::jsonb, '[]'::jsonb,
                    'PENDING', 0, ?, ?)
                """, pendingCompany, UUID.randomUUID(), now, now);
        jdbc.update("""
                insert into business_cases(id, company_id, title, style, status, version, created_at, updated_at)
                values (?, ?, 'Approved Living Room', '现代', 'published', 0, ?, ?)
                """, UUID.randomUUID(), approvedCompany, now, now);
        jdbc.update("""
                insert into business_cases(id, company_id, title, style, status, version, created_at, updated_at)
                values (?, ?, 'Pending Living Room', '现代', 'published', 0, ?, ?)
                """, UUID.randomUUID(), pendingCompany, now, now);
        jdbc.update("""
                insert into business_cases(id, company_id, title, style, status, version, created_at, updated_at)
                values (?, ?, 'Draft Living Room', '现代', 'draft', 0, ?, ?)
                """, UUID.randomUUID(), approvedCompany, now, now);

        mockMvc.perform(get("/api/v1/cases").with(token(UUID.randomUUID(), "PERSONAL_USER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(1))
                .andExpect(jsonPath("$.data.items[0].title").value("Approved Living Room"));
        mockMvc.perform(get("/api/v1/cases").with(token(approvedCompany, "COMPANY_ADMIN")))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/v1/cases"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void companyAdminCanPublishOwnCaseAfterCertificationApproval() throws Exception {
        var companyId = UUID.randomUUID();
        var now = Timestamp.from(Instant.now());
        jdbc.update("insert into auth_companies(id, name, created_at) values (?, 'Publish Studio', ?)", companyId, now);
        jdbc.update("""
                insert into company_certifications(company_id, id, company_name, contact_name, contact_info,
                    service_areas, document_refs, status, reviewed_by, reviewed_at, version, submitted_at, updated_at)
                values (?, ?, 'Publish Studio', 'Owner', 'owner@publish.test', '[]'::jsonb, '[]'::jsonb,
                    'APPROVED', ?, ?, 0, ?, ?)
                """, companyId, UUID.randomUUID(), UUID.randomUUID(), now, now, now);
        var caseId = UUID.randomUUID();
        jdbc.update("""
                insert into business_cases(id, company_id, title, status, version, created_at, updated_at)
                values (?, ?, 'Draft Case', 'draft', 0, ?, ?)
                """, caseId, companyId, now, now);

        mockMvc.perform(post("/api/v1/business/cases/{caseId}/publish", caseId)
                        .with(token(companyId, "COMPANY_ADMIN"))
                        .contentType("application/json").content("{\"version\":0}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("published"))
                .andExpect(jsonPath("$.data.version").value(1));

        mockMvc.perform(get("/api/v1/cases").with(token(UUID.randomUUID(), "PERSONAL_USER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].title").value("Draft Case"));
    }

    @Test
    void retriesFailedTaskAndCreatesVersionOnCompletion() throws Exception {
        var email = "task-" + UUID.randomUUID() + "@example.test";
        var registration = mockMvc.perform(post("/api/v1/auth/register")
                        .contentType("application/json")
                        .content("""
                                {"email":"%s","password":"password-123","displayName":"Task User","accountType":"PERSONAL"}
                                """.formatted(email)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        var mapper = com.fasterxml.jackson.databind.json.JsonMapper.builder().build();
        var userToken = mapper.readTree(registration).path("data").path("accessToken").asText();
        var projectId = UUID.randomUUID();
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(
                        "/api/v1/projects/{projectId}", projectId)
                        .header("Authorization", "Bearer " + userToken).contentType("application/json")
                        .content("{\"id\":\"%s\",\"name\":\"Lifecycle project\"}".formatted(projectId)))
                .andExpect(status().isOk());
        var taskResponse = mockMvc.perform(post("/api/v1/projects/{projectId}/renders", projectId)
                        .header("Authorization", "Bearer " + userToken).contentType("application/json")
                        .content("{\"prompt\":\"living room\"}"))
                .andExpect(status().isAccepted()).andReturn().getResponse().getContentAsString();
        var taskId = UUID.fromString(mapper.readTree(taskResponse).path("data").path("id").asText());
        var workerId = UUID.randomUUID();
        var worker = jwt().jwt(token -> token.subject(workerId.toString()).claim("roles", java.util.List.of("AI_WORKER")))
                .authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_AI_WORKER"));

        mockMvc.perform(post("/api/v1/tasks/{taskId}/claim", taskId).with(worker)
                        .contentType("application/json").content("{\"leaseSeconds\":300}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("RUNNING"));
        mockMvc.perform(post("/api/v1/tasks/{taskId}/fail", taskId).with(worker)
                        .contentType("application/json").content("{\"error\":\"temporary\",\"retryable\":true}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("QUEUED"));
        jdbc.update("update generation_tasks set available_at = now() - interval '1 second' where id = ?", taskId);

        mockMvc.perform(post("/api/v1/tasks/{taskId}/claim", taskId).with(worker)
                        .contentType("application/json").content("{\"leaseSeconds\":300}"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/v1/tasks/{taskId}/complete", taskId).with(worker)
                        .contentType("application/json")
                        .content("{\"result\":{\"image\":\"render.png\"},\"snapshot\":{\"name\":\"v1\"}}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("SUCCEEDED"))
                .andExpect(jsonPath("$.data.result.versionId").exists());
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject(
                "select count(*) from project_versions where project_id = ? and task_id = ?", Integer.class, projectId, taskId))
                .isEqualTo(1);
    }

    @Test
    void submitsAndReviewsCompanyCertification() throws Exception {
        var email = "cert-" + UUID.randomUUID() + "@example.test";
        var registration = mockMvc.perform(post("/api/v1/auth/register")
                        .contentType("application/json")
                        .content("""
                                {"email":"%s","password":"password-123","displayName":"Cert Admin","accountType":"BUSINESS","companyName":"Cert Studio"}
                                """.formatted(email)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        var mapper = com.fasterxml.jackson.databind.json.JsonMapper.builder().build();
        var authData = mapper.readTree(registration).path("data");
        var companyId = UUID.fromString(authData.path("user").path("companyId").asText());
        var companyToken = authData.path("accessToken").asText();
        var documentId = UUID.randomUUID();
        jdbc.update("insert into business_assets(company_id, id, file_name, object_key, media_type, created_at) values (?, ?, ?, ?, ?, now())",
                companyId, documentId, "license.pdf", companyId + "/" + documentId, "application/pdf");
        var certification = mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(
                        "/api/v1/business/certification")
                        .header("Authorization", "Bearer " + companyToken).contentType("application/json")
                        .content("""
                                {"companyName":"Cert Studio","contactName":"Test Admin","contactInfo":"admin@example.test","serviceAreas":["Shanghai"],"documentRefs":["%s"]}
                                """.formatted(documentId)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("PENDING"))
                .andReturn().getResponse().getContentAsString();
        var version = mapper.readTree(certification).path("data").path("version").asInt();
        var adminId = UUID.randomUUID();
        mockMvc.perform(post("/api/v1/admin/certifications/{companyId}/review", companyId)
                        .with(jwt().jwt(token -> token.subject(adminId.toString()).claim("roles", java.util.List.of("PLATFORM_ADMIN")))
                                .authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_PLATFORM_ADMIN")))
                        .contentType("application/json")
                        .content("{\"status\":\"APPROVED\",\"reviewNote\":\"Verified\",\"version\":%d}".formatted(version)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("APPROVED"))
                .andExpect(jsonPath("$.data.reviewedBy").value(adminId.toString()));
        org.assertj.core.api.Assertions.assertThat(auditLogService.list(1, 20, "CERTIFICATION_REVIEW").total()).isEqualTo(1);
    }

    @Test
    void publishesOnlyCertifiedQuotesToConsumerCatalog() throws Exception {
        var certifiedCompany = UUID.randomUUID();
        var pendingCompany = UUID.randomUUID();
        jdbc.update("insert into auth_companies(id, name, created_at) values (?, ?, now())", certifiedCompany, "Certified Studio");
        jdbc.update("insert into auth_companies(id, name, created_at) values (?, ?, now())", pendingCompany, "Pending Studio");
        jdbc.update("""
                insert into company_profiles(company_id, id, name, public_contact_name, public_contact_info, version, created_at, updated_at)
                values (?, ?, ?, ?, ?, 0, now(), now())
                """, certifiedCompany, UUID.randomUUID(), "Certified Studio", "Sales Team", "sales@example.test");

        mockMvc.perform(post("/api/v1/business/material-quotes")
                        .with(token(certifiedCompany, "COMPANY_ADMIN"))
                        .header("Idempotency-Key", "catalog-key-certified")
                        .contentType("application/json")
                        .content("""
                                {"name":"oak floor","spec":"solid","unit":"sqm","price":299,"category":"floor","region":"Shanghai","validUntil":"%s"}
                                """.formatted(futureDate())))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/api/v1/business/material-quotes")
                        .with(token(pendingCompany, "COMPANY_ADMIN"))
                        .header("Idempotency-Key", "catalog-key-pending")
                        .contentType("application/json")
                        .content("""
                                {"name":"pine floor","spec":"engineered","unit":"sqm","price":199,"category":"floor","region":"Shanghai","validUntil":"%s"}
                                """.formatted(futureDate())))
                .andExpect(status().isCreated());

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/v1/business/certification")
                        .with(token(certifiedCompany, "COMPANY_ADMIN"))
                        .contentType("application/json")
                        .content("""
                                {"companyName":"Certified Studio","contactName":"C Admin","contactInfo":"c@example.test","serviceAreas":["Shanghai"],"documentRefs":[]}
                                """))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("PENDING"));

        // 未认证前，C 端目录应为空（个人账号也能读到，但看不到未认证企业的报价）。
        mockMvc.perform(get("/api/v1/materials").with(token(UUID.randomUUID(), "PERSONAL_USER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items").isEmpty());

        var certification = mockMvc.perform(get("/api/v1/business/certification").with(token(certifiedCompany, "COMPANY_VIEWER")))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        var version = com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
                .readTree(certification).path("data").path("version").asInt();
        mockMvc.perform(post("/api/v1/admin/certifications/{companyId}/review", certifiedCompany)
                        .with(jwt().jwt(token -> token.subject(UUID.randomUUID().toString())
                                        .claim("roles", java.util.List.of("PLATFORM_ADMIN")))
                                .authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_PLATFORM_ADMIN")))
                        .contentType("application/json")
                        .content("{\"status\":\"APPROVED\",\"reviewNote\":\"ok\",\"version\":%d}".formatted(version)))
                .andExpect(status().isOk());

        // 认证通过后，个人账号能在目录里看到该企业的报价，且看不到未认证企业的那条。
        mockMvc.perform(get("/api/v1/materials").with(token(UUID.randomUUID(), "PERSONAL_USER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(1))
                .andExpect(jsonPath("$.data.items[0].name").value("oak floor"))
                .andExpect(jsonPath("$.data.items[0].companyName").value("Certified Studio"))
                .andExpect(jsonPath("$.data.items[0].companyContactName").value("Sales Team"))
                .andExpect(jsonPath("$.data.items[0].companyContactInfo").value("sales@example.test"))
                .andExpect(jsonPath("$.data.page.total").value(1));

        mockMvc.perform(get("/api/v1/materials").param("region", "Beijing").with(token(UUID.randomUUID(), "PERSONAL_USER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items").isEmpty());

        jdbc.update("delete from material_quotes where company_id in (?, ?)", certifiedCompany, pendingCompany);
        jdbc.update("delete from company_certifications where company_id = ?", certifiedCompany);
        jdbc.update("delete from auth_companies where id in (?, ?)", certifiedCompany, pendingCompany);
    }

    @Test
    void publishesOnlyCertifiedStyleProfilesToRecommendationFeed() throws Exception {
        var certifiedCompany = UUID.randomUUID();
        var pendingCompany = UUID.randomUUID();
        jdbc.update("insert into auth_companies(id, name, created_at) values (?, ?, now())", certifiedCompany, "Certified Studio");
        jdbc.update("insert into auth_companies(id, name, created_at) values (?, ?, now())", pendingCompany, "Pending Studio");

        mockMvc.perform(pu("/api/v1/business/style-profiles").with(token(certifiedCompany, "COMPANY_EDITOR"))
                        .contentType("application/json")
                        .content("""
                                {"profiles":[{"style":"chinese","name":"Certified New Chinese","note":"wood","reason":"fits","minBudgetWan":18,"maxBudgetWan":40,"regions":["Shanghai"," Shanghai "],"priority":2}]}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.version").value(0))
                .andExpect(jsonPath("$.data.profiles[0].regions.length()").value(1));

        mockMvc.perform(pu("/api/v1/business/style-profiles").with(token(pendingCompany, "COMPANY_ADMIN"))
                        .contentType("application/json")
                        .content("""
                                {"profiles":[{"style":"modern","name":"Pending Modern","minBudgetWan":0,"maxBudgetWan":12}]}
                                """))
                .andExpect(status().isOk());

        // 未认证企业不对外发布：推荐源里查不到待认证企业的资料。
        mockMvc.perform(get("/api/v1/styles/recommendations"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[?(@.style == 'modern')]").isEmpty());

        // 提交认证申请（PUT 要求 COMPANY_ADMIN，EDITOR 会被拒），再走管理员审核流程。
        mockMvc.perform(pu("/api/v1/business/certification").with(token(certifiedCompany, "COMPANY_ADMIN"))
                        .contentType("application/json")
                        .content("""
                                {"companyName":"Certified Studio","contactName":"C Admin","contactInfo":"c@example.test","serviceAreas":["Shanghai"],"documentRefs":[]}
                                """))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("PENDING"));

        var certification = mockMvc.perform(get("/api/v1/business/certification").with(token(certifiedCompany, "COMPANY_VIEWER")))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        var version = com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
                .readTree(certification).path("data").path("version").asInt();
        mockMvc.perform(post("/api/v1/admin/certifications/{companyId}/review", certifiedCompany)
                        .with(jwt().jwt(token -> token.subject(UUID.randomUUID().toString())
                                        .claim("roles", java.util.List.of("PLATFORM_ADMIN")))
                                .authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_PLATFORM_ADMIN")))
                        .contentType("application/json")
                        .content("{\"status\":\"APPROVED\",\"reviewNote\":\"ok\",\"version\":%d}".formatted(version)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/styles/recommendations"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[?(@.style == 'chinese')].companyName").value("Certified Studio"))
                .andExpect(jsonPath("$.data[?(@.style == 'modern')]").isEmpty())
                .andExpect(jsonPath("$.data[?(@.style == 'chinese')].minBudgetWan").value(18));

        jdbc.update("delete from company_style_profiles where company_id in (?, ?)", certifiedCompany, pendingCompany);
        jdbc.update("delete from company_certifications where company_id = ?", certifiedCompany);
        jdbc.update("delete from auth_companies where id in (?, ?)", certifiedCompany, pendingCompany);
    }

    @Test
    void replacesStyleProfilesForTheSignedInCompanyOnly() throws Exception {
        var company = UUID.randomUUID();
        jdbc.update("insert into auth_companies(id, name, created_at) values (?, ?, now())", company, "Isolated Studio");

        mockMvc.perform(pu("/api/v1/business/style-profiles").with(token(company, "COMPANY_ADMIN"))
                        .contentType("application/json")
                        .content("""
                                {"profiles":[{"style":"modern","name":"Modern A","minBudgetWan":0,"maxBudgetWan":12}]}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.companyName").value("Isolated Studio"));

        mockMvc.perform(pu("/api/v1/business/style-profiles").with(token(company, "COMPANY_ADMIN"))
                        .contentType("application/json")
                        .content("""
                                {"profiles":[{"style":"cream","name":"Cream B","minBudgetWan":10,"maxBudgetWan":30},{"style":"wabi","name":"Wabi C","minBudgetWan":8}]}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.version").value(1))
                .andExpect(jsonPath("$.data.profiles.length()").value(2))
                .andExpect(jsonPath("$.data.profiles[0].style").value("cream"));

        // 只读角色不能写入。
        mockMvc.perform(pu("/api/v1/business/style-profiles").with(token(company, "COMPANY_VIEWER"))
                        .contentType("application/json")
                        .content("{\"profiles\":[]}"))
                .andExpect(status().isForbidden());

        // 同一风格重复、预算区间颠倒都要被拒绝。
        mockMvc.perform(pu("/api/v1/business/style-profiles").with(token(company, "COMPANY_ADMIN"))
                        .contentType("application/json")
                        .content("""
                                {"profiles":[{"style":"modern","name":"A","minBudgetWan":0},{"style":"modern","name":"B","minBudgetWan":0}]}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        mockMvc.perform(pu("/api/v1/business/style-profiles").with(token(company, "COMPANY_ADMIN"))
                        .contentType("application/json")
                        .content("""
                                {"profiles":[{"style":"modern","name":"A","minBudgetWan":30,"maxBudgetWan":10}]}
                                """))
                .andExpect(status().isBadRequest());

        jdbc.update("delete from company_style_profiles where company_id = ?", company);
        jdbc.update("delete from auth_companies where id = ?", company);
    }

    @Test
    void rejectsAnonymousAccessToMaterialCatalog() throws Exception {
        mockMvc.perform(get("/api/v1/materials"))
                .andExpect(status().isUnauthorized());
    }

    /**
     * 单位治理：可识别的单位落到对应枚举，误填的规格单位（如 mm）必须被标成
     * unitUnknown 而不是当成平方米，否则价格会放大 1000 倍。
     */
    @Test
    void classifiesQuoteUnitsAndExcludesUnrecognizedOnes() throws Exception {
        var squareMeters = """
                {"name":"oak floor","spec":"910x127x15mm","unit":"㎡","price":299,"category":"floor","region":"Shanghai","validUntil":"%s"}
                """.formatted(futureDate());
        var created = mockMvc.perform(post("/api/v1/business/material-quotes")
                        .with(token(COMPANY_A, "COMPANY_ADMIN"))
                        .header("Idempotency-Key", "unit-key-sqm")
                        .contentType("application/json").content(squareMeters))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.unitKind").value("SQM"))
                .andExpect(jsonPath("$.data.unitUnknown").value(false))
                .andExpect(jsonPath("$.data.itemNature").value("INCLUDED"))
                .andReturn().getResponse().getContentAsString();
        var id = com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
                .readTree(created).path("data").path("id").asText();

        // 复合单位与「樘」这类计数单位都要能识别。
        for (var sample : java.util.List.of(
                java.util.Map.entry("延米", "LM"),
                java.util.Map.entry("樘", "PIECE"),
                java.util.Map.entry("桶", "PACKAGE"),
                java.util.Map.entry("m/级", "LM_PER_LEVEL"),
                java.util.Map.entry("cm/m2", "CM_PER_SQM"),
                java.util.Map.entry("套米", "SET_LM"),
                java.util.Map.entry("工日", "DAY"))) {
            mockMvc.perform(post("/api/v1/business/material-quotes")
                            .with(token(COMPANY_A, "COMPANY_ADMIN"))
                            .header("Idempotency-Key", "unit-key-" + sample.getValue())
                            .contentType("application/json")
                            .content("""
                                    {"name":"sample","spec":"s","unit":"%s","price":10,"category":"c","region":"Shanghai","validUntil":"%s"}
                                    """.formatted(sample.getKey(), futureDate())))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.data.unitKind").value(sample.getValue()))
                    .andExpect(jsonPath("$.data.unitUnknown").value(false));
        }

        // 把规格单位误填进「单位」→ UNKNOWN，且不再当成平方米。
        var mistaken = mockMvc.perform(post("/api/v1/business/material-quotes")
                        .with(token(COMPANY_A, "COMPANY_ADMIN"))
                        .header("Idempotency-Key", "unit-key-mm")
                        .contentType("application/json")
                        .content("""
                                {"name":"wood floor","spec":"910x10x10","unit":"mm","price":299,"category":"floor","region":"Hengyang","validUntil":"%s"}
                                """.formatted(futureDate())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.unitKind").value("UNKNOWN"))
                .andExpect(jsonPath("$.data.unitUnknown").value(true))
                .andReturn().getResponse().getContentAsString();
        var mistakenId = com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
                .readTree(mistaken).path("data").path("id").asText();

        // 企业把单位改对之后，标记要自动取消（PATCH 会重算 unit_kind）。
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .patch("/api/v1/business/material-quotes/{id}", mistakenId)
                        .with(token(COMPANY_A, "COMPANY_ADMIN"))
                        .contentType("application/json")
                        .content("{\"unit\":\"㎡\",\"version\":0}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.unitKind").value("SQM"))
                .andExpect(jsonPath("$.data.unitUnknown").value(false));

        // 赠送项与业主自购要能落库，非法枚举值要被拒。
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .patch("/api/v1/business/material-quotes/{id}", id)
                        .with(token(COMPANY_A, "COMPANY_ADMIN"))
                        .contentType("application/json")
                        .content("{\"itemNature\":\"GIFT\",\"version\":0}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.itemNature").value("GIFT"));
        mockMvc.perform(post("/api/v1/business/material-quotes")
                        .with(token(COMPANY_A, "COMPANY_ADMIN"))
                        .header("Idempotency-Key", "unit-key-bad-nature")
                        .contentType("application/json")
                        .content("""
                                {"name":"x","spec":"s","unit":"㎡","price":10,"category":"c","region":"Shanghai","validUntil":"%s","itemNature":"BOGUS"}
                                """.formatted(futureDate())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));

        // 人工报价也要有单位枚举，并且补上了 admin_hidden。
        mockMvc.perform(post("/api/v1/business/labor-quotes")
                        .with(token(COMPANY_A, "COMPANY_ADMIN"))
                        .header("Idempotency-Key", "unit-key-labor")
                        .contentType("application/json")
                        .content("""
                                {"type":"mason","unit":"工日","price":200,"region":"Shanghai","validUntil":"%s"}
                                """.formatted(futureDate())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.unitKind").value("DAY"))
                .andExpect(jsonPath("$.data.unitUnknown").value(false))
                .andExpect(jsonPath("$.data.adminHidden").value(false));
    }

    /**
     * 回归：NotificationService 曾用单参数 lambda 调 jdbc.query，在 Spring 6 下会被推导成
     * ResultSetExtractor 之外的重载，结果集不被逐行循环，导致通知列表只出零星几条甚至为空，且没有任何报错。
     * 这里刻意造多行数据（2 条报价、2 条咨询、2 条待审认证），因为单行场景下 while 循环只跑一次，测不出问题。
     */
    @Test
    void notificationListReadsAllDerivedRows() throws Exception {
        var userA = UUID.randomUUID();
        jdbc.update("insert into auth_companies(id, name, created_at) values (?, 'Company A', now()) "
                + "on conflict (id) do nothing", COMPANY_A);
        jdbc.update("insert into auth_users(id, email, password_hash, display_name, account_type, company_id, role, created_at) "
                        + "values (?, ?, ?, ?, ?, ?, ?, now())",
                userA, "notify-a@example.test", "x", "Notify A", "BUSINESS", COMPANY_A, "COMPANY_ADMIN");
        // 表上有 CHECK ((status = 'PENDING') = (reviewed_at IS NULL)) 及 reviewed_by 的同款约束，
        // 因此非 PENDING 的认证必须同时写入 reviewed_at 与 reviewed_by。
        jdbc.update("insert into company_certifications(id, company_id, company_name, contact_name, contact_info, "
                        + "service_areas, document_refs, status, reviewed_by, reviewed_at, version, submitted_at, updated_at) "
                        + "values (?, ?, 'Company A', 'Zhang', '13800000000', '[]'::jsonb, '[]'::jsonb, 'APPROVED', ?, now(), 1, now(), now())",
                UUID.randomUUID(), COMPANY_A, UUID.randomUUID());

        // 两条将到期的材料报价：验证报价分支确实逐行循环，而不是只读第一行。
        var quoteIds = new ArrayList<UUID>();
        for (var i = 0; i < 2; i++) {
            var quoteId = UUID.randomUUID();
            quoteIds.add(quoteId);
            jdbc.update("insert into material_quotes(id, company_id, name, specification, unit, price, category, region, "
                            + "valid_until, version, created_at, updated_at) "
                            + "values (?, ?, ?, 's', 'SQM', 10, 'c', 'Shanghai', ?, 0, now(), now())",
                    quoteId, COMPANY_A, "notify-quote-" + i, java.time.LocalDate.now().plusDays(5));
        }
        // 两条待处理咨询：INQUIRY 只对 status = 'NEW' 生成。consumer_id 有外键，先建一个个人用户。
        var consumerId = UUID.randomUUID();
        jdbc.update("insert into auth_users(id, email, password_hash, display_name, account_type, role, created_at) "
                        + "values (?, ?, ?, ?, ?, ?, now())",
                consumerId, "notify-consumer@example.test", "x", "Consumer", "PERSONAL", "PERSONAL_USER");
        for (var i = 0; i < 2; i++) {
            jdbc.update("insert into company_inquiries(id, company_id, consumer_id, material_quote_id, material_name, "
                            + "contact_name, contact_info, message, status, version, created_at, updated_at) "
                            + "values (?, ?, ?, ?, 'notify-mat', 'Li', '13900000000', 'q', 'NEW', 0, now(), now())",
                    UUID.randomUUID(), COMPANY_A, consumerId, quoteIds.get(i));
        }

        mockMvc.perform(get("/api/v1/notifications").with(tokenFor(userA, COMPANY_A, "COMPANY_ADMIN")))
                .andExpect(status().isOk())
                // 1 条认证 + 2 条报价 + 2 条咨询
                .andExpect(jsonPath("$.data.length()").value(5))
                .andExpect(jsonPath("$.data[?(@.type == 'CERTIFICATION')].title")
                        .value(org.hamcrest.Matchers.contains("企业认证已通过")))
                .andExpect(jsonPath("$.data[?(@.type == 'QUOTE_EXPIRING')].key").value(org.hamcrest.Matchers.hasSize(2)))
                .andExpect(jsonPath("$.data[?(@.type == 'INQUIRY')].key").value(org.hamcrest.Matchers.hasSize(2)));
    }

    /** 管理员视角：多条 PENDING 认证必须全部进通知，同样验证逐行循环。 */
    @Test
    void adminNotificationListReadsAllPendingCertifications() throws Exception {
        var adminId = UUID.randomUUID();
        jdbc.update("insert into auth_users(id, email, password_hash, display_name, account_type, role, created_at) "
                        + "values (?, ?, ?, ?, ?, ?, now())",
                adminId, "notify-admin@example.test", "x", "Admin", "PERSONAL", "PLATFORM_ADMIN");

        for (var i = 0; i < 3; i++) {
            var companyId = UUID.randomUUID();
            jdbc.update("insert into auth_companies(id, name, created_at) values (?, ?, now())",
                    companyId, "Pending Co " + i);
            jdbc.update("insert into company_certifications(id, company_id, company_name, contact_name, contact_info, "
                            + "service_areas, document_refs, status, version, submitted_at, updated_at) "
                            + "values (?, ?, ?, 'Zhang', '13800000000', '[]'::jsonb, '[]'::jsonb, 'PENDING', 0, now(), now())",
                    UUID.randomUUID(), companyId, "Pending Co " + i);
        }

        mockMvc.perform(get("/api/v1/notifications").with(tokenFor(adminId, null, "PLATFORM_ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[?(@.type == 'ADMIN_REVIEW')].key")
                        .value(org.hamcrest.Matchers.hasSize(3)));
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder pu(String path) {
        return org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(path);
    }

    private static JwtRequestPostProcessor token(UUID companyId, String role) {
        return jwt().jwt(jwt -> jwt.claim("companyId", companyId.toString()).claim("roles", java.util.List.of(role)))
                .authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_" + role));
    }

    /** 同上，但显式带上 subject：通知接口按 jwt.getSubject() 取 recipientId。 */
    private static JwtRequestPostProcessor tokenFor(UUID userId, UUID companyId, String role) {
        return jwt().jwt(jwt -> {
            jwt.subject(userId.toString()).claim("roles", java.util.List.of(role));
            if (companyId != null) jwt.claim("companyId", companyId.toString());
        }).authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_" + role));
    }

    /** 报价有效期只允许“今天起 10 年内”，写死年份会随时间推移失效，因此动态生成。 */
    private static String futureDate() {
        return java.time.LocalDate.now().plusYears(1).toString();
    }

    private static String env(String name, String fallback) {
        var value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }
}
