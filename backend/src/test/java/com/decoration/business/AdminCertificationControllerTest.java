package com.decoration.business;

import com.decoration.shared.api.ApiExceptionHandler;
import com.decoration.shared.security.SecurityConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ByteArrayResource;
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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AdminCertificationController.class)
@Import({ApiExceptionHandler.class, SecurityConfiguration.class})
class AdminCertificationControllerTest {
    private static final UUID COMPANY_ID = UUID.fromString("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    private static final UUID ASSET_ID = UUID.fromString("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private CertificationService certificationService;

    @MockBean
    private BusinessAssetService assetService;

    @Test
    void servesReferencedCertificationDocumentsInlineToAdmins() throws Exception {
        var content = new byte[]{1, 2, 3};
        given(assetService.getCertificationDocument(COMPANY_ID, ASSET_ID))
                .willReturn(new BusinessAssetService.StoredBusinessAsset("license.pdf", "key",
                        new ByteArrayResource(content)));

        mockMvc.perform(get("/api/v1/admin/certifications/{companyId}/documents/{assetId}", COMPANY_ID, ASSET_ID)
                        .with(jwt().jwt(token -> token.claim("roles", List.of("PLATFORM_ADMIN")))
                                .authorities(new SimpleGrantedAuthority("ROLE_PLATFORM_ADMIN"))))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_PDF))
                .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.containsString("inline")))
                .andExpect(content().bytes(content));

        verify(assetService).getCertificationDocument(COMPANY_ID, ASSET_ID);
    }

    @Test
    void deniesCertificationDocumentAccessToNonAdmins() throws Exception {
        mockMvc.perform(get("/api/v1/admin/certifications/{companyId}/documents/{assetId}", COMPANY_ID, ASSET_ID)
                        .with(jwt().jwt(token -> token.claim("roles", List.of("PERSONAL_USER")))
                                .authorities(new SimpleGrantedAuthority("ROLE_PERSONAL_USER"))))
                .andExpect(status().isForbidden());

        verify(assetService, never()).getCertificationDocument(COMPANY_ID, ASSET_ID);
    }
}
