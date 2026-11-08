package com.decoration.project;

import com.decoration.shared.api.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/projects/{projectId}/assets")
public class AssetDataController {
    private final AssetDataService service;

    public AssetDataController(AssetDataService service) {
        this.service = service;
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR', 'PERSONAL_USER')")
    public ResponseEntity<ApiResponse<Asset>> create(@AuthenticationPrincipal Jwt jwt,
                                                       @PathVariable UUID projectId,
                                                       @Valid @RequestBody AssetRequest request) {
        var asset = service.create(ownerId(jwt), projectId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(asset));
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR', 'COMPANY_VIEWER', 'PERSONAL_USER')")
    public ApiResponse<List<Asset>> list(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId) {
        return ApiResponse.success(service.list(ownerId(jwt), projectId));
    }

    private static UUID ownerId(Jwt jwt) {
        var value = jwt.getClaimAsString("companyId");
        if (value == null || value.isBlank()) value = jwt.getSubject();
        return UUID.fromString(value);
    }

    public record AssetRequest(
            @NotBlank @Size(max = 255) String originalName,
            @NotBlank @Size(max = 120) String mediaType,
            @Positive long byteSize,
            @NotBlank @Size(max = 2000) String objectKey,
            @Size(min = 64, max = 64) String checksumSha256) { }

    public record Asset(UUID id, UUID projectId, String originalName, String mediaType, long byteSize,
                        String objectKey, String checksumSha256, java.time.Instant createdAt) { }
}
