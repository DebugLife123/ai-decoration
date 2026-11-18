package com.decoration.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.sql.DriverManager;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class PlatformContactIntegrationTest {
    private static final String SCHEMA = "decoration_contact_test_" + UUID.randomUUID().toString().replace("-", "");
    private static final String URL = env("DATABASE_TEST_URL", "jdbc:postgresql://localhost:5432/decoration");
    private static final String USER = env("DATABASE_TEST_USERNAME", env("DATABASE_USERNAME", "decoration"));
    private static final String PASSWORD = env("DATABASE_TEST_PASSWORD", env("DATABASE_PASSWORD", "decoration"));

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> URL + (URL.contains("?") ? "&" : "?") + "currentSchema=" + SCHEMA);
        registry.add("spring.datasource.username", () -> USER);
        registry.add("spring.datasource.password", () -> PASSWORD);
        registry.add("spring.flyway.schemas", () -> SCHEMA);
        registry.add("spring.flyway.default-schema", () -> SCHEMA);
    }

    @AfterAll static void cleanup() throws Exception {
        try (var connection = DriverManager.getConnection(URL, USER, PASSWORD); var statement = connection.createStatement()) {
            statement.execute("drop schema if exists " + SCHEMA + " cascade");
        }
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper mapper;
    private UUID adminId;

    @BeforeEach void setup() {
        adminId = UUID.randomUUID();
        jdbc.update("insert into auth_users(id,email,password_hash,display_name,account_type,role,created_at) values (?,?,'test-hash','联系人测试管理员','PERSONAL','PLATFORM_ADMIN',now())", adminId, adminId + "@example.test");
        jdbc.update("update platform_contact_settings set contact_name = '', phone = '', email = '', wechat = '', message = '账号已停用或删除，请联系平台管理员。', updated_by = null where id = 1");
    }

    @Test void anonymousCanReadOnlyPublicFields() throws Exception {
        mvc.perform(get("/api/v1/platform-contact")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.phone").value(""))
                .andExpect(jsonPath("$.data.message").value("账号已停用或删除，请联系平台管理员。"))
                .andExpect(jsonPath("$.data.updatedBy").doesNotExist())
                .andExpect(jsonPath("$.data.updatedAt").doesNotExist());
        mvc.perform(get("/api/v1/admin/platform-contact")).andExpect(status().isUnauthorized());
        mvc.perform(put("/api/v1/admin/platform-contact").contentType(MediaType.APPLICATION_JSON).content(body()))
                .andExpect(status().isUnauthorized());
    }

    @ParameterizedTest
    @ValueSource(strings = { "PERSONAL_USER", "COMPANY_ADMIN", "RESELLER_ADMIN" })
    void deniesReadsAndWritesToOtherRoles(String role) throws Exception {
        var token = jwt().jwt(jwt -> jwt.subject(adminId.toString())).authorities(new SimpleGrantedAuthority("ROLE_" + role));
        mvc.perform(get("/api/v1/admin/platform-contact").with(token)).andExpect(status().isForbidden());
        mvc.perform(put("/api/v1/admin/platform-contact").with(token).contentType(MediaType.APPLICATION_JSON).content(body()))
                .andExpect(status().isForbidden());
        assertEquals("", jdbc.queryForObject("select phone from platform_contact_settings where id = 1", String.class));
    }

    @Test void administratorCanSaveReadAndPublishWithAudit() throws Exception {
        save();
        mvc.perform(get("/api/v1/admin/platform-contact").with(admin())).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.contactName").value("平台客服"))
                .andExpect(jsonPath("$.data.updatedAt").isString());
        mvc.perform(get("/api/v1/platform-contact")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.email").value("support@example.test"))
                .andExpect(jsonPath("$.data.wechat").value("support-test"));
        assertEquals(adminId, jdbc.queryForObject("select updated_by from platform_contact_settings where id = 1", UUID.class));
        assertEquals(1, jdbc.queryForObject("select count(*) from admin_audit_logs where actor_id = ? and action = 'PLATFORM_CONTACT_UPDATE'", Integer.class, adminId));
    }

    @Test void invalidFieldsDoNotOverwriteSettings() throws Exception {
        for (var bad : new Object[] { Map.of("email", "invalid"), Map.of("phone", "x".repeat(81)), Map.of("message", "x".repeat(501)) }) {
            var fields = mapper.readValue(body(), new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() { });
            @SuppressWarnings("unchecked") var overrides = (Map<String, Object>) bad;
            fields.putAll(overrides);
            mvc.perform(put("/api/v1/admin/platform-contact").with(admin()).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(fields)))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        }
        mvc.perform(put("/api/v1/admin/platform-contact").with(admin()).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        assertEquals("", jdbc.queryForObject("select contact_name from platform_contact_settings where id = 1", String.class));
    }

    @ParameterizedTest
    @ValueSource(strings = { "DISABLED", "DELETED" })
    void unavailableLoginReturnsConfiguredContactsButWrongPasswordDoesNot(String accountStatus) throws Exception {
        save();
        var email = UUID.randomUUID() + "@example.test";
        var password = "Test-contact-2026!";
        jdbc.update("insert into auth_users(id,email,password_hash,display_name,account_type,role,account_status,created_at) values (?,?,?,'停用测试','PERSONAL','PERSONAL_USER',?,now())", UUID.randomUUID(), email, new BCryptPasswordEncoder().encode(password), accountStatus);
        for (var path : new String[] { "/api/v1/auth/login", "/api/v1/auth/admin/login" }) {
            mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of("email", email, "password", password))))
                    .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ACCOUNT_UNAVAILABLE"))
                    .andExpect(jsonPath("$.message").value("请联系平台处理账号问题。"))
                    .andExpect(jsonPath("$.data.phone").value("400-123-4567"))
                    .andExpect(jsonPath("$.data.email").value("support@example.test"))
                    .andExpect(jsonPath("$.data.updatedBy").doesNotExist());
        }
        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of("email", email, "password", "Wrong-password!"))))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"))
                .andExpect(jsonPath("$.data").isEmpty());
    }

    private void save() throws Exception {
        mvc.perform(put("/api/v1/admin/platform-contact").with(admin()).contentType(MediaType.APPLICATION_JSON).content(body()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.contactName").value("平台客服"));
    }
    private org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.JwtRequestPostProcessor admin() {
        return jwt().jwt(token -> token.subject(adminId.toString())).authorities(new SimpleGrantedAuthority("ROLE_PLATFORM_ADMIN"));
    }
    private String body() throws Exception {
        return mapper.writeValueAsString(Map.of("contactName", " 平台客服 ", "phone", "400-123-4567", "email", "support@example.test", "wechat", "support-test", "message", "请联系平台处理账号问题。"));
    }
    private static String env(String name, String fallback) {
        var value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }
}
