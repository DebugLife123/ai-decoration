package com.decoration.business;

import com.decoration.shared.api.ApiResponse;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/companies")
public class PublicCompanyController {
    private final PublicCompanyService companies;
    private final BusinessAssetService assets;

    public PublicCompanyController(PublicCompanyService companies, BusinessAssetService assets) {
        this.companies = companies;
        this.assets = assets;
    }

    @GetMapping("/{companyId}")
    public ApiResponse<PublicCompanyDtos.PublicCompany> get(@PathVariable UUID companyId) {
        return ApiResponse.success(companies.get(companyId));
    }

    @GetMapping("/{companyId}/assets/{assetId}")
    public ResponseEntity<Resource> asset(@PathVariable UUID companyId, @PathVariable UUID assetId) {
        var asset = assets.getPublicCompanyImage(companyId, assetId);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(asset.mediaType()))
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline()
                        .filename(asset.fileName(), StandardCharsets.UTF_8).build().toString())
                .body(asset.resource());
    }
}
