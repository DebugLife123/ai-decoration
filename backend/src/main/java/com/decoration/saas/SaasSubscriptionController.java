package com.decoration.saas;

import com.decoration.shared.api.ApiResponse;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestBody;
import jakarta.validation.Valid;

import java.util.UUID;

import static com.decoration.saas.SaasDtos.Subscription;
import static com.decoration.saas.SaasDtos.UsageSummary;
import static com.decoration.saas.SaasDtos.Plan;
import static com.decoration.saas.SaasDtos.CreateOrderRequest;
import static com.decoration.saas.SaasDtos.SubscriptionOrder;
import java.util.List;

@RestController
@RequestMapping("/api/v1/business/subscription")
@PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR', 'COMPANY_VIEWER')")
public class SaasSubscriptionController {
    private final SaasSubscriptionService service;

    public SaasSubscriptionController(SaasSubscriptionService service) { this.service = service; }

    @GetMapping
    public ApiResponse<Subscription> get(@AuthenticationPrincipal Jwt jwt) {
        return ApiResponse.success(service.getOrCreate(companyId(jwt)));
    }

    @GetMapping("/usage")
    public ApiResponse<UsageSummary> usage(@AuthenticationPrincipal Jwt jwt) {
        return ApiResponse.success(service.generationUsage(companyId(jwt)));
    }

    @GetMapping("/plans")
    public ApiResponse<List<Plan>> plans() { return ApiResponse.success(service.listPlans()); }

    @GetMapping("/orders")
    public ApiResponse<List<SubscriptionOrder>> orders(@AuthenticationPrincipal Jwt jwt) {
        return ApiResponse.success(service.listOrders(companyId(jwt)));
    }

    @org.springframework.web.bind.annotation.PostMapping("/orders")
    public ApiResponse<SubscriptionOrder> createOrder(@AuthenticationPrincipal Jwt jwt,
                                                       @Valid @RequestBody CreateOrderRequest request,
                                                       @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        return ApiResponse.success(service.createOrder(companyId(jwt), request, idempotencyKey));
    }

    private static UUID companyId(Jwt jwt) {
        var value = jwt.getClaimAsString("companyId");
        if (value == null || value.isBlank()) value = jwt.getSubject();
        return UUID.fromString(value);
    }
}
