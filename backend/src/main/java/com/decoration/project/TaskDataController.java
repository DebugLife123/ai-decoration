package com.decoration.project;

import com.decoration.shared.api.ApiResponse;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
public class TaskDataController {
    private final ProjectHistoryService historyService;
    private final TaskLifecycleService lifecycleService;

    public TaskDataController(ProjectHistoryService historyService, TaskLifecycleService lifecycleService) {
        this.historyService = historyService;
        this.lifecycleService = lifecycleService;
    }

    @PostMapping("/projects/{projectId}/renders")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR', 'PERSONAL_USER')")
    public ResponseEntity<ApiResponse<JsonNode>> render(@AuthenticationPrincipal Jwt jwt,
                                                          @PathVariable UUID projectId,
                                                          @RequestBody JsonNode input) {
        return queued(jwt, projectId, "RENDER", input);
    }

    @PostMapping("/projects/{projectId}/edits")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR', 'PERSONAL_USER')")
    public ResponseEntity<ApiResponse<JsonNode>> edit(@AuthenticationPrincipal Jwt jwt,
                                                        @PathVariable UUID projectId,
                                                        @RequestBody JsonNode input) {
        return queued(jwt, projectId, "EDIT", input);
    }

    @PostMapping("/projects/{projectId}/recommendations")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR', 'PERSONAL_USER')")
    public ResponseEntity<ApiResponse<JsonNode>> recommendation(@AuthenticationPrincipal Jwt jwt,
                                                                  @PathVariable UUID projectId,
                                                                  @RequestBody JsonNode input) {
        return queued(jwt, projectId, "RECOMMENDATION", input);
    }

    @GetMapping("/projects/{projectId}/tasks")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR', 'COMPANY_VIEWER', 'PERSONAL_USER')")
    public ApiResponse<List<JsonNode>> list(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId) {
        return ApiResponse.success(historyService.listTasks(ownerId(jwt), projectId));
    }

    @GetMapping("/tasks/active")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR', 'COMPANY_VIEWER', 'PERSONAL_USER')")
    public ApiResponse<List<JsonNode>> active(@AuthenticationPrincipal Jwt jwt) {
        return ApiResponse.success(lifecycleService.listActive(ownerId(jwt)));
    }

    @GetMapping("/tasks/{taskId}")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR', 'COMPANY_VIEWER', 'PERSONAL_USER')")
    public ApiResponse<JsonNode> get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID taskId) {
        return ApiResponse.success(lifecycleService.get(ownerId(jwt), taskId));
    }

    @PostMapping("/tasks/{taskId}/start")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR', 'PERSONAL_USER')")
    public ApiResponse<JsonNode> start(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID taskId) {
        return ApiResponse.success(lifecycleService.startForOwner(ownerId(jwt), taskId));
    }

    @PostMapping("/tasks/{taskId}/progress")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR', 'PERSONAL_USER')")
    public ApiResponse<JsonNode> progress(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID taskId,
                                          @RequestBody TaskProgressRequest request) {
        return ApiResponse.success(lifecycleService.updateProgress(ownerId(jwt), taskId, request.stage(),
                request.progress(), request.message(), request.completedRooms(), request.totalRooms(), request.partialResult()));
    }

    @PostMapping("/tasks/{taskId}/finish")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR', 'PERSONAL_USER')")
    public ApiResponse<JsonNode> finish(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID taskId,
                                        @RequestBody TaskCompletionRequest request) {
        return ApiResponse.success(lifecycleService.completeForOwner(ownerId(jwt), taskId, request.result(), request.snapshot()));
    }

    @PostMapping("/tasks/{taskId}/failure")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR', 'PERSONAL_USER')")
    public ApiResponse<JsonNode> failure(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID taskId,
                                         @RequestBody TaskOwnerFailureRequest request) {
        return ApiResponse.success(lifecycleService.failForOwner(ownerId(jwt), taskId, request.error(),
                request.retryable(), request.partialResult(), request.snapshot()));
    }

    @PostMapping("/tasks/{taskId}/claim")
    @PreAuthorize("hasRole('AI_WORKER')")
    public ApiResponse<JsonNode> claim(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID taskId,
                                       @RequestBody(required = false) ClaimRequest request) {
        var workerId = jwt.getSubject() == null ? "worker" : jwt.getSubject();
        return ApiResponse.success(lifecycleService.claim(taskId, workerId, request == null ? 300 : request.leaseSeconds()));
    }

    @PostMapping("/tasks/claim-next")
    @PreAuthorize("hasRole('AI_WORKER')")
    public ApiResponse<JsonNode> claimNext(@AuthenticationPrincipal Jwt jwt,
                                           @RequestBody(required = false) ClaimRequest request) {
        var workerId = workerId(jwt);
        return ApiResponse.success(lifecycleService.claimNext(workerId, request == null ? 300 : request.leaseSeconds()));
    }

    @PostMapping("/tasks/{taskId}/complete")
    @PreAuthorize("hasRole('AI_WORKER')")
    public ApiResponse<JsonNode> complete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID taskId,
                                          @RequestBody TaskCompletionRequest request) {
        return ApiResponse.success(lifecycleService.complete(taskId, workerId(jwt), request.result(), request.snapshot()));
    }

    @PostMapping("/tasks/{taskId}/fail")
    @PreAuthorize("hasRole('AI_WORKER')")
    public ApiResponse<JsonNode> fail(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID taskId,
                                      @RequestBody TaskFailureRequest request) {
        return ApiResponse.success(lifecycleService.fail(taskId, workerId(jwt), request.error(), request.retryable()));
    }

    @PostMapping("/tasks/{taskId}/retry")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR', 'PERSONAL_USER')")
    public ApiResponse<JsonNode> retry(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID taskId) {
        return ApiResponse.success(lifecycleService.retry(ownerId(jwt), taskId));
    }

    private ResponseEntity<ApiResponse<JsonNode>> queued(Jwt jwt, UUID projectId, String type, JsonNode input) {
        var result = historyService.createTask(ownerId(jwt), projectId, type, input);
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .header(HttpHeaders.LOCATION, "/api/v1/tasks/" + result.path("id").asText())
                .body(ApiResponse.success(result));
    }

    private static UUID ownerId(Jwt jwt) {
        var value = jwt.getClaimAsString("companyId");
        if (value == null || value.isBlank()) value = jwt.getSubject();
        return UUID.fromString(value);
    }

    private static String workerId(Jwt jwt) { return jwt.getSubject(); }

    public record ClaimRequest(int leaseSeconds) { }
    public record TaskCompletionRequest(JsonNode result, JsonNode snapshot) { }
    public record TaskFailureRequest(String error, boolean retryable) { }
    public record TaskOwnerFailureRequest(String error, boolean retryable, JsonNode partialResult, JsonNode snapshot) { }
    public record TaskProgressRequest(String stage, int progress, String message, int completedRooms,
                                      int totalRooms, JsonNode partialResult) { }
}
