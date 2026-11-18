package com.decoration.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

public final class AuthDtos {
    private AuthDtos() {
    }

    public record RegisterRequest(
            @NotBlank @Email @Size(max = 320) String email,
            @NotBlank @Size(min = 8, max = 128) String password,
            @NotBlank @Size(max = 120) String displayName,
            @NotBlank String accountType,
            @Size(max = 160) String companyName) {
    }

    public record LoginRequest(
            @NotBlank @Email @Size(max = 320) String email,
            @NotBlank @Size(max = 128) String password,
            String accountType) {
    }

    public record UpdateProfileRequest(
            @NotBlank @Size(max = 120) String displayName) {
    }

    public record ChangePasswordRequest(
            @NotBlank @Size(max = 128) String currentPassword,
            @NotBlank @Size(min = 8, max = 128) String newPassword) {
    }

    public record UserSession(UUID id, String deviceName, String userAgent, String ipAddress,
                              Instant createdAt, Instant lastSeenAt, Instant expiresAt, boolean current) {
    }

    public record User(UUID id, String email, String displayName, String accountType, UUID companyId, String role,
                       Instant createdAt, Instant lastLoginAt, UUID avatarId) {
    }

    public record AuthResponse(String accessToken, long expiresInSeconds, User user) {
    }
}
