package com.decoration.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

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

    public record User(UUID id, String email, String displayName, String accountType, UUID companyId, String role) {
    }

    public record AuthResponse(String accessToken, long expiresInSeconds, User user) {
    }
}
