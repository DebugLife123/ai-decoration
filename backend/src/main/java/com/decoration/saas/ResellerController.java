package com.decoration.saas;

import com.decoration.shared.api.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

import static com.decoration.saas.ResellerDtos.*;

@RestController
@RequestMapping("/api/v1/admin/resellers")
@PreAuthorize("hasRole('PLATFORM_ADMIN')")
public class ResellerController {
    private final ResellerService service;

    public ResellerController(ResellerService service) { this.service = service; }

    @GetMapping
    public ApiResponse<List<ResellerPartner>> list() { return ApiResponse.success(service.list()); }

    @GetMapping("/companies")
    public ApiResponse<List<AdminAssignableCompany>> listAssignableCompanies() {
        return ApiResponse.success(service.listAssignableCompanies());
    }

    @PostMapping
    public ApiResponse<ResellerPartner> create(@Valid @RequestBody CreateResellerRequest request) {
        return ApiResponse.success(service.create(request));
    }

    @PutMapping("/{resellerId}/companies/{companyId}")
    public ApiResponse<ResellerCompany> assign(@PathVariable UUID resellerId, @PathVariable UUID companyId) {
        return ApiResponse.success(service.assign(resellerId, companyId));
    }

    @DeleteMapping("/{resellerId}/companies/{companyId}")
    public ApiResponse<Void> unassign(@PathVariable UUID resellerId, @PathVariable UUID companyId) {
        service.unassign(resellerId, companyId);
        return ApiResponse.success(null);
    }
}
