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
import java.util.UUID;

import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AdminAuditController.class)
@Import({ApiExceptionHandler.class, SecurityConfiguration.class})
class AdminAuditControllerTest {
    @Autowired private MockMvc mockMvc;
    @MockBean private AdminAuditLogService auditLogService;

    @Test
    void listsAuditEntriesForPlatformAdmins() throws Exception {
        var entry = new AdminAuditLogService.AuditEntry(UUID.randomUUID(), UUID.randomUUID(), "admin@example.test",
                "CERTIFICATION_REVIEW", "COMPANY", UUID.randomUUID(), "通过企业认证：Studio", Instant.now());
        given(auditLogService.list(1, 20, null)).willReturn(new AdminAuditLogService.Page(List.of(entry), 1, 20, 1, 1));

        mockMvc.perform(get("/api/v1/admin/audit-logs")
                        .with(jwt().jwt(token -> token.claim("roles", List.of("PLATFORM_ADMIN")))
                                .authorities(new SimpleGrantedAuthority("ROLE_PLATFORM_ADMIN"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].action").value("CERTIFICATION_REVIEW"))
                .andExpect(jsonPath("$.data.items[0].actorEmail").value("admin@example.test"))
                .andExpect(jsonPath("$.data.total").value(1));
        verify(auditLogService).list(1, 20, null);
    }

    @Test
    void deniesAuditAccessToNonAdmins() throws Exception {
        mockMvc.perform(get("/api/v1/admin/audit-logs")
                        .with(jwt().jwt(token -> token.claim("roles", List.of("PERSONAL_USER")))
                                .authorities(new SimpleGrantedAuthority("ROLE_PERSONAL_USER"))))
                .andExpect(status().isForbidden());
        verify(auditLogService, never()).list(org.mockito.ArgumentMatchers.anyInt(),
                org.mockito.ArgumentMatchers.anyInt(), org.mockito.ArgumentMatchers.any());
    }

    /** 第 18 章决策 1：page/size 越界必须是 400，而不是悄悄按默认值翻整张表。 */
    @Test
    void rejectsOutOfRangePaging() throws Exception {
        for (var query : List.of("page=0", "size=0", "size=101", "page=-3")) {
            mockMvc.perform(get("/api/v1/admin/audit-logs?" + query)
                            .with(jwt().jwt(token -> token.claim("roles", List.of("PLATFORM_ADMIN")))
                                    .authorities(new SimpleGrantedAuthority("ROLE_PLATFORM_ADMIN"))))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        }
        verify(auditLogService, never()).list(org.mockito.ArgumentMatchers.anyInt(),
                org.mockito.ArgumentMatchers.anyInt(), org.mockito.ArgumentMatchers.any());
    }
}
