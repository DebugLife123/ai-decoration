package com.decoration.business;

import com.decoration.shared.api.ApiResponse;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

import static com.decoration.business.NotificationDtos.Notification;

@RestController
@Validated
@RequestMapping("/api/v1/notifications")
@PreAuthorize("hasAnyRole('PERSONAL_USER', 'COMPANY_ADMIN', 'COMPANY_EDITOR', 'COMPANY_VIEWER', 'PLATFORM_ADMIN')")
public class NotificationController {
    private final NotificationService service;

    public NotificationController(NotificationService service) { this.service = service; }

    @GetMapping
    public ApiResponse<List<Notification>> list(@AuthenticationPrincipal Jwt jwt) {
        return ApiResponse.success(service.list(UUID.fromString(jwt.getSubject()), recipientRole(jwt)));
    }

    @PatchMapping("/{key}/read")
    public ApiResponse<Void> markRead(@AuthenticationPrincipal Jwt jwt, @PathVariable @Size(max = 255) String key) {
        service.markRead(UUID.fromString(jwt.getSubject()), recipientRole(jwt), key);
        return ApiResponse.success(null);
    }

    @PostMapping("/read-all")
    public ApiResponse<Void> markAllRead(@AuthenticationPrincipal Jwt jwt) {
        service.markAllRead(UUID.fromString(jwt.getSubject()), recipientRole(jwt));
        return ApiResponse.success(null);
    }

    private static String recipientRole(Jwt jwt) {
        var roles = jwt.getClaimAsStringList("roles");
        if (roles != null && roles.contains("PLATFORM_ADMIN")) return "ADMIN";
        if (roles != null && roles.stream().anyMatch(role -> role.startsWith("COMPANY_"))) return "BUSINESS";
        return "PERSONAL";
    }
}
