package com.decoration.business;

import com.decoration.shared.api.ApiExceptionHandler;
import com.decoration.shared.security.SecurityConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;

import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AdminAssetController.class)
@Import({ApiExceptionHandler.class, SecurityConfiguration.class})
class AdminAssetControllerTest {
    @Autowired private MockMvc mockMvc;
    @MockBean private BusinessAssetCleanupService cleanupService;
    @MockBean private AdminAuditLogService auditLogService;

    @Test
    void returnsCleanupPreviewToPlatformAdmins() throws Exception {
        var cutoff = Instant.parse("2026-10-30T00:00:00Z");
        given(cleanupService.preview()).willReturn(new BusinessAssetCleanupService.CleanupPreview(
                4, 8192, cutoff, Instant.parse("2026-11-06T00:00:00Z"), List.of(), 0));

        mockMvc.perform(get("/api/v1/admin/assets/cleanup-preview")
                        .with(jwt().jwt(token -> token.claim("roles", List.of("PLATFORM_ADMIN")))
                                .authorities(new SimpleGrantedAuthority("ROLE_PLATFORM_ADMIN"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.eligibleImageCount").value(4))
                .andExpect(jsonPath("$.data.estimatedBytes").value(8192))
                .andExpect(jsonPath("$.data.cutoffAt").exists());
        verify(cleanupService).preview();
    }

    @Test
    void deniesCleanupPreviewAccessToNonAdmins() throws Exception {
        mockMvc.perform(get("/api/v1/admin/assets/cleanup-preview")
                        .with(jwt().jwt(token -> token.claim("roles", List.of("PERSONAL_USER")))
                                .authorities(new SimpleGrantedAuthority("ROLE_PERSONAL_USER"))))
                .andExpect(status().isForbidden());
        verify(cleanupService, never()).preview();
    }

    @Test
    void manuallyCleansSelectedImagesForPlatformAdmins() throws Exception {
        var assetId = java.util.UUID.randomUUID();
        given(cleanupService.cleanSelected(List.of(assetId))).willReturn(1);

        mockMvc.perform(post("/api/v1/admin/assets/cleanup")
                        .with(jwt().jwt(token -> token.subject("00000000-0000-4000-8000-000000000001").claim("roles", List.of("PLATFORM_ADMIN")))
                                .authorities(new SimpleGrantedAuthority("ROLE_PLATFORM_ADMIN")))
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"assetIds\":[\"" + assetId + "\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.removedImageCount").value(1));
        verify(cleanupService).cleanSelected(List.of(assetId));
        verify(auditLogService).record(java.util.UUID.fromString("00000000-0000-4000-8000-000000000001"),
                "IMAGE_CLEANUP", "BUSINESS_ASSET", null, "手动清理未关联图片，共删除 1 张");
    }

    @Test
    void servesCleanupCandidateImageOnlyToPlatformAdmins() throws Exception {
        var assetId = java.util.UUID.randomUUID();
        var bytes = new byte[]{1, 2, 3};
        given(cleanupService.getPreviewImage(assetId)).willReturn(new BusinessAssetCleanupService.CleanupImage(
                "orphan.png", "image/png", new org.springframework.core.io.ByteArrayResource(bytes)));

        mockMvc.perform(get("/api/v1/admin/assets/cleanup-preview/{assetId}/image", assetId)
                        .with(jwt().jwt(token -> token.claim("roles", List.of("PLATFORM_ADMIN")))
                                .authorities(new SimpleGrantedAuthority("ROLE_PLATFORM_ADMIN"))))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content().contentType("image/png"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content().bytes(bytes))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header()
                        .string("X-Content-Type-Options", "nosniff"));
        verify(cleanupService).getPreviewImage(assetId);
    }

    @Test
    void deniesCleanupImageAccessToNonAdmins() throws Exception {
        var assetId = java.util.UUID.randomUUID();
        mockMvc.perform(get("/api/v1/admin/assets/cleanup-preview/{assetId}/image", assetId)
                        .with(jwt().jwt(token -> token.claim("roles", List.of("PERSONAL_USER")))
                                .authorities(new SimpleGrantedAuthority("ROLE_PERSONAL_USER"))))
                .andExpect(status().isForbidden());
        verify(cleanupService, never()).getPreviewImage(assetId);
    }
}
