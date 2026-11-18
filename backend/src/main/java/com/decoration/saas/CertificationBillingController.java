package com.decoration.saas;

import com.decoration.shared.api.ApiResponse;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

import static com.decoration.saas.CertificationBillingDtos.*;

@RestController
@Validated
@RequestMapping("/api/v1/business/certification/payment")
public class CertificationBillingController {
    private final CertificationBillingService service;

    public CertificationBillingController(CertificationBillingService service) { this.service = service; }

    @GetMapping
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN','COMPANY_EDITOR','COMPANY_VIEWER')")
    public ApiResponse<BillingSummary> summary(@AuthenticationPrincipal Jwt jwt) {
        return ApiResponse.success(service.summary(companyId(jwt)));
    }

    @PostMapping("/orders")
    @PreAuthorize("hasRole('COMPANY_ADMIN')")
    public ApiResponse<PaymentOrder> createOrder(
            @AuthenticationPrincipal Jwt jwt,
            @RequestHeader("Idempotency-Key") @NotBlank @Size(min = 8, max = 160) String key) {
        return ApiResponse.success(service.createOrder(companyId(jwt), key));
    }

    @PutMapping("/orders/{orderId}/proof")
    @PreAuthorize("hasRole('COMPANY_ADMIN')")
    public ApiResponse<PaymentOrder> submitProof(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID orderId,
                                                @jakarta.validation.Valid @RequestBody SubmitPaymentProofRequest request) {
        return ApiResponse.success(service.submitProof(companyId(jwt), orderId, request.proofAssetId(), request.payerNote()));
    }

    private static UUID companyId(Jwt jwt) {
        var value = jwt.getClaimAsString("companyId");
        return UUID.fromString(value == null || value.isBlank() ? jwt.getSubject() : value);
    }
}
