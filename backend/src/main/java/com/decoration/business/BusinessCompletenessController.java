package com.decoration.business;

import com.decoration.shared.api.ApiResponse;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/business/completeness")
public class BusinessCompletenessController {
    private final BusinessCompletenessService service;

    public BusinessCompletenessController(BusinessCompletenessService service) { this.service = service; }

    @GetMapping
    public ApiResponse<BusinessCompletenessService.Completeness> get(@AuthenticationPrincipal Jwt jwt) {
        var companyId = jwt.getClaimAsString("companyId");
        if (companyId == null || companyId.isBlank()) companyId = jwt.getSubject();
        return ApiResponse.success(service.get(UUID.fromString(companyId)));
    }
}
