package com.decoration.business;

import com.decoration.shared.api.ApiExceptionHandler;
import com.decoration.shared.security.SecurityConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(BusinessDataController.class)
@Import({ApiExceptionHandler.class, SecurityConfiguration.class})
class BusinessDataControllerTest {
    private static final UUID COMPANY_A = UUID.fromString("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private BusinessDataService service;

    @MockBean
    private StyleProfileService styleProfileService;

    @Test
    void requiresAuthenticationForBusinessRoutes() throws Exception {
        mockMvc.perform(get("/api/v1/business/cases"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"))
                .andExpect(jsonPath("$.data").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void rejectsViewerWritesBeforeCallingService() throws Exception {
        mockMvc.perform(post("/api/v1/business/material-quotes")
                        .with(jwt().jwt(token -> token.claim("companyId", COMPANY_A.toString()).claim("roles", List.of("COMPANY_VIEWER")))
                                .authorities(new SimpleGrantedAuthority("ROLE_COMPANY_VIEWER")))
                        .header("Idempotency-Key", "quote-key-0001")
                        .contentType("application/json")
                        .content("""
                                {"name":"oak floor","spec":"solid","unit":"sqm","price":12.50,"category":"floor","region":"Shanghai","validUntil":"2099-01-01"}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        verify(service, never()).createMaterialQuote(any(), any(), any());
    }

    @Test
    void scopesQueriesToCompanyClaim() throws Exception {
        given(service.listCases(eq(COMPANY_A), any(), eq(1), eq(20), eq("updatedAt")))
                .willReturn(new BusinessDtos.Page<>(List.of(), new BusinessDtos.PageMeta(1, 20, 0, 0)));

        mockMvc.perform(get("/api/v1/business/cases")
                        .with(jwt().jwt(token -> token.claim("companyId", COMPANY_A.toString()).claim("roles", List.of("COMPANY_VIEWER")))
                                .authorities(new SimpleGrantedAuthority("ROLE_COMPANY_VIEWER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items").isArray())
                .andExpect(jsonPath("$.data.items").isEmpty());
        verify(service).listCases(eq(COMPANY_A), any(), eq(1), eq(20), eq("updatedAt"));
    }

    @Test
    void rejectsUnknownFieldsAndInvalidAmounts() throws Exception {
        mockMvc.perform(post("/api/v1/business/material-quotes")
                        .with(jwt().jwt(token -> token.claim("companyId", COMPANY_A.toString()).claim("roles", List.of("COMPANY_ADMIN")))
                                .authorities(new SimpleGrantedAuthority("ROLE_COMPANY_ADMIN")))
                        .header("Idempotency-Key", "quote-key-0002")
                        .contentType("application/json")
                        .content("""
                                {"name":"oak floor","spec":"solid","unit":"sqm","price":0,"category":"floor","region":"Shanghai","validUntil":"2099-01-01","companyId":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        verify(service, never()).createMaterialQuote(any(), any(), any());
    }

    @Test
    void mapsMissingRequiredRequestValuesToClientErrors() throws Exception {
        mockMvc.perform(post("/api/v1/business/material-quotes")
                        .with(jwt().jwt(token -> token.claim("companyId", COMPANY_A.toString()).claim("roles", List.of("COMPANY_ADMIN")))
                                .authorities(new SimpleGrantedAuthority("ROLE_COMPANY_ADMIN")))
                        .contentType("application/json")
                        .content("""
                                {"name":"oak floor","spec":"solid","unit":"sqm","price":12.50,"category":"floor","region":"Shanghai","validUntil":"2099-01-01"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        mockMvc.perform(delete("/api/v1/business/cases/{caseId}", UUID.randomUUID())
                        .with(jwt().jwt(token -> token.claim("companyId", COMPANY_A.toString()).claim("roles", List.of("COMPANY_ADMIN")))
                                .authorities(new SimpleGrantedAuthority("ROLE_COMPANY_ADMIN"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }
}
