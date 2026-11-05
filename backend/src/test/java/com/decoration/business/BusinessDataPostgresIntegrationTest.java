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
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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

    @BeforeEach
    void clearRows() {
        jdbc.update("delete from business_idempotency_keys");
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
                                {"name":"Company A","city":"Shanghai","services":"design","intro":"A"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.name").value("Company A"))
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
                {"name":"oak","spec":"solid","unit":"sqm","price":12.50,"category":"floor","region":"Shanghai","validUntil":"%s"}
                """.formatted(futureDate());
        var first = mockMvc.perform(post("/api/v1/business/material-quotes")
                        .with(token(COMPANY_A, "COMPANY_EDITOR"))
                        .header("Idempotency-Key", "material-key-0001")
                        .contentType("application/json").content(body))
                .andExpect(status().isCreated())
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
        var certification = mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(
                        "/api/v1/business/certification")
                        .header("Authorization", "Bearer " + companyToken).contentType("application/json")
                        .content("""
                                {"companyName":"Cert Studio","contactName":"Test Admin","contactInfo":"admin@example.test","serviceAreas":["Shanghai"],"documentRefs":["company/license.pdf"]}
                                """))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("PENDING"))
                .andReturn().getResponse().getContentAsString();
        var version = mapper.readTree(certification).path("data").path("version").asInt();
        var adminId = UUID.randomUUID();
        mockMvc.perform(post("/api/v1/business/certification/{companyId}/review", companyId)
                        .with(jwt().jwt(token -> token.subject(adminId.toString()).claim("roles", java.util.List.of("PLATFORM_ADMIN")))
                                .authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_PLATFORM_ADMIN")))
                        .contentType("application/json")
                        .content("{\"status\":\"APPROVED\",\"reviewNote\":\"Verified\",\"version\":%d}".formatted(version)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("APPROVED"))
                .andExpect(jsonPath("$.data.reviewedBy").value(adminId.toString()));
    }

    @Test
    void publishesOnlyCertifiedQuotesToConsumerCatalog() throws Exception {
        var certifiedCompany = UUID.randomUUID();
        var pendingCompany = UUID.randomUUID();
        jdbc.update("insert into auth_companies(id, name, created_at) values (?, ?, now())", certifiedCompany, "Certified Studio");
        jdbc.update("insert into auth_companies(id, name, created_at) values (?, ?, now())", pendingCompany, "Pending Studio");

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
        mockMvc.perform(post("/api/v1/business/certification/{companyId}/review", certifiedCompany)
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

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder pu(String path) {
        return org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(path);
    }

    private static JwtRequestPostProcessor token(UUID companyId, String role) {
        return jwt().jwt(jwt -> jwt.claim("companyId", companyId.toString()).claim("roles", java.util.List.of(role)))
                .authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_" + role));
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
