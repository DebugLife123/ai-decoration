package com.decoration.business;

import com.decoration.shared.api.ApiResponse;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/business/assets")
public class BusinessAssetController {
    private final BusinessAssetService service;

    public BusinessAssetController(BusinessAssetService service) { this.service = service; }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR')")
    public ApiResponse<BusinessAssetService.BusinessAsset> upload(@AuthenticationPrincipal Jwt jwt,
                                                                  @RequestPart("file") MultipartFile file) {
        return ApiResponse.success(service.upload(companyId(jwt), file));
    }

    @GetMapping("/{assetId}")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR', 'COMPANY_VIEWER')")
    public ResponseEntity<Resource> download(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID assetId) {
        var asset = service.get(companyId(jwt), assetId);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(asset.mediaType()))
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(asset.fileName(), StandardCharsets.UTF_8).build().toString())
                .body(asset.resource());
    }

    @DeleteMapping("/{assetId}")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR')")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID assetId) {
        service.delete(companyId(jwt), assetId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/public/materials/{quoteId}/images/{imageId}")
    public ResponseEntity<Resource> materialImage(@PathVariable UUID quoteId, @PathVariable UUID imageId) {
        var asset = service.getPublicMaterialImage(quoteId, imageId);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(asset.mediaType()))
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline()
                        .filename(asset.fileName(), StandardCharsets.UTF_8).build().toString())
                .body(asset.resource());
    }

    private static UUID companyId(Jwt jwt) {
        var value = jwt.getClaimAsString("companyId");
        if (value == null || value.isBlank()) value = jwt.getSubject();
        return UUID.fromString(value);
    }
}
