package com.decoration.auth;

import com.decoration.shared.api.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;
import static com.decoration.auth.PlatformContactDtos.*;

@RestController
@Validated
public class PlatformContactController {
    private final PlatformContactService service;
    public PlatformContactController(PlatformContactService service) { this.service = service; }

    @GetMapping("/api/v1/platform-contact")
    public ApiResponse<PublicContact> publicContact() { return ApiResponse.success(service.publicContact()); }

    @GetMapping("/api/v1/admin/platform-contact")
    @PreAuthorize("hasRole('PLATFORM_ADMIN')")
    public ApiResponse<ContactSettings> settings() { return ApiResponse.success(service.settings()); }

    @PutMapping("/api/v1/admin/platform-contact")
    @PreAuthorize("hasRole('PLATFORM_ADMIN')")
    public ApiResponse<ContactSettings> update(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody UpdateRequest request) {
        return ApiResponse.success(service.update(UUID.fromString(jwt.getSubject()), request));
    }
}
