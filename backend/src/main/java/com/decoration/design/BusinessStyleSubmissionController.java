package com.decoration.design;

import com.decoration.shared.api.ApiResponse;
import jakarta.validation.constraints.Size;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import com.decoration.shared.api.BusinessApiException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/business/style-submissions")
@PreAuthorize("hasRole('COMPANY_ADMIN')")
public class BusinessStyleSubmissionController {
    private final InspirationSubmissionService service;

    public BusinessStyleSubmissionController(InspirationSubmissionService service) {
        this.service = service;
    }

    @GetMapping
    public ApiResponse<List<InspirationSubmissionService.Submission>> list(@AuthenticationPrincipal Jwt jwt) {
        return ApiResponse.success(service.listBusiness(companyId(jwt)));
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<InspirationSubmissionService.Submission>> create(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam @Size(max = 160) String title,
            @RequestParam @Size(max = 80) String style,
            @RequestParam(required = false) @Size(max = 2000) String description,
            @RequestParam(required = false, name = "materialIds") List<UUID> materialIds,
            @RequestPart("images") List<MultipartFile> images) {
        var created = service.createBusiness(UUID.fromString(jwt.getSubject()), companyId(jwt), title,
                style, description, materialIds == null ? List.of() : materialIds, images);
        return ResponseEntity.status(201).body(ApiResponse.success(created));
    }

    @PutMapping("/{submissionId}")
    public ApiResponse<InspirationSubmissionService.Submission> update(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID submissionId, @Valid @RequestBody UpdateRequest request) {
        return ApiResponse.success(service.updateBusiness(companyId(jwt), submissionId, request.title(),
                request.style(), request.description(), request.materialIds()));
    }

    @DeleteMapping("/{submissionId}")
    public ApiResponse<Void> delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID submissionId) {
        service.deleteBusiness(companyId(jwt), submissionId);
        return ApiResponse.success(null);
    }

    @GetMapping("/{submissionId}/images/{imageId}")
    public ResponseEntity<org.springframework.core.io.Resource> image(@AuthenticationPrincipal Jwt jwt,
                                                                       @PathVariable UUID submissionId,
                                                                       @PathVariable UUID imageId) {
        var image = service.businessImage(companyId(jwt), submissionId, imageId);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(image.mediaType()))
                .header("Cache-Control", "no-store").body(image.resource());
    }

    private static UUID companyId(Jwt jwt) {
        var value = jwt.getClaimAsString("companyId");
        try {
            if (value != null) return UUID.fromString(value);
        } catch (IllegalArgumentException ignored) { }
        throw new BusinessApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "企业身份无效");
    }

    public record UpdateRequest(@NotBlank @Size(max = 160) String title,
                                @NotBlank @Size(max = 80) String style,
                                @Size(max = 2000) String description,
                                @NotNull @Size(max = 20) List<@NotNull UUID> materialIds) { }
}
