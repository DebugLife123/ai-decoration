package com.decoration.design;

import com.decoration.shared.api.ApiResponse;
import jakarta.validation.constraints.Size;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@PreAuthorize("hasRole('PLATFORM_ADMIN')")
@RequestMapping("/api/v1/admin/inspiration-submissions")
public class AdminInspirationSubmissionController {
    private final InspirationSubmissionService service;
    public AdminInspirationSubmissionController(InspirationSubmissionService service) { this.service = service; }

    @GetMapping
    public ApiResponse<List<InspirationSubmissionService.Submission>> list(@RequestParam(defaultValue = "ALL") String status, @RequestParam(required = false) @Size(max = 120) String query) { return ApiResponse.success(service.listForAdmin(status, query)); }

    @PutMapping("/{id}/review")
    public ApiResponse<InspirationSubmissionService.Submission> review(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @RequestBody ReviewRequest request) { return ApiResponse.success(service.review(id, UUID.fromString(jwt.getSubject()), request.status(), request.reviewNote())); }

    @GetMapping("/{submissionId}/images/{imageId}")
    public ResponseEntity<Resource> image(@PathVariable UUID submissionId, @PathVariable UUID imageId) {
        var image = service.image(submissionId, imageId, false);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(image.mediaType())).header("Cache-Control", "no-store").body(image.resource());
    }

    public record ReviewRequest(@Size(max = 20) String status, @Size(max = 1000) String reviewNote) { }
}
