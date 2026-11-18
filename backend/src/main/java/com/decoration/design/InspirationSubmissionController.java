package com.decoration.design;

import com.decoration.shared.api.ApiResponse;
import jakarta.validation.constraints.Size;
import jakarta.validation.Valid;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/inspiration/submissions")
public class InspirationSubmissionController {
    private final InspirationSubmissionService service;
    public InspirationSubmissionController(InspirationSubmissionService service) { this.service = service; }

    @GetMapping("/mine")
    @PreAuthorize("hasRole('PERSONAL_USER')")
    public ApiResponse<List<InspirationSubmissionService.Submission>> mine(@AuthenticationPrincipal Jwt jwt) { return ApiResponse.success(service.listMine(UUID.fromString(jwt.getSubject()))); }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('PERSONAL_USER')")
    public ResponseEntity<ApiResponse<InspirationSubmissionService.Submission>> create(@AuthenticationPrincipal Jwt jwt,
            @RequestParam @Size(max = 160) String title, @RequestParam @Size(max = 80) String style,
            @RequestParam(required = false) @Size(max = 2000) String description, @RequestParam(required = false) String area,
            @RequestPart("images") List<MultipartFile> images) {
        return ResponseEntity.status(201).body(ApiResponse.success(service.create(UUID.fromString(jwt.getSubject()), title, style, description, area, images)));
    }

    @PutMapping("/{submissionId}")
    @PreAuthorize("hasRole('PERSONAL_USER')")
    public ApiResponse<InspirationSubmissionService.Submission> update(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID submissionId, @Valid @RequestBody UpdateRequest request) {
        return ApiResponse.success(service.update(UUID.fromString(jwt.getSubject()), submissionId,
                request.title(), request.style(), request.description(), request.area()));
    }

    @DeleteMapping("/{submissionId}")
    @PreAuthorize("hasRole('PERSONAL_USER')")
    public ApiResponse<Void> delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID submissionId) {
        service.delete(UUID.fromString(jwt.getSubject()), submissionId);
        return ApiResponse.success(null);
    }

    @GetMapping("/public")
    public ApiResponse<List<InspirationSubmissionService.Submission>> publicList() { return ApiResponse.success(service.listPublic()); }

    @GetMapping("/{submissionId}/images/{imageId}")
    public ResponseEntity<Resource> image(@PathVariable UUID submissionId, @PathVariable UUID imageId) {
        var image = service.image(submissionId, imageId, true);
        return response(image);
    }

    private static ResponseEntity<Resource> response(InspirationSubmissionService.ImageFile image) {
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(image.mediaType())).header(HttpHeaders.CACHE_CONTROL, "no-store").header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline().filename(image.fileName(), StandardCharsets.UTF_8).build().toString()).body(image.resource());
    }

    public record UpdateRequest(@jakarta.validation.constraints.NotBlank @Size(max = 160) String title,
                                @jakarta.validation.constraints.NotBlank @Size(max = 80) String style,
                                @Size(max = 2000) String description,
                                @jakarta.validation.constraints.DecimalMin("0") java.math.BigDecimal area) { }
}
