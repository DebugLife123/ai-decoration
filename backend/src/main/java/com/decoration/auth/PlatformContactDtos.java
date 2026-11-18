package com.decoration.auth;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;
import java.time.Instant;

public final class PlatformContactDtos {
    private PlatformContactDtos() { }

    public record UpdateRequest(
            @NotNull @Size(max = 120) String contactName,
            @NotNull @Size(max = 80) String phone,
            @NotNull @Email @Size(max = 320) String email,
            @NotNull @Size(max = 120) String wechat,
            @NotNull @Size(max = 500) String message) { }

    public record PublicContact(String contactName, String phone, String email, String wechat, String message) { }
    public record ContactSettings(String contactName, String phone, String email, String wechat, String message,
                                  Instant updatedAt) { }
}
