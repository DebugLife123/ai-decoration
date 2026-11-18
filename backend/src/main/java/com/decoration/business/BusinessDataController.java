package com.decoration.business;

import com.decoration.shared.api.ApiResponse;
import com.decoration.shared.api.BusinessApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.UUID;

import static com.decoration.business.BusinessDtos.*;
import static com.decoration.business.StyleDtos.CompanyStyleProfile;
import static com.decoration.business.StyleDtos.StyleProfileUpdateRequest;

@RestController
@Validated
@RequestMapping("/api/v1/business")
public class BusinessDataController {
    private final BusinessDataService service;
    private final StyleProfileService styleProfiles;

    public BusinessDataController(BusinessDataService service, StyleProfileService styleProfiles) {
        this.service = service;
        this.styleProfiles = styleProfiles;
    }

    @GetMapping("/profile")
    public ApiResponse<Profile> getProfile(@AuthenticationPrincipal Jwt jwt) {
        return ApiResponse.success(service.getProfile(companyId(jwt)));
    }

    @PutMapping("/profile")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR')")
    public ApiResponse<Profile> putProfile(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ProfileRequest request) {
        return ApiResponse.success(service.saveProfile(companyId(jwt), request));
    }

    @GetMapping("/cases")
    public ApiResponse<Page<BusinessCase>> listCases(@AuthenticationPrincipal Jwt jwt,
                                                       @RequestParam(required = false) CaseStatus status,
                                                       @RequestParam(defaultValue = "1") @Min(1) int page,
                                                       @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size,
                                                       @RequestParam(defaultValue = "updatedAt") @Size(max = 40) String sort) {
        return ApiResponse.success(service.listCases(companyId(jwt), status, page, size, sort));
    }

