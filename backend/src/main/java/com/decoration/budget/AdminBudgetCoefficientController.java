package com.decoration.budget;

import com.decoration.shared.api.ApiResponse;
import com.decoration.shared.api.BusinessApiException;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

import static com.decoration.budget.BudgetDtos.BudgetCoefficient;
import static com.decoration.budget.BudgetDtos.UpdateBudgetCoefficientRequest;

@RestController
@Validated
@PreAuthorize("hasRole('PLATFORM_ADMIN')")
@RequestMapping("/api/v1/admin/budget-coefficients")
public class AdminBudgetCoefficientController {
    private final BudgetCoefficientService service;
    private final JdbcTemplate jdbc;

    public AdminBudgetCoefficientController(BudgetCoefficientService service, JdbcTemplate jdbc) {
        this.service = service;
        this.jdbc = jdbc;
    }

    @GetMapping
    public ApiResponse<List<BudgetCoefficient>> list() {
        return ApiResponse.success(service.list());
    }

    @PutMapping("/{group}/{code}")
    public ApiResponse<BudgetCoefficient> update(@AuthenticationPrincipal Jwt jwt,
                                                  @PathVariable String group,
                                                  @PathVariable String code,
                                                  @Valid @RequestBody UpdateBudgetCoefficientRequest request) {
        if (!List.of("STYLE", "MATERIAL_GRADE", "REGION").contains(group)) {
            throw new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_GROUP", "预算系数分组无效");
        }
        var adminId = UUID.fromString(jwt.getSubject());
        var updated = service.update(group, code, request.factor(), adminId);
        jdbc.update("""
                insert into admin_audit_logs(id, actor_id, action, target_type, target_id, description, created_at)
                values (?, ?, 'BUDGET_COEFFICIENT_UPDATED', 'BUDGET_COEFFICIENT', ?, ?, now())
                """, UUID.randomUUID(), adminId, UUID.nameUUIDFromBytes((group + ":" + code).getBytes()),
                group + "/" + code + " 更新为 " + request.factor());
        return ApiResponse.success(updated);
    }
}
