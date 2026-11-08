package com.decoration.project;

import com.decoration.shared.api.ApiResponse;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@Validated
@RequestMapping("/api/v1/projects")
public class ProjectDataController {
    private final ProjectDataService service;
    private final ProjectHistoryService historyService;

    public ProjectDataController(ProjectDataService service, ProjectHistoryService historyService) {
        this.service = service;
        this.historyService = historyService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR', 'COMPANY_VIEWER', 'PERSONAL_USER')")
    public ApiResponse<List<JsonNode>> list(@AuthenticationPrincipal Jwt jwt) {
        return ApiResponse.success(service.list(companyId(jwt)));
    }

    @PutMapping
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR', 'PERSONAL_USER')")
    public ApiResponse<List<JsonNode>> replace(@AuthenticationPrincipal Jwt jwt,
                                                @Valid @RequestBody ProjectBatchRequest request) {
        return ApiResponse.success(service.replace(companyId(jwt), request.projects()));
    }

    @PutMapping("/{projectId}")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR', 'PERSONAL_USER')")
    public ResponseEntity<ApiResponse<JsonNode>> save(@AuthenticationPrincipal Jwt jwt,
                                                       @PathVariable UUID projectId,
                                                       @RequestBody JsonNode project) {
        return ResponseEntity.status(HttpStatus.OK).body(ApiResponse.success(
                service.save(companyId(jwt), projectId, project)));
    }

    @DeleteMapping("/{projectId}")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR', 'PERSONAL_USER')")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId) {
        service.delete(companyId(jwt), projectId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{projectId}/versions")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR', 'COMPANY_VIEWER', 'PERSONAL_USER')")
    public ApiResponse<List<JsonNode>> versions(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId) {
        return ApiResponse.success(historyService.listVersions(companyId(jwt), projectId));
    }

    @GetMapping("/{projectId}/tasks")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR', 'COMPANY_VIEWER', 'PERSONAL_USER')")
    public ApiResponse<List<JsonNode>> tasks(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId) {
        return ApiResponse.success(historyService.listTasks(companyId(jwt), projectId));
    }

    public record ProjectBatchRequest(@NotNull List<@NotNull JsonNode> projects) {
    }

    private static UUID companyId(Jwt jwt) {
        var ownerId = jwt.getClaimAsString("companyId");
        if (ownerId == null || ownerId.isBlank()) ownerId = jwt.getSubject();
        return UUID.fromString(ownerId);
    }
}