    @PostMapping("/cases")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR')")
    public ResponseEntity<ApiResponse<BusinessCase>> createCase(@AuthenticationPrincipal Jwt jwt,
            @RequestHeader("Idempotency-Key") @NotBlank @Size(min = 8, max = 128) String key,
            @Valid @RequestBody CaseRequest request) {
        // 案例创建只允许草稿：status 由 @Null 校验，发布统一走 POST /cases/{caseId}/publish。
        var result = service.createCase(companyId(jwt), key, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .location(URI.create("/api/v1/business/cases/" + result.value().id()))
                .body(ApiResponse.success(result.value()));
    }

    @GetMapping("/cases/{caseId}")
    public ApiResponse<BusinessCase> getCase(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId) {
        return ApiResponse.success(service.getCase(companyId(jwt), caseId));
    }

    @PatchMapping("/cases/{caseId}")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR')")
    public ApiResponse<BusinessCase> patchCase(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId,
                                               @Valid @RequestBody CasePatch patch) {
        if (patch.status() == CaseStatus.published && !isAdmin(jwt)) throw forbidden();
        return ApiResponse.success(service.patchCase(companyId(jwt), caseId, patch));
    }

    @PostMapping("/cases/{caseId}/publish")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR')")
    public ApiResponse<BusinessCase> publishCase(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId,
            @Valid @RequestBody PublishCaseRequest request) {
        return ApiResponse.success(service.publishCase(companyId(jwt), caseId, request.version()));
    }

    @DeleteMapping("/cases/{caseId}")
    @PreAuthorize("hasRole('COMPANY_ADMIN')")
    public ResponseEntity<Void> deleteCase(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId,
                                            @RequestParam @Min(0) int version) {
        service.deleteCase(companyId(jwt), caseId, version);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/material-quotes")
    public ApiResponse<Page<MaterialQuote>> listMaterialQuotes(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) @Size(max = 80) String region,
            @RequestParam(required = false) @Size(max = 80) String category,
            @RequestParam(defaultValue = "false") boolean includeExpired,
            @RequestParam(defaultValue = "1") @Min(1) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size,
            @RequestParam(defaultValue = "updatedAt") @Size(max = 40) String sort) {
        return ApiResponse.success(service.listMaterialQuotes(companyId(jwt), region, category, includeExpired, page, size, sort));
    }

    @PostMapping("/material-quotes")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR')")
    public ResponseEntity<ApiResponse<MaterialQuote>> createMaterialQuote(@AuthenticationPrincipal Jwt jwt,
            @RequestHeader("Idempotency-Key") @NotBlank @Size(min = 8, max = 128) String key,
            @Valid @RequestBody MaterialQuoteRequest request) {
        var result = service.createMaterialQuote(companyId(jwt), key, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .location(URI.create("/api/v1/business/material-quotes/" + result.value().id()))
                .body(ApiResponse.success(result.value()));
    }

    @GetMapping("/material-quotes/{quoteId}")
    public ApiResponse<MaterialQuote> getMaterialQuote(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID quoteId) {
        return ApiResponse.success(service.getMaterialQuote(companyId(jwt), quoteId));
    }

    @PatchMapping("/material-quotes/{quoteId}")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR')")
    public ApiResponse<MaterialQuote> patchMaterialQuote(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID quoteId,
                                                          @Valid @RequestBody MaterialQuotePatch patch) {
        return ApiResponse.success(service.patchMaterialQuote(companyId(jwt), quoteId, patch));
    }

    @PostMapping("/material-quotes/{quoteId}/withdraw")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR')")
    public ApiResponse<MaterialQuote> withdrawMaterialQuote(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID quoteId) {
        return ApiResponse.success(service.setMaterialReviewStatus(companyId(jwt), quoteId, "WITHDRAWN"));
    }

    @PostMapping("/material-quotes/{quoteId}/submit")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR')")
    public ApiResponse<MaterialQuote> submitMaterialQuote(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID quoteId) {
        return ApiResponse.success(service.setMaterialReviewStatus(companyId(jwt), quoteId, "SUBMIT"));
    }

    @DeleteMapping("/material-quotes/{quoteId}")
    @PreAuthorize("hasRole('COMPANY_ADMIN')")
    public ResponseEntity<Void> deleteMaterialQuote(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID quoteId,
                                                      @RequestParam @Min(0) int version) {
        service.deleteMaterialQuote(companyId(jwt), quoteId, version);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/labor-quotes")
    public ApiResponse<Page<LaborQuote>> listLaborQuotes(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) @Size(max = 80) String region,
            @RequestParam(defaultValue = "false") boolean includeExpired,
            @RequestParam(defaultValue = "1") @Min(1) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size,
            @RequestParam(defaultValue = "updatedAt") @Size(max = 40) String sort) {
        return ApiResponse.success(service.listLaborQuotes(companyId(jwt), region, includeExpired, page, size, sort));
    }

    @PostMapping("/labor-quotes")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR')")
    public ResponseEntity<ApiResponse<LaborQuote>> createLaborQuote(@AuthenticationPrincipal Jwt jwt,
            @RequestHeader("Idempotency-Key") @NotBlank @Size(min = 8, max = 128) String key,
            @Valid @RequestBody LaborQuoteRequest request) {
        var result = service.createLaborQuote(companyId(jwt), key, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .location(URI.create("/api/v1/business/labor-quotes/" + result.value().id()))
                .body(ApiResponse.success(result.value()));
    }

    @GetMapping("/labor-quotes/{quoteId}")
    public ApiResponse<LaborQuote> getLaborQuote(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID quoteId) {
        return ApiResponse.success(service.getLaborQuote(companyId(jwt), quoteId));
    }

    @PatchMapping("/labor-quotes/{quoteId}")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR')")
    public ApiResponse<LaborQuote> patchLaborQuote(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID quoteId,
                                                    @Valid @RequestBody LaborQuotePatch patch) {
        return ApiResponse.success(service.patchLaborQuote(companyId(jwt), quoteId, patch));
    }

    @DeleteMapping("/labor-quotes/{quoteId}")
    @PreAuthorize("hasRole('COMPANY_ADMIN')")
    public ResponseEntity<Void> deleteLaborQuote(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID quoteId,
                                                  @RequestParam @Min(0) int version) {
        service.deleteLaborQuote(companyId(jwt), quoteId, version);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/style-profiles")
    public ApiResponse<CompanyStyleProfile> getStyleProfiles(@AuthenticationPrincipal Jwt jwt) {
        return ApiResponse.success(styleProfiles.get(companyId(jwt)));
    }

    @PutMapping("/style-profiles")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR')")
    public ApiResponse<CompanyStyleProfile> putStyleProfiles(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody StyleProfileUpdateRequest request) {
        return ApiResponse.success(styleProfiles.replace(companyId(jwt), request.profiles()));
    }

    private static UUID companyId(Jwt jwt) {
        try {
            var claim = jwt.getClaimAsString("companyId");
            if (claim == null) throw forbidden();
            return UUID.fromString(claim);
        } catch (IllegalArgumentException exception) {
            throw forbidden();
        }
    }

    private static boolean isAdmin(Jwt jwt) {
        var roles = jwt.getClaimAsStringList("roles");
        return roles != null && roles.contains("COMPANY_ADMIN");
    }

    private static BusinessApiException forbidden() {
        return new BusinessApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Company identity or role is not permitted");
    }

    public record PublishCaseRequest(@jakarta.validation.constraints.NotNull @jakarta.validation.constraints.Min(0) Integer version) { }
}
