package com.decoration.business;

import com.decoration.shared.api.ApiResponse;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
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
import java.nio.charset.StandardCharsets;

import static com.decoration.business.CertificationDtos.*;

@RestController
@RequestMapping("/api/v1/admin/certifications")
@PreAuthorize("hasRole('PLATFORM_ADMIN')")
public class AdminCertificationController {
    private final CertificationService service;
    private final BusinessAssetService assetService;

    public AdminCertificationController(CertificationService service, BusinessAssetService assetService) {
        this.service = service;
        this.assetService = assetService;
    }

    @GetMapping
    public ApiResponse<List<AdminCertification>> list(@RequestParam(required = false) CertificationStatus status,
                                                       @RequestParam(required = false) String query,
                                                       @RequestParam(defaultValue = "ALL") String kind) {
        if (!java.util.Set.of("ALL", "REAL", "DEMO").contains(kind))
            throw new com.decoration.shared.api.BusinessApiException(org.springframework.http.HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Unknown company kind filter");
        return ApiResponse.success("ALL".equals(kind) ? service.listForAdmin(status, query) : service.listForAdmin(status, query, kind));
    }

    @PostMapping("/{companyId}/review")
    public ApiResponse<Certification> review(@AuthenticationPrincipal Jwt jwt,
                                              @PathVariable UUID companyId,
                                              @Valid @RequestBody CertificationDecision request) {
        return ApiResponse.success(service.decide(companyId, UUID.fromString(jwt.getSubject()), request));
    }

    @GetMapping("/{companyId}/documents/{assetId}")
    public ResponseEntity<Resource> document(@PathVariable UUID companyId, @PathVariable UUID assetId) {
        var asset = assetService.getCertificationDocument(companyId, assetId);
        return ResponseEntity.ok()
                .contentType(BusinessAssetService.mediaType(asset.fileName()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline()
                        .filename(asset.fileName(), StandardCharsets.UTF_8).build().toString())
                .body(asset.resource());
    }
}
