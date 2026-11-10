package com.decoration.project;

import com.decoration.shared.api.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ContentDisposition;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;
import java.nio.charset.StandardCharsets;

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

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR', 'PERSONAL_USER')")
    public ResponseEntity<ApiResponse<Asset>> upload(@AuthenticationPrincipal Jwt jwt,
                                                       @PathVariable UUID projectId,
                                                       @RequestPart("file") MultipartFile file) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(service.upload(ownerId(jwt), projectId, file)));
    }

    @GetMapping("/{assetId}/content")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR', 'COMPANY_VIEWER', 'PERSONAL_USER')")
    public ResponseEntity<Resource> content(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId,
                                             @PathVariable UUID assetId) {
        var asset = service.content(ownerId(jwt), projectId, assetId);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(asset.mediaType()))
                .header(HttpHeaders.CACHE_CONTROL, "private, max-age=3600")
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline()
                        .filename(asset.originalName(), StandardCharsets.UTF_8).build().toString())
                .body(new org.springframework.core.io.PathResource(asset.path()));
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
    public record StoredAsset(String originalName, String mediaType, Resource resource) { }
}
