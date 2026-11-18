package com.decoration.design;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import java.nio.file.*;
import java.sql.DriverManager;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class BusinessStyleSubmissionIntegrationTest {
    static final String SCHEMA = "style_submit_test_" + UUID.randomUUID().toString().replace("-", "");
    static final String URL = System.getenv().getOrDefault("DATABASE_TEST_URL", "jdbc:postgresql://localhost:5432/decoration");
    static final String USER = System.getenv().getOrDefault("DATABASE_TEST_USERNAME", "decoration");
    static final String PASSWORD = System.getenv().getOrDefault("DATABASE_TEST_PASSWORD", "decoration");
    @TempDir static Path storage;
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", () -> URL + (URL.contains("?") ? "&" : "?") + "currentSchema=" + SCHEMA);
        r.add("spring.datasource.username", () -> USER); r.add("spring.datasource.password", () -> PASSWORD);
        r.add("spring.flyway.schemas", () -> SCHEMA); r.add("spring.flyway.default-schema", () -> SCHEMA);
        r.add("app.storage.local-dir", () -> storage.toString());
    }
    @AfterAll static void cleanup() throws Exception {
        try (var c = DriverManager.getConnection(URL, USER, PASSWORD); var s = c.createStatement()) { s.execute("drop schema if exists " + SCHEMA + " cascade"); }
    }
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper mapper;
    UUID company, owner, admin, quote;
    @BeforeEach void setup() {
        jdbc.update("delete from inspiration_submissions");
        company = UUID.randomUUID(); owner = UUID.randomUUID(); admin = UUID.randomUUID(); quote = UUID.randomUUID();
        jdbc.update("insert into auth_companies(id,name,created_at) values (?, '原企业名称', now())", company);
        jdbc.update("insert into company_profiles(company_id,id,name,created_at,updated_at) values (?,?,'最新企业名称',now(),now())", company, UUID.randomUUID());
        jdbc.update("insert into auth_users(id,email,password_hash,display_name,account_type,company_id,role,created_at) values (?,?,'hash','企业','BUSINESS',?,'COMPANY_ADMIN',now())",owner,owner+"@example.test",company);
        jdbc.update("insert into auth_users(id,email,password_hash,display_name,account_type,role,created_at) values (?,?,'hash','审核员','PERSONAL','PLATFORM_ADMIN',now())",admin,admin+"@example.test");
        jdbc.update("insert into company_certifications(company_id,id,company_name,contact_name,contact_info,status,reviewed_by,reviewed_at,submitted_at,updated_at) values (?,?,'企业','联系人','电话','APPROVED',?,now(),now(),now())",company,UUID.randomUUID(),admin);
        jdbc.update("insert into material_quotes(id,company_id,name,specification,unit,price,category,region,valid_until,created_at,updated_at) values (?,?,'橡木地板','15mm','㎡',200,'地板','上海',current_date+30,now(),now())",quote,company);
    }
    org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.JwtRequestPostProcessor business(UUID companyId) {
        return jwt().jwt(t -> t.subject(owner.toString()).claim("companyId",companyId.toString())).authorities(new SimpleGrantedAuthority("ROLE_COMPANY_ADMIN"));
    }
    org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.JwtRequestPostProcessor reviewer() {
        return jwt().jwt(t -> t.subject(admin.toString())).authorities(new SimpleGrantedAuthority("ROLE_PLATFORM_ADMIN"));
    }
    MockMultipartFile image(String name, String type) { return new MockMultipartFile("images",name,type,new byte[]{1,2,3}); }
    org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder upload(UUID material) {
        return multipart("/api/v1/business/style-submissions").file(image("one.png","image/png")).file(image("two.png","image/png"))
                .param("title","暖木空间").param("style","modern").param("description","木色搭配").param("materialIds",material.toString());
    }
    com.fasterxml.jackson.databind.JsonNode create() throws Exception {
        return mapper.readTree(mvc.perform(upload(quote).with(business(company))).andExpect(status().isCreated()).andExpect(jsonPath("$.data.companyName").value("最新企业名称")).andExpect(jsonPath("$.data.submitterType").value("BUSINESS")).andReturn().getResponse().getContentAsString()).path("data");
    }
    void approve(String id) throws Exception {
        mvc.perform(put("/api/v1/admin/inspiration-submissions/"+id+"/review").with(reviewer()).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"APPROVED\",\"reviewNote\":\"通过\"}")).andExpect(status().isOk());
    }
    @Test void pendingImagesPrivateThenApprovalPublishesAllImagesWithoutPrivateFields() throws Exception {
        var item=create(); String id=item.path("id").asText(); String imageId=item.path("images").get(1).path("id").asText();
        mvc.perform(get("/api/v1/inspiration/submissions/public")).andExpect(jsonPath("$.data.length()").value(0));
        mvc.perform(get("/api/v1/inspiration/submissions/"+id+"/images/"+imageId)).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/business/style-submissions/"+id+"/images/"+imageId).with(business(company))).andExpect(status().isOk());
        approve(id);
        mvc.perform(get("/api/v1/inspiration/submissions/public")).andExpect(jsonPath("$.data[0].images.length()").value(2)).andExpect(jsonPath("$.data[0].companyName").value("最新企业名称")).andExpect(jsonPath("$.data[0].ownerEmail").isEmpty()).andExpect(jsonPath("$.data[0].materials").isEmpty());
        mvc.perform(get("/api/v1/inspiration/submissions/"+id+"/images/"+imageId)).andExpect(status().isOk());
        mvc.perform(get("/api/v1/admin/inspiration-submissions").with(reviewer())).andExpect(jsonPath("$.data[0].materials[0].name").value("橡木地板"));
    }
    @Test void certificationAndMaterialOwnershipAreEnforced() throws Exception {
        mvc.perform(upload(UUID.randomUUID()).with(business(company))).andExpect(status().isBadRequest());
        jdbc.update("delete from company_certifications where company_id = ?",company);
        mvc.perform(upload(quote).with(business(company))).andExpect(status().isConflict());
        assertEquals(0,jdbc.queryForObject("select count(*) from inspiration_submissions",Integer.class));
    }
    @Test void anotherCompanyCannotReadEditOrDeleteSubmission() throws Exception {
        var item=create();String id=item.path("id").asText();var other=business(UUID.randomUUID());
        mvc.perform(get("/api/v1/business/style-submissions").with(other)).andExpect(jsonPath("$.data").isEmpty());
        mvc.perform(get("/api/v1/business/style-submissions/"+id+"/images/"+item.path("images").get(0).path("id").asText()).with(other)).andExpect(status().isNotFound());
        mvc.perform(delete("/api/v1/business/style-submissions/"+id).with(other)).andExpect(status().isNotFound());
        mvc.perform(put("/api/v1/business/style-submissions/"+id).with(other).contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"x\",\"style\":\"modern\",\"description\":\"\",\"materialIds\":[]}")).andExpect(status().isConflict());
        assertEquals(1,jdbc.queryForObject("select count(*) from inspiration_submissions",Integer.class));
    }
    @Test void editingRependsAndConfirmedDeleteRemovesFilesAndLinks() throws Exception {
        var item=create(); String id=item.path("id").asText();approve(id);
        mvc.perform(put("/api/v1/business/style-submissions/"+id).with(business(company)).contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"修改后\",\"style\":\"modern\",\"description\":\"新说明\",\"materialIds\":[]}")).andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("PENDING")).andExpect(jsonPath("$.data.materials").isEmpty());
        mvc.perform(get("/api/v1/inspiration/submissions/public")).andExpect(jsonPath("$.data").isEmpty());
        var keys=jdbc.queryForList("select object_key from inspiration_submission_images where submission_id = ?",String.class,UUID.fromString(id));
        mvc.perform(delete("/api/v1/business/style-submissions/"+id).with(business(company))).andExpect(status().isOk());
        for(var key:keys) assertFalse(Files.exists(storage.resolve(key)));
        assertEquals(0,jdbc.queryForObject("select count(*) from inspiration_submission_images",Integer.class));
    }
    @Test void publicContentDisappearsWhenCertificationOrAccountUnavailable() throws Exception {
        var item=create();String id=item.path("id").asText();approve(id);
        jdbc.update("update auth_users set account_status='DISABLED' where id=?",owner);
        mvc.perform(get("/api/v1/inspiration/submissions/public")).andExpect(jsonPath("$.data").isEmpty());
        jdbc.update("update auth_users set account_status='ACTIVE' where id=?",owner);
        jdbc.update("delete from company_certifications where company_id=?",company);
        mvc.perform(get("/api/v1/inspiration/submissions/public")).andExpect(jsonPath("$.data").isEmpty());
        mvc.perform(get("/api/v1/inspiration/submissions/"+id+"/images/"+item.path("images").get(0).path("id").asText())).andExpect(status().isNotFound());
    }
    @Test void rolesAndMissingCompanyIdentityAreRejected() throws Exception {
        mvc.perform(get("/api/v1/business/style-submissions")).andExpect(status().isUnauthorized());
        mvc.perform(upload(quote).with(reviewer())).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/business/style-submissions").with(jwt().authorities(new SimpleGrantedAuthority("ROLE_COMPANY_ADMIN")))).andExpect(status().isForbidden());
    }
    @Test void partialUploadFailureRollsBackDatabaseAndFiles() throws Exception {
        long before; try(var files=Files.walk(storage)) { before=files.filter(Files::isRegularFile).count(); }
        mvc.perform(multipart("/api/v1/business/style-submissions").file(image("ok.png","image/png")).file(image("bad.exe","application/octet-stream")).param("title","测试").param("style","modern").with(business(company))).andExpect(status().isUnsupportedMediaType());
        assertEquals(0,jdbc.queryForObject("select count(*) from inspiration_submissions",Integer.class));
        try(var files=Files.walk(storage)) { assertEquals(before,files.filter(Files::isRegularFile).count()); }
    }
}
