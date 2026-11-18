package com.decoration.saas;

import com.decoration.shared.api.ApiResponse;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

import static com.decoration.saas.SaasDtos.Subscription;
import static com.decoration.saas.SaasDtos.AdminSubscriptionOrder;
import java.util.List;

@RestController
@RequestMapping("/api/v1/admin/subscription/orders")
@PreAuthorize("hasRole('PLATFORM_ADMIN')")
public class AdminSubscriptionOrderController {
    private final SaasSubscriptionService service;

    public AdminSubscriptionOrderController(SaasSubscriptionService service) { this.service = service; }

    @GetMapping
    public ApiResponse<List<AdminSubscriptionOrder>> pending() {
        return ApiResponse.success(service.listPendingOrders());
    }

    @PostMapping("/{orderId}/sandbox-confirm")
    public ApiResponse<Subscription> confirmSandbox(@PathVariable UUID orderId) {
        return ApiResponse.success(service.confirmSandbox(orderId));
    }
}
