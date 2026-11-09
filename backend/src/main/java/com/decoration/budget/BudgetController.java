package com.decoration.budget;

import com.decoration.shared.api.ApiResponse;
import com.decoration.shared.api.BusinessApiException;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

import static com.decoration.budget.BudgetDtos.EstimateRequest;
import static com.decoration.budget.BudgetDtos.EstimateResult;
import static com.decoration.budget.BudgetDtos.SavedBudget;

/**
 * 预算试算接口。
 *
 * <p>试算是匿名的（与 /api/v1/styles/recommendations 一致）：
 * 用户在登录前就应该能看到预算参考。保存与查询需要登录。
 */
@RestController
@Validated
@RequestMapping("/api/v1/budgets")
public class BudgetController {
    private final BudgetEstimateService estimateService;
    private final BudgetArchiveService archiveService;
    private final JdbcTemplate jdbc;

    public BudgetController(BudgetEstimateService estimateService, BudgetArchiveService archiveService,
                            JdbcTemplate jdbc) {
        this.estimateService = estimateService;
        this.archiveService = archiveService;
        this.jdbc = jdbc;
    }

    @PostMapping("/estimate")
    public ApiResponse<EstimateResult> estimate(@Valid @RequestBody EstimateRequest request) {
        return ApiResponse.success(estimateService.estimate(request));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<SavedBudget>> save(@AuthenticationPrincipal Jwt jwt,
                                                          @Valid @RequestBody EstimateRequest request) {
        var result = estimateService.estimate(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(archiveService.save(ownerId(jwt), request, result)));
    }

    @GetMapping
    public ApiResponse<List<SavedBudget>> list(@AuthenticationPrincipal Jwt jwt,
                                                @RequestParam(required = false) UUID projectId) {
        return ApiResponse.success(archiveService.list(ownerId(jwt), projectId));
    }

    @GetMapping("/{id}")
    public ApiResponse<SavedBudget> get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        var items = archiveService.list(ownerId(jwt), null).stream()
                .filter(budget -> budget.id().equals(id))
                .toList();
        if (items.isEmpty()) throw notFound();
        return ApiResponse.success(items.getFirst());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        if (!archiveService.delete(ownerId(jwt), id)) throw notFound();
        return ResponseEntity.noContent().build();
    }

    private static UUID ownerId(Jwt jwt) {
        var value = jwt.getClaimAsString("companyId");
        if (value == null || value.isBlank()) value = jwt.getSubject();
        return UUID.fromString(value);
    }

    private static BusinessApiException notFound() {
        return new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "预算记录不存在");
    }
}
