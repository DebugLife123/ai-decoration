package com.decoration.business;

import com.decoration.shared.api.ApiResponse;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/assets")
@PreAuthorize("hasRole('PLATFORM_ADMIN')")
public class AdminAssetController {
    private final BusinessAssetCleanupService cleanupService;
    private final AdminAuditLogService auditLogService;

    public AdminAssetController(BusinessAssetCleanupService cleanupService, AdminAuditLogService auditLogService) {
        this.cleanupService = cleanupService;
        this.auditLogService = auditLogService;
    }

    @GetMapping("/cleanup-preview")
    public ApiResponse<BusinessAssetCleanupService.CleanupPreview> cleanupPreview() {
        return ApiResponse.success(cleanupService.preview());
    }

    @PostMapping("/cleanup")
    @Transactional
    public ApiResponse<CleanupResult> cleanup(@AuthenticationPrincipal Jwt jwt, @RequestBody CleanupRequest request) {
        var removed = cleanupService.cleanSelected(request.assetIds());
        if (removed > 0) auditLogService.record(UUID.fromString(jwt.getSubject()), "IMAGE_CLEANUP", "BUSINESS_ASSET", null,
                "手动清理未关联图片，共删除 " + removed + " 张");
        return ApiResponse.success(new CleanupResult(removed));
    }

    @GetMapping("/cleanup-preview/{assetId}/image")
    public ResponseEntity<Resource> previewImage(@PathVariable UUID assetId) {
        var image = cleanupService.getPreviewImage(assetId);
        return ResponseEntity.ok()
                .contentType(org.springframework.http.MediaType.parseMediaType(image.mediaType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline()
                        .filename(image.fileName(), StandardCharsets.UTF_8).build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .body(image.resource());
    }

    public record CleanupRequest(java.util.List<java.util.UUID> assetIds) { }
    public record CleanupResult(int removedImageCount) { }
}
