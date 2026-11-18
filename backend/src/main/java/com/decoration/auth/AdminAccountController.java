package com.decoration.auth;

import com.decoration.shared.api.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;
import static com.decoration.auth.AdminAccountDtos.*;

@RestController
@Validated
@RequestMapping("/api/v1/admin/accounts")
@PreAuthorize("hasRole('PLATFORM_ADMIN')")
public class AdminAccountController {
    private final AdminAccountService service;
    public AdminAccountController(AdminAccountService service) { this.service = service; }

    @GetMapping
    public ApiResponse<AccountPage> list(@RequestParam(defaultValue = "PERSONAL") String type,
            @RequestParam(defaultValue = "ALL") String status, @RequestParam(required = false) @Size(max = 120) String query,
            @RequestParam(defaultValue = "1") @Min(1) int page, @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return ApiResponse.success(service.list(type, status, query, page, size));
    }
    @GetMapping("/{id}")
    public ApiResponse<Detail> detail(@PathVariable UUID id) { return ApiResponse.success(service.detail(id)); }
    @PostMapping
    public ResponseEntity<ApiResponse<Account>> create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateRequest request) {
        return ResponseEntity.status(201).body(ApiResponse.success(service.create(UUID.fromString(jwt.getSubject()), request)));
    }
    @PutMapping("/{id}")
    public ApiResponse<Account> update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody UpdateRequest request) {
        return ApiResponse.success(service.update(UUID.fromString(jwt.getSubject()), id, request));
    }
    @PatchMapping("/{id}/status")
    public ApiResponse<Account> status(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody StatusRequest request) {
        return ApiResponse.success(service.changeStatus(UUID.fromString(jwt.getSubject()), id, request.status()));
    }
    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        service.delete(UUID.fromString(jwt.getSubject()), id);
        return ApiResponse.success(null);
    }
}
