package com.decoration.business;

import com.decoration.shared.api.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import static com.decoration.business.InquiryDtos.*;

@RestController
@Validated
@RequestMapping("/api/v1")
public class InquiryController {
    private final InquiryService service;

    public InquiryController(InquiryService service) { this.service = service; }

    @PostMapping("/inquiries")
    @PreAuthorize("hasRole('PERSONAL_USER')")
    public ResponseEntity<ApiResponse<CompanyInquiry>> create(
            @AuthenticationPrincipal Jwt jwt,
            @RequestHeader("Idempotency-Key") @NotBlank @Size(min = 8, max = 128) String key,
            @Valid @RequestBody CreateInquiryRequest request) {
        var inquiry = service.create(UUID.fromString(jwt.getSubject()), key, request);
        return ResponseEntity.created(URI.create("/api/v1/business/inquiries/" + inquiry.id()))
                .body(ApiResponse.success(inquiry));
    }

    @GetMapping("/business/inquiries")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR', 'COMPANY_VIEWER')")
    public ApiResponse<List<CompanyInquiry>> list(@AuthenticationPrincipal Jwt jwt,
                                                   @RequestParam(required = false) InquiryStatus status) {
        return ApiResponse.success(service.list(companyId(jwt), status));
    }

    @GetMapping("/inquiries")
    @PreAuthorize("hasRole('PERSONAL_USER')")
    public ApiResponse<List<CompanyInquiry>> listForConsumer(@AuthenticationPrincipal Jwt jwt) {
        return ApiResponse.success(service.listForConsumer(UUID.fromString(jwt.getSubject())));
    }

    @PatchMapping("/business/inquiries/{inquiryId}/status")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR')")
    public ApiResponse<CompanyInquiry> updateStatus(@AuthenticationPrincipal Jwt jwt,
                                                    @PathVariable UUID inquiryId,
                                                    @Valid @RequestBody UpdateInquiryStatusRequest request) {
        return ApiResponse.success(service.updateStatus(companyId(jwt), inquiryId, request));
    }

    @PostMapping("/business/inquiries/{inquiryId}/replies")
    @PreAuthorize("hasAnyRole('COMPANY_ADMIN', 'COMPANY_EDITOR')")
    public ApiResponse<CompanyInquiry> reply(@AuthenticationPrincipal Jwt jwt,
                                             @PathVariable UUID inquiryId,
                                             @Valid @RequestBody CreateInquiryReplyRequest request) {
        return ApiResponse.success(service.reply(companyId(jwt), inquiryId, request));
    }

    private static UUID companyId(Jwt jwt) {
        var value = jwt.getClaimAsString("companyId");
        if (value == null || value.isBlank()) value = jwt.getSubject();
        return UUID.fromString(value);
    }
}
