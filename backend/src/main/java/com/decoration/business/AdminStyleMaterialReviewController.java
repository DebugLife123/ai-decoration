package com.decoration.business;

import com.decoration.shared.api.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@RestController
@Validated
@PreAuthorize("hasRole('PLATFORM_ADMIN')")
@RequestMapping("/api/v1/admin/style-material-review")
public class AdminStyleMaterialReviewController {
    private final AdminStyleMaterialReviewService service;

    public AdminStyleMaterialReviewController(AdminStyleMaterialReviewService service) { this.service = service; }

    @GetMapping
    public ApiResponse<List<AdminStyleMaterialReviewService.Candidate>> list(@RequestParam(defaultValue = "ALL") String status,
                                                                               @RequestParam(required = false) String styleKey,
                                                                               @RequestParam(required = false) @Size(max = 120) String query) {
        if (!List.of("ALL", "NEEDS_REVIEW", "APPROVED", "REJECTED").contains(status)) throw new com.decoration.shared.api.BusinessApiException(org.springframework.http.HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Unknown review status");
        return ApiResponse.success(service.list(status, styleKey, query));
    }

    @PostMapping("/import")
    public ApiResponse<Integer> importCandidates(@AuthenticationPrincipal Jwt jwt,
                                                   @Valid @RequestBody ImportRequest request) {
        return ApiResponse.success(service.importCandidates(request.items().stream().map(ImportCandidate::toService).toList(), UUID.fromString(jwt.getSubject())));
    }

    @PutMapping("/{id}")
    public ApiResponse<AdminStyleMaterialReviewService.Candidate> review(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                                                                           @Valid @RequestBody ReviewRequest request) {
        return ApiResponse.success(service.review(id, UUID.fromString(jwt.getSubject()), request.toServiceRequest()));
    }

    @GetMapping(value = "/{id}/source-image", produces = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"})
    public ResponseEntity<Resource> sourceImage(@PathVariable UUID id, @RequestParam(defaultValue = "0") int index) {
        var image = service.sourceImage(id, index);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(image.mediaType()))
                .header(HttpHeaders.CACHE_CONTROL, "private, no-store")
                .header("X-Content-Type-Options", "nosniff").body(image.resource());
    }

    public record ImportRequest(@NotEmpty @Size(max = 500) List<@Valid ImportCandidate> items) { }
    public record ImportCandidate(@Size(max = 180) String candidateKey, @Size(max = 40) String styleKey, @Size(max = 80) String styleName,
                                  @Size(max = 160) String name, @Size(max = 80) String category, BigDecimal confidence,
                                  @Size(max = 20) List<@Size(max = 1000) String> sourceImages, @Size(max = 20) List<@Size(max = 80) String> sourceRooms,
                                  @Size(max = 120) String brand, @Size(max = 240) String specification, @Size(max = 40) String unit,
                                  BigDecimal price, @Size(max = 1000) String reviewNote) {
        AdminStyleMaterialReviewService.ImportCandidate toService() { return new AdminStyleMaterialReviewService.ImportCandidate(candidateKey, styleKey, styleName, name, category, confidence, sourceImages, sourceRooms, brand, specification, unit, price, reviewNote); }
    }
    public record ReviewRequest(@Size(max = 20) String status, @Size(max = 120) String brand, @Size(max = 240) String specification,
                                @Size(max = 40) String unit, BigDecimal price, @Size(max = 1000) String reviewNote) {
        AdminStyleMaterialReviewService.ReviewRequest toServiceRequest() { return new AdminStyleMaterialReviewService.ReviewRequest(status, brand, specification, unit, price, reviewNote); }
    }
}
