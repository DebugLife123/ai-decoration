package com.decoration.business;

import com.decoration.shared.api.ApiResponse;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.http.MediaType;

import java.util.UUID;
import java.nio.charset.StandardCharsets;

@RestController
@Validated
@RequestMapping("/api/v1/admin/marketplace")
@PreAuthorize("hasRole('PLATFORM_ADMIN')")
public class AdminMarketplaceController {
    private final AdminMarketplaceService service;
    private final AdminCompanyDetailService companyDetails;
    private final BusinessAssetService assets;
    private final AdminCompanyImportService companyImport;

    public AdminMarketplaceController(AdminMarketplaceService service, AdminCompanyDetailService companyDetails,
                                      BusinessAssetService assets, AdminCompanyImportService companyImport) {
        this.service = service;
        this.companyDetails = companyDetails;
        this.assets = assets;
        this.companyImport = companyImport;
    }

    @org.springframework.web.bind.annotation.PostMapping("/companies/import")
    public ApiResponse<AdminCompanyImportService.ImportResult> importCompany(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody AdminCompanyImportService.ImportRequest request) {
        return ApiResponse.success(companyImport.create(UUID.fromString(jwt.getSubject()), request));
    }

    @org.springframework.web.bind.annotation.PostMapping(value = "/companies/{companyId}/assets", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public org.springframework.http.ResponseEntity<ApiResponse<BusinessAssetService.BusinessAsset>> uploadCompanyAsset(
            @PathVariable UUID companyId, @RequestPart("file") MultipartFile file) {
        // 与企业端上传保持一致：创建资源返回 201。
        return org.springframework.http.ResponseEntity.status(org.springframework.http.HttpStatus.CREATED)
                .body(ApiResponse.success(assets.upload(companyId, file)));
    }

    @org.springframework.web.bind.annotation.PostMapping("/companies/{companyId}/cases/{caseId}/files")
    public ApiResponse<Void> attachCaseFiles(@PathVariable UUID companyId, @PathVariable UUID caseId,
                                              @Valid @RequestBody CaseFilesRequest request) {
        companyImport.attachCaseFiles(companyId, caseId, request.fileIds());
        return ApiResponse.success(null);
    }

    @org.springframework.web.bind.annotation.PostMapping("/companies/{companyId}/material-quotes/{quoteId}/images")
    public ApiResponse<Void> attachMaterialImages(@PathVariable UUID companyId, @PathVariable UUID quoteId,
                                                   @Valid @RequestBody ImageFilesRequest request) {
        companyImport.attachMaterialImages(companyId, quoteId, request.imageIds());
        return ApiResponse.success(null);
    }

    public record CaseFilesRequest(@jakarta.validation.constraints.NotNull @jakarta.validation.constraints.Size(max = 30)
                                   java.util.List<@jakarta.validation.constraints.NotNull UUID> fileIds) { }
    public record ImageFilesRequest(@jakarta.validation.constraints.NotNull @jakarta.validation.constraints.Size(max = 8)
                                    java.util.List<@jakarta.validation.constraints.NotNull UUID> imageIds) { }

    @GetMapping("/companies/{companyId}")
    public ApiResponse<AdminCompanyDetailService.CompanyDetail> company(@PathVariable UUID companyId) {
        return ApiResponse.success(companyDetails.get(companyId));
    }

    @GetMapping("/companies/{companyId}/assets/{assetId}")
    public ResponseEntity<Resource> asset(@PathVariable UUID companyId, @PathVariable UUID assetId) {
        var asset = assets.get(companyId, assetId);
        return ResponseEntity.ok().contentType(org.springframework.http.MediaType.parseMediaType(asset.mediaType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline()
                        .filename(asset.fileName(), StandardCharsets.UTF_8).build().toString())
                .header("X-Content-Type-Options", "nosniff").body(asset.resource());
    }

    @GetMapping("/material-quotes")
    public ApiResponse<AdminMarketplaceService.Page> quotes(
            @RequestParam(required = false) @Size(max = 120) String query,
            @RequestParam(defaultValue = "ALL") String visibility,
            @RequestParam(defaultValue = "1") @Min(1) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        if (!java.util.Set.of("ALL", "PUBLISHED", "HIDDEN", "EXPIRED").contains(visibility))
            throw new com.decoration.shared.api.BusinessApiException(org.springframework.http.HttpStatus.BAD_REQUEST,
                    "INVALID_REQUEST", "Unknown material visibility filter");
        return ApiResponse.success(service.listQuotes(query, visibility, page, size));
    }

    @PatchMapping("/material-quotes/{quoteId}/visibility")
    public ApiResponse<AdminMarketplaceService.Quote> visibility(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID quoteId, @Valid @RequestBody AdminMarketplaceService.VisibilityRequest request) {
        if (request.reason() != null && request.reason().length() > 500)
            throw new com.decoration.shared.api.BusinessApiException(org.springframework.http.HttpStatus.BAD_REQUEST,
                    "INVALID_REQUEST", "Reason must be 500 characters or fewer");
        return ApiResponse.success(service.setVisibility(quoteId, UUID.fromString(jwt.getSubject()), request));
    }
}
