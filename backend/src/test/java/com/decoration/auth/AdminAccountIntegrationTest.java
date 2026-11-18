package com.decoration.auth;

import com.decoration.business.PublicCaseCatalogService;
import com.decoration.business.PublicCompanyService;
import com.decoration.business.BusinessAssetService;
import com.decoration.business.InquiryDtos;
import com.decoration.business.InquiryService;
import com.decoration.design.InspirationSubmissionService;
import com.decoration.material.MaterialCatalogService;
import com.decoration.saas.PersonalCreditService;
import com.decoration.shared.api.BusinessApiException;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.JwtRequestPostProcessor;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.sql.DriverManager;
import java.nio.file.Path;
import java.util.UUID;

import static com.decoration.auth.AdminAccountDtos.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class AdminAccountIntegrationTest {
    private static final String SCHEMA = "decoration_accounts_test_" + UUID.randomUUID().toString().replace("-", "");
    private static final String URL = env("DATABASE_TEST_URL", "jdbc:postgresql://localhost:5432/decoration");
    private static final String USER = env("DATABASE_TEST_USERNAME", env("DATABASE_USERNAME", "decoration"));
    private static final String PASSWORD = env("DATABASE_TEST_PASSWORD", env("DATABASE_PASSWORD", "decoration"));
    private static final String ACCOUNT_PASSWORD = "Test-account-2026!";

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
    @Autowired AdminAccountService service;
    @Autowired AuthService auth;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @Autowired JwtDecoder decoder;
    @Autowired PersonalCreditService credits;
    @Autowired InspirationSubmissionService submissions;
    @Autowired PublicCompanyService publicCompanies;
    @Autowired PublicCaseCatalogService publicCases;
    @Autowired MaterialCatalogService materials;
    @Autowired InquiryService inquiries;
    @TempDir Path storage;
    private UUID actor;
    private Account personal;

    @BeforeEach void setup() {
        actor = UUID.randomUUID();
        jdbc.update("insert into auth_users(id,email,password_hash,display_name,account_type,role,created_at) values (?,?,'test-hash','账号管理测试管理员','PERSONAL','PLATFORM_ADMIN',now())", actor, actor + "@example.com");
        personal = create("PERSONAL");
    }
    private Account create(String type) {
        return service.create(actor, new CreateRequest(UUID.randomUUID() + "@example.com", ACCOUNT_PASSWORD, "测试昵称", type, type.equals("BUSINESS") ? "测试企业" : null));
    }
    private JwtRequestPostProcessor admin() { return jwt().jwt(token -> token.subject(actor.toString())).authorities(new SimpleGrantedAuthority("ROLE_PLATFORM_ADMIN")); }

    @Test void createsCorrectRolesHashesPasswordAndDoesNotCreateASession() {
        var business = create("BUSINESS");
        assertEquals("COMPANY_ADMIN", jdbc.queryForObject("select role from auth_users where id = ?", String.class, business.id()));
        assertEquals("测试企业", jdbc.queryForObject("select name from company_profiles where company_id = ?", String.class, business.companyId()));
        var hash = jdbc.queryForObject("select password_hash from auth_users where id = ?", String.class, personal.id());
        assertTrue(new BCryptPasswordEncoder().matches(ACCOUNT_PASSWORD, hash));
        assertEquals(0, jdbc.queryForObject("select count(*) from auth_sessions where user_id = ?", Integer.class, personal.id()));
        assertEquals(1, jdbc.queryForObject("select count(*) from admin_audit_logs where target_id = ? and action = 'ACCOUNT_CREATE'", Integer.class, personal.id()));
    }

    @Test void personalAndBusinessSearchStatusAndPaginationAreIsolated() {
        var business = create("BUSINESS");
        service.changeStatus(actor, business.id(), "DISABLED");
        assertEquals(0, service.list("PERSONAL", "ALL", business.email(), 1, 20).total());
        assertEquals(0, service.list("BUSINESS", "ACTIVE", business.email(), 1, 20).total());
        var page = service.list("BUSINESS", "DISABLED", business.email(), 1, 1);
        assertEquals(1, page.total()); assertEquals(business.id(), page.items().getFirst().id());
        assertTrue(service.list("BUSINESS", "DISABLED", business.email(), 2, 1).items().isEmpty());
        assertEquals(0, service.list("PERSONAL", "ALL", "%", 1, 20).total());
        assertEquals(0, service.list("PERSONAL", "ALL", actor + "@example.com", 1, 20).total());
    }

    @Test void updatesEnterpriseNameEverywhereWithoutChangingCertificationDecision() {
        var business = create("BUSINESS");
        jdbc.update("""
                insert into company_certifications(company_id,id,company_name,contact_name,contact_info,status,reviewed_by,reviewed_at,submitted_at,updated_at)
                values (?,?,'测试企业','测试联系人','contact','APPROVED',?,now(),now(),now())
                """, business.companyId(), UUID.randomUUID(), actor);
        var result = service.update(actor, business.id(), new UpdateRequest(business.email(), "新昵称", "新的企业名称"));
        assertEquals("新的企业名称", result.companyName());
        assertEquals("新的企业名称", jdbc.queryForObject("select name from auth_companies where id = ?", String.class, business.companyId()));
        assertEquals("新的企业名称", jdbc.queryForObject("select company_name from company_certifications where company_id = ?", String.class, business.companyId()));
        assertEquals("APPROVED", result.certificationStatus());
        assertEquals(1, jdbc.queryForObject("select version from company_profiles where company_id = ?", Integer.class, business.companyId()));
    }

    @Test void rejectsDuplicateEmailWithoutPartiallyUpdatingAccount() {
        var other = create("PERSONAL");
        assertEquals("ACCOUNT_EXISTS", assertThrows(BusinessApiException.class,
                () -> service.update(actor, personal.id(), new UpdateRequest(other.email().toUpperCase(), "不应保存", null))).code());
        assertEquals("测试昵称", service.detail(personal.id()).account().displayName());
        assertThrows(BusinessApiException.class, () -> service.create(actor, new CreateRequest(personal.email().toUpperCase(), ACCOUNT_PASSWORD, "重复", "PERSONAL", null)));
    }

    @Test void disablingRevokesExistingTokensAndReenableRequiresNewLogin() {
        var token = auth.login(new AuthDtos.LoginRequest(personal.email(), ACCOUNT_PASSWORD, "personal"), "test", "127.0.0.1").accessToken();
        decoder.decode(token);
        service.changeStatus(actor, personal.id(), "DISABLED");
        assertThrows(JwtException.class, () -> decoder.decode(token));
        assertEquals("ACCOUNT_UNAVAILABLE", assertThrows(BusinessApiException.class,
                () -> auth.login(new AuthDtos.LoginRequest(personal.email(), ACCOUNT_PASSWORD, "personal"), "test", "127.0.0.1")).code());
        service.changeStatus(actor, personal.id(), "ACTIVE");
        assertThrows(JwtException.class, () -> decoder.decode(token));
        var fresh = auth.login(new AuthDtos.LoginRequest(personal.email(), ACCOUNT_PASSWORD, "personal"), "test", "127.0.0.1");
        assertEquals(personal.id().toString(), decoder.decode(fresh.accessToken()).getSubject());
    }

    @Test void changingEmailRevokesSessionsAndNormalizesTheNewEmail() {
        var token = auth.login(new AuthDtos.LoginRequest(personal.email(), ACCOUNT_PASSWORD, "personal"), "test", "127.0.0.1").accessToken();
        var email = "new-" + UUID.randomUUID() + "@EXAMPLE.COM";
        assertEquals(email.toLowerCase(), service.update(actor, personal.id(), new UpdateRequest(email, "新的昵称", null)).email());
        assertThrows(JwtException.class, () -> decoder.decode(token));
        assertEquals(personal.id(), auth.login(new AuthDtos.LoginRequest(email, ACCOUNT_PASSWORD, "personal"), "test", "127.0.0.1").user().id());
    }

    @Test void deletedAccountsKeepLedgerAndSubmissionsButCannotLoginOrBeReenabled() {
        credits.grant(personal.id(), 500, "测试积分");
        var submissionId = UUID.randomUUID();
        jdbc.update("insert into inspiration_submissions(id,owner_id,title,style,status,created_at,updated_at) values (?,?,'用户投稿','现代简约','APPROVED',now(),now())", submissionId, personal.id());
        assertEquals(800, service.detail(personal.id()).account().balance());
        assertEquals(2, service.detail(personal.id()).creditEntries().size());
        assertEquals(submissionId, service.detail(personal.id()).submissions().getFirst().id());
        assertTrue(submissions.listPublic().stream().anyMatch(item -> item.id().equals(submissionId)));
        service.delete(actor, personal.id());
        assertEquals("DELETED", jdbc.queryForObject("select account_status from auth_users where id = ?", String.class, personal.id()));
        assertEquals(800, jdbc.queryForObject("select balance from personal_credit_accounts where user_id = ?", Long.class, personal.id()));
        assertEquals(2, jdbc.queryForObject("select count(*) from personal_credit_ledger where user_id = ?", Integer.class, personal.id()));
        assertTrue(submissions.listPublic().stream().noneMatch(item -> item.id().equals(submissionId)));
        assertEquals(0, service.list("PERSONAL", "ALL", personal.email(), 1, 20).total());
        assertThrows(BusinessApiException.class, () -> service.detail(personal.id()));
        assertThrows(BusinessApiException.class, () -> service.changeStatus(actor, personal.id(), "ACTIVE"));
        assertThrows(BusinessApiException.class, () -> auth.login(new AuthDtos.LoginRequest(personal.email(), ACCOUNT_PASSWORD, "personal"), "test", "127.0.0.1"));
        assertThrows(BusinessApiException.class, () -> credits.grant(personal.id(), 10, "不应发放"));
    }

    @Test void disabledEnterprisesAreHiddenFromConsumerCompanyCaseAndMaterialListings() {
        var business = create("BUSINESS");
        var caseId = UUID.randomUUID(); var materialId = UUID.randomUUID();
        jdbc.update("insert into company_certifications(company_id,id,company_name,contact_name,contact_info,status,reviewed_by,reviewed_at,submitted_at,updated_at) values (?,?,'测试企业','联系人','contact','APPROVED',?,now(),now(),now())", business.companyId(), UUID.randomUUID(), actor);
        jdbc.update("insert into business_cases(id,company_id,title,status,created_at,updated_at) values (?,?,'完工案例','published',now(),now())", caseId, business.companyId());
        jdbc.update("insert into material_quotes(id,company_id,name,specification,unit,price,category,region,valid_until,created_at,updated_at) values (?,?,'测试材料','标准','㎡',100,'地板','测试地区',current_date + 30,now(),now())", materialId, business.companyId());
        var assets = new BusinessAssetService(jdbc, storage.toString(), 1024);
        var image = assets.upload(business.companyId(), new MockMultipartFile("file", "material.png", "image/png", new byte[]{1, 2, 3}));
        jdbc.update("insert into material_quote_images(company_id,quote_id,image_id,position) values (?,?,?,0)", business.companyId(), materialId, image.id());
        jdbc.update("insert into business_case_files(company_id,case_id,file_id,position) values (?,?,?,0)", business.companyId(), caseId, image.id());
        jdbc.update("update company_profiles set logo_asset_id = ? where company_id = ?", image.id(), business.companyId());
        assertNotNull(assets.getPublicMaterialImage(materialId, image.id()));
        assertNotNull(assets.getPublicCaseFile(caseId, image.id()));
        assertNotNull(assets.getPublicCompanyImage(business.companyId(), image.id()));
        assertEquals(business.companyId(), publicCompanies.get(business.companyId()).companyId());
        assertTrue(publicCases.list(null,null,null,null,null,null,null,1,100).items().stream().anyMatch(item -> item.id().equals(caseId)));
        assertTrue(materials.list(null,null,null,null,false,1,100,null).items().stream().anyMatch(item -> item.id().equals(materialId)));
        service.changeStatus(actor, business.id(), "DISABLED");
        assertThrows(BusinessApiException.class, () -> publicCompanies.get(business.companyId()));
        assertTrue(publicCases.list(null,null,null,null,null,null,null,1,100).items().stream().noneMatch(item -> item.id().equals(caseId)));
        assertTrue(materials.list(null,null,null,null,false,1,100,null).items().stream().noneMatch(item -> item.id().equals(materialId)));
        assertThrows(BusinessApiException.class, () -> assets.getPublicMaterialImage(materialId, image.id()));
        assertThrows(BusinessApiException.class, () -> assets.getPublicCaseFile(caseId, image.id()));
        assertThrows(BusinessApiException.class, () -> assets.getPublicCompanyImage(business.companyId(), image.id()));
        assertThrows(BusinessApiException.class, () -> inquiries.create(personal.id(), UUID.randomUUID().toString(), new InquiryDtos.CreateInquiryRequest(materialId, "联系人", "test@example.com", "不应提交")));
        service.changeStatus(actor, business.id(), "ACTIVE");
        assertEquals(business.companyId(), publicCompanies.get(business.companyId()).companyId());
        assertNotNull(assets.getPublicMaterialImage(materialId, image.id()));
    }

    @Test void cannotModifyPlatformAdminsOrResellerAccounts() {
        var reseller = UUID.randomUUID();
        jdbc.update("insert into auth_users(id,email,password_hash,display_name,account_type,role,created_at) values (?,?,'test','代理','PERSONAL','RESELLER_ADMIN',now())", reseller, reseller + "@example.com");
        for (var id : java.util.List.of(actor, reseller)) {
            assertThrows(BusinessApiException.class, () -> service.update(actor, id, new UpdateRequest("x@example.com", "越权", null)));
            assertThrows(BusinessApiException.class, () -> service.changeStatus(actor, id, "DISABLED"));
            assertThrows(BusinessApiException.class, () -> service.delete(actor, id));
        }
    }

    @ParameterizedTest @ValueSource(strings = {"PERSONAL_USER", "COMPANY_ADMIN", "RESELLER_ADMIN"})
    void allManagementEndpointsRejectOtherRoles(String role) throws Exception {
        var caller = jwt().authorities(new SimpleGrantedAuthority("ROLE_" + role));
        mvc.perform(get("/api/v1/admin/accounts").with(caller)).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/admin/accounts/{id}", personal.id()).with(caller)).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/admin/accounts").with(caller).contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"other@example.com\",\"password\":\"test-password\",\"displayName\":\"test\",\"accountType\":\"PERSONAL\"}")).andExpect(status().isForbidden());
        mvc.perform(put("/api/v1/admin/accounts/{id}", personal.id()).with(caller).contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"other@example.com\",\"displayName\":\"test\"}")).andExpect(status().isForbidden());
        mvc.perform(patch("/api/v1/admin/accounts/{id}/status", personal.id()).with(caller).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"DISABLED\"}")).andExpect(status().isForbidden());
        mvc.perform(delete("/api/v1/admin/accounts/{id}", personal.id()).with(caller)).andExpect(status().isForbidden());
    }

    @Test void managementRequiresAuthenticationAndValidatesRequests() throws Exception {
        mvc.perform(get("/api/v1/admin/accounts")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/admin/accounts").param("page", "0").with(admin())).andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/admin/accounts").with(admin()).contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"invalid\",\"password\":\"short\",\"displayName\":\"\",\"accountType\":\"PERSONAL\"}")).andExpect(status().isBadRequest());
        mvc.perform(patch("/api/v1/admin/accounts/{id}/status", personal.id()).with(admin()).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"DELETED\"}")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/admin/accounts").with(admin()).param("query", personal.email())).andExpect(status().isOk()).andExpect(jsonPath("$.data.items[0].id").value(personal.id().toString()));
    }

    @Test void businessCreateAndInvalidPasswordRollBackWithoutOrphanCompany() {
        assertThrows(BusinessApiException.class, () -> service.create(actor, new CreateRequest(UUID.randomUUID() + "@example.com", ACCOUNT_PASSWORD, "企业", "BUSINESS", " ")));
        assertThrows(BusinessApiException.class, () -> service.create(actor, new CreateRequest(UUID.randomUUID() + "@example.com", "密".repeat(30), "企业", "BUSINESS", "不应创建")));
        assertEquals(0, jdbc.queryForObject("select count(*) from auth_companies where name = '不应创建'", Integer.class));
    }

    private static String env(String name, String fallback) { var value = System.getenv(name); return value == null || value.isBlank() ? fallback : value; }
}
