package com.decoration.business;

import com.decoration.shared.api.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.PathVariable;

import java.util.UUID;

import static com.decoration.business.CertificationDtos.*;

@RestController
@Validated
@RequestMapping("/api/v1/business/certification")
public class CertificationController {
    private final CertificationService service;

    public CertificationController(CertificationService service) { this.service = service; }

    @GetMapping
    public ApiResponse<Certification> get(@AuthenticationPrincipal Jwt jwt) {
        return ApiResponse.success(service.get(companyId(jwt)));
    }

    @PutMapping
    @PreAuthorize("hasRole('COMPANY_ADMIN')")
    public ApiResponse<Certification> submit(@AuthenticationPrincipal Jwt jwt,
                                               @Valid @RequestBody CertificationRequest request) {
        return ApiResponse.success(service.submit(companyId(jwt), request));
    }

    @PostMapping("/{companyId}/review")
    @PreAuthorize("hasRole('PLATFORM_ADMIN')")
    public ApiResponse<Certification> review(@AuthenticationPrincipal Jwt jwt,
                                              @PathVariable UUID companyId,
                                              @Valid @RequestBody CertificationDecision request) {
        return ApiResponse.success(service.decide(companyId, UUID.fromString(jwt.getSubject()), request));
    }

    private static UUID companyId(Jwt jwt) {
        var value = jwt.getClaimAsString("companyId");
        if (value == null || value.isBlank()) value = jwt.getSubject();
        return UUID.fromString(value);
    }
}
