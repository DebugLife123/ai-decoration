package com.decoration.saas;

import com.decoration.shared.api.ApiResponse;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

import static com.decoration.saas.ResellerDtos.ResellerCompany;

@RestController
@RequestMapping("/api/v1/business/reseller")
@PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR', 'COMPANY_VIEWER')")
public class CompanyResellerController {
    private final ResellerService service;

    public CompanyResellerController(ResellerService service) { this.service = service; }

    @GetMapping
    public ApiResponse<ResellerCompany> get(@AuthenticationPrincipal Jwt jwt) {
        return ApiResponse.success(service.forCompany(companyId(jwt)));
    }

    private static UUID companyId(Jwt jwt) {
        var value = jwt.getClaimAsString("companyId");
        if (value == null || value.isBlank()) value = jwt.getSubject();
        return UUID.fromString(value);
    }
}
