package com.decoration.saas;

import com.decoration.shared.api.ApiResponse;
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

import java.util.List;
import java.util.UUID;
import java.nio.charset.StandardCharsets;

import static com.decoration.saas.CertificationBillingDtos.*;

@RestController
@RequestMapping("/api/v1/admin/certification-payments")
@PreAuthorize("hasRole('PLATFORM_ADMIN')")
public class AdminCertificationBillingController {
    private final CertificationBillingService service;

    public AdminCertificationBillingController(CertificationBillingService service) { this.service = service; }

    @GetMapping("/config")
    public ApiResponse<FeeConfig> config() { return ApiResponse.success(service.feeConfig()); }

    @PutMapping("/config")
    public ApiResponse<FeeConfig> updateConfig(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody UpdateFeeRequest request) {
        return ApiResponse.success(service.updateFee(UUID.fromString(jwt.getSubject()), request.amountCents()));
    }

    @GetMapping("/orders")
    public ApiResponse<List<PaymentOrder>> orders(@RequestParam(required = false) PaymentStatus status) {
        return ApiResponse.success(service.listOrders(status));
    }

    @PostMapping("/orders/{orderId}/confirm")
    public ApiResponse<PaymentOrder> confirm(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID orderId,
                                             @Valid @RequestBody ConfirmPaymentRequest request) {
        return ApiResponse.success(service.confirm(UUID.fromString(jwt.getSubject()), orderId,
                request.paymentReference(), request.note()));
    }

    @GetMapping("/orders/{orderId}/proof")
    public ResponseEntity<Resource> proof(@PathVariable UUID orderId) {
        var asset = service.proof(orderId);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(asset.mediaType()))
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline()
                        .filename(asset.fileName(), StandardCharsets.UTF_8).build().toString())
                .body(asset.resource());
    }

    @PostMapping("/orders/{orderId}/proof/reject")
    public ApiResponse<PaymentOrder> rejectProof(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID orderId,
                                                 @Valid @RequestBody RejectPaymentProofRequest request) {
        return ApiResponse.success(service.rejectProof(UUID.fromString(jwt.getSubject()), orderId, request.reason()));
    }
}
