package com.decoration.budget;

import com.decoration.shared.api.ApiResponse;
import jakarta.validation.Valid;
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

import static com.decoration.budget.BudgetDtos.BudgetStylePriceRange;
import static com.decoration.budget.BudgetDtos.UpdateBudgetStylePriceRequest;

@RestController
@Validated
@PreAuthorize("hasRole('PLATFORM_ADMIN')")
@RequestMapping("/api/v1/admin/budget-style-prices")
public class AdminBudgetStylePriceController {
    private final BudgetStylePriceService service;
    private final JdbcTemplate jdbc;

    public AdminBudgetStylePriceController(BudgetStylePriceService service, JdbcTemplate jdbc) {
        this.service = service;
        this.jdbc = jdbc;
    }

    @GetMapping
    public ApiResponse<List<BudgetStylePriceRange>> list() {
        return ApiResponse.success(service.list());
    }

    @PutMapping("/{code}")
    public ApiResponse<BudgetStylePriceRange> update(@AuthenticationPrincipal Jwt jwt,
                                                      @PathVariable String code,
                                                      @Valid @RequestBody UpdateBudgetStylePriceRequest request) {
        var adminId = UUID.fromString(jwt.getSubject());
        var updated = service.update(code, request.priceLowPerSqm(), request.priceHighPerSqm(), request.materialFactor(), adminId);
        jdbc.update("""
                insert into admin_audit_logs(id, actor_id, action, target_type, target_id, description, created_at)
                values (?, ?, 'BUDGET_STYLE_PRICE_UPDATED', 'BUDGET_STYLE_PRICE', ?, ?, now())
                """, UUID.randomUUID(), adminId, UUID.randomUUID(),
                code + " 更新价格为 " + request.priceLowPerSqm() + "–" + request.priceHighPerSqm() + " 元/㎡"
                        + (request.materialFactor() == null ? "" : "，材料参考系数 " + request.materialFactor()));
        return ApiResponse.success(updated);
    }
}
