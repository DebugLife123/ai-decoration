package com.decoration.saas;

import com.decoration.shared.api.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;
import java.util.List;

import static com.decoration.saas.CreditDtos.*;

@RestController
@RequestMapping("/api/v1/admin/credits")
@PreAuthorize("hasRole('PLATFORM_ADMIN')")
public class AdminCreditController {
    private final PersonalCreditService service;

    public AdminCreditController(PersonalCreditService service) { this.service = service; }

    @GetMapping("/users")
    public ApiResponse<List<AdminCreditUser>> users(@RequestParam(required = false) String query) {
        return ApiResponse.success(service.listUsers(query));
    }

    @PostMapping("/users/{userId}/grant")
    public ApiResponse<CreditSummary> grant(@PathVariable UUID userId, @Valid @RequestBody GrantCreditsRequest request) {
        return ApiResponse.success(service.grant(userId, request.units(), request.note()));
    }
}
