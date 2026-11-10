package com.decoration.business;

import com.decoration.shared.api.ApiResponse;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/audit-logs")
@PreAuthorize("hasRole('PLATFORM_ADMIN')")
public class AdminAuditController {
    private final AdminAuditLogService service;

    public AdminAuditController(AdminAuditLogService service) {
        this.service = service;
    }

    @GetMapping
    public ApiResponse<AdminAuditLogService.Page> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String action) {
        return ApiResponse.success(service.list(page, size, action));
    }
}
