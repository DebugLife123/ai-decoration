package com.decoration.business;

import com.decoration.shared.api.ApiResponse;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequestMapping("/api/v1/admin/audit-logs")
@PreAuthorize("hasRole('PLATFORM_ADMIN')")
public class AdminAuditController {
    private final AdminAuditLogService service;

    public AdminAuditController(AdminAuditLogService service) {
        this.service = service;
    }

    /** page/size 的上限与契约 PageMeta 一致，避免一次拉全表。 */
    @GetMapping
    public ApiResponse<AdminAuditLogService.Page> list(
            @RequestParam(defaultValue = "1") @Min(1) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size,
            @RequestParam(required = false) String action) {
        return ApiResponse.success(service.list(page, size, action));
    }
}
