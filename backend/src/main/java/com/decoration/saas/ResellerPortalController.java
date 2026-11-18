package com.decoration.saas;

import com.decoration.shared.api.ApiResponse;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

import static com.decoration.saas.ResellerDtos.ResellerDashboard;

@RestController
@RequestMapping("/api/v1/reseller")
@PreAuthorize("hasRole('RESELLER_ADMIN')")
public class ResellerPortalController {
    private final ResellerService service;

    public ResellerPortalController(ResellerService service) { this.service = service; }

    @GetMapping("/dashboard")
    public ApiResponse<ResellerDashboard> dashboard(@AuthenticationPrincipal Jwt jwt) {
        return ApiResponse.success(service.dashboard(UUID.fromString(jwt.getSubject())));
    }
}
