package com.decoration.business;

import com.decoration.shared.api.ApiExceptionHandler;
import com.decoration.shared.security.SecurityConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;

import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AdminMarketplaceController.class)
@Import({ApiExceptionHandler.class, SecurityConfiguration.class})
class AdminMarketplaceControllerTest {
    private static final UUID QUOTE_ID = UUID.fromString("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    private static final UUID ADMIN_ID = UUID.fromString("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");

    @Autowired MockMvc mockMvc;
    @MockBean AdminMarketplaceService service;
    @MockBean AdminCompanyDetailService companyDetails;
    @MockBean BusinessAssetService assets;
    @MockBean AdminCompanyImportService companyImport;

    @Test
    void listsMaterialQuotesForPlatformAdmins() throws Exception {
        given(service.listQuotes("木地板", "ALL", 1, 20))
                .willReturn(new AdminMarketplaceService.Page(List.of(), 1, 20, 0, 0));

        mockMvc.perform(get("/api/v1/admin/marketplace/material-quotes")
                        .param("query", "木地板")
                        .with(jwt().jwt(token -> token.claim("roles", List.of("PLATFORM_ADMIN")))
                                .authorities(new SimpleGrantedAuthority("ROLE_PLATFORM_ADMIN"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total").value(0));

        verify(service).listQuotes("木地板", "ALL", 1, 20);
    }

    @Test
    void filtersMaterialQuotesByCompany() throws Exception {
        given(service.listQuotes(null, "ALL", QUOTE_ID, 1, 20))
                .willReturn(new AdminMarketplaceService.Page(List.of(), 1, 20, 0, 0));

        mockMvc.perform(get("/api/v1/admin/marketplace/material-quotes")
                        .param("companyId", QUOTE_ID.toString())
                        .with(jwt().jwt(token -> token.claim("roles", List.of("PLATFORM_ADMIN")))
                                .authorities(new SimpleGrantedAuthority("ROLE_PLATFORM_ADMIN"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total").value(0));

        verify(service).listQuotes(null, "ALL", QUOTE_ID, 1, 20);
    }

    @Test
    void loadsCompanyDetailsOnlyForPlatformAdmins() throws Exception {
        given(companyDetails.get(QUOTE_ID)).willReturn(new AdminCompanyDetailService.CompanyDetail(
                QUOTE_ID, "测试企业", List.of("admin@example.com"), null, null, null,
                List.of(), List.of(), List.of(), List.of()));

        mockMvc.perform(get("/api/v1/admin/marketplace/companies/{companyId}", QUOTE_ID)
                        .with(jwt().jwt(token -> token.claim("roles", List.of("PLATFORM_ADMIN")))
                                .authorities(new SimpleGrantedAuthority("ROLE_PLATFORM_ADMIN"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.registeredName").value("测试企业"));

        verify(companyDetails).get(QUOTE_ID);
        mockMvc.perform(get("/api/v1/admin/marketplace/companies/{companyId}", QUOTE_ID)
                        .with(jwt().jwt(token -> token.claim("roles", List.of("PERSONAL_USER")))
                                .authorities(new SimpleGrantedAuthority("ROLE_PERSONAL_USER"))))
                .andExpect(status().isForbidden());
    }

    @Test
    void rejectsInvalidVisibilityFilter() throws Exception {
        mockMvc.perform(get("/api/v1/admin/marketplace/material-quotes")
                        .param("visibility", "ANYTHING")
                        .with(jwt().jwt(token -> token.claim("roles", List.of("PLATFORM_ADMIN")))
                                .authorities(new SimpleGrantedAuthority("ROLE_PLATFORM_ADMIN"))))
                .andExpect(status().isBadRequest());

        verify(service, never()).listQuotes(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.anyInt(), org.mockito.ArgumentMatchers.anyInt());
    }

    @Test
    void recordsVisibilityChangesOnlyForPlatformAdmins() throws Exception {
        var admin = jwt().jwt(token -> token.subject(ADMIN_ID.toString()).claim("roles", List.of("PLATFORM_ADMIN")))
                .authorities(new SimpleGrantedAuthority("ROLE_PLATFORM_ADMIN"));
        mockMvc.perform(patch("/api/v1/admin/marketplace/material-quotes/{quoteId}/visibility", QUOTE_ID)
                        .with(admin).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"hidden\":true,\"reason\":\"报价信息不实\"}"))
                .andExpect(status().isOk());
        verify(service).setVisibility(QUOTE_ID, ADMIN_ID,
                new AdminMarketplaceService.VisibilityRequest(true, "报价信息不实"));

        mockMvc.perform(patch("/api/v1/admin/marketplace/material-quotes/{quoteId}/visibility", QUOTE_ID)
                        .with(jwt().jwt(token -> token.claim("roles", List.of("PERSONAL_USER")))
                                .authorities(new SimpleGrantedAuthority("ROLE_PERSONAL_USER")))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"hidden\":true}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void reviewsMaterialQuoteOnlyForPlatformAdmins() throws Exception {
        var admin = jwt().jwt(token -> token.subject(ADMIN_ID.toString()).claim("roles", List.of("PLATFORM_ADMIN")))
                .authorities(new SimpleGrantedAuthority("ROLE_PLATFORM_ADMIN"));
        mockMvc.perform(patch("/api/v1/admin/marketplace/material-quotes/{quoteId}/review", QUOTE_ID)
                        .with(admin).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"REJECTED\",\"reviewNote\":\"请补充规格图片\"}"))
                .andExpect(status().isOk());
        verify(service).reviewQuote(QUOTE_ID, ADMIN_ID,
                new AdminMarketplaceService.ReviewRequest("REJECTED", "请补充规格图片"));

        mockMvc.perform(patch("/api/v1/admin/marketplace/material-quotes/{quoteId}/review", QUOTE_ID)
                        .with(jwt().jwt(token -> token.claim("roles", List.of("PERSONAL_USER")))
                                .authorities(new SimpleGrantedAuthority("ROLE_PERSONAL_USER")))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"APPROVED\"}"))
                .andExpect(status().isForbidden());
    }
}
