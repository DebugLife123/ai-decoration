package com.decoration.business;

import com.decoration.shared.api.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

import static com.decoration.business.CertificationDtos.*;

@RestController
@RequestMapping("/api/v1/admin/certifications")
@PreAuthorize("hasRole('PLATFORM_ADMIN')")
public class AdminCertificationController {
    private final CertificationService service;

    public AdminCertificationController(CertificationService service) { this.service = service; }

    @GetMapping
    public ApiResponse<List<AdminCertification>> list(@RequestParam(required = false) CertificationStatus status) {
        return ApiResponse.success(service.listForAdmin(status));
    }

    @PostMapping("/{companyId}/review")
    public ApiResponse<Certification> review(@AuthenticationPrincipal Jwt jwt,
                                              @PathVariable UUID companyId,
                                              @Valid @RequestBody CertificationDecision request) {
        return ApiResponse.success(service.decide(companyId, UUID.fromString(jwt.getSubject()), request));
    }
}
