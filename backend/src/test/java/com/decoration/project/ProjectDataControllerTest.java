package com.decoration.project;

import com.decoration.shared.api.ApiExceptionHandler;
import com.decoration.shared.security.SecurityConfiguration;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ProjectDataController.class)
@Import({ApiExceptionHandler.class, SecurityConfiguration.class})
class ProjectDataControllerTest {
    private static final UUID COMPANY_A = UUID.fromString("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    private static final UUID PROJECT_A = UUID.fromString("11111111-1111-4111-8111-111111111111");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private ProjectDataService service;

    @MockBean
    private ProjectHistoryService historyService;

    @Test
    void requiresAuthenticationForProjectRoutes() throws Exception {
        mockMvc.perform(get("/api/v1/projects"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void scopesProjectListToCompanyClaim() throws Exception {
        given(service.list(COMPANY_A)).willReturn(List.of());

        mockMvc.perform(get("/api/v1/projects")
                        .with(jwt().jwt(token -> token.claim("companyId", COMPANY_A.toString()).claim("roles", List.of("COMPANY_VIEWER")))
                                .authorities(new SimpleGrantedAuthority("ROLE_COMPANY_VIEWER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isEmpty());

        verify(service).list(COMPANY_A);
    }

    @Test
    void rejectsViewerWritesBeforeCallingService() throws Exception {
        mockMvc.perform(put("/api/v1/projects/{projectId}", PROJECT_A)
                        .with(jwt().jwt(token -> token.claim("companyId", COMPANY_A.toString()).claim("roles", List.of("COMPANY_VIEWER")))
                                .authorities(new SimpleGrantedAuthority("ROLE_COMPANY_VIEWER")))
                        .contentType("application/json")
                        .content("{\"id\":\"11111111-1111-4111-8111-111111111111\",\"name\":\"Project\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        verify(service, never()).save(eq(COMPANY_A), eq(PROJECT_A), org.mockito.ArgumentMatchers.any());
    }

    @Test
    void rejectsProjectIdThatDoesNotMatchPath() throws Exception {
        var otherProject = UUID.fromString("22222222-2222-4222-8222-222222222222");
        given(service.save(eq(COMPANY_A), eq(PROJECT_A), org.mockito.ArgumentMatchers.any()))
                .willThrow(new com.decoration.shared.api.BusinessApiException(org.springframework.http.HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Project ID mismatch"));

        mockMvc.perform(put("/api/v1/projects/{projectId}", PROJECT_A)
                        .with(jwt().jwt(token -> token.claim("companyId", COMPANY_A.toString()).claim("roles", List.of("COMPANY_ADMIN")))
                                .authorities(new SimpleGrantedAuthority("ROLE_COMPANY_ADMIN")))
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(objectMapper.createObjectNode().put("id", otherProject.toString()))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    void deleteUsesCompanyScope() throws Exception {
        mockMvc.perform(delete("/api/v1/projects/{projectId}", PROJECT_A)
                        .with(jwt().jwt(token -> token.claim("companyId", COMPANY_A.toString()).claim("roles", List.of("COMPANY_EDITOR")))
                                .authorities(new SimpleGrantedAuthority("ROLE_COMPANY_EDITOR"))))
                .andExpect(status().isNoContent());
        verify(service).delete(COMPANY_A, PROJECT_A);
    }
}
