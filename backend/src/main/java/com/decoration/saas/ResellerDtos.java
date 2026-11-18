package com.decoration.saas;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class ResellerDtos {
    private ResellerDtos() { }

    public record ResellerPartner(UUID id, String code, String name, String contactName,
                                  String contactInfo, String status, String loginEmail, long companyCount,
                                  Instant createdAt, Instant updatedAt) { }

    public record ResellerCompany(UUID companyId, String companyName, UUID resellerId,
                                  String resellerCode, String resellerName, String status,
                                  Instant assignedAt, Instant updatedAt) { }

    public record AdminAssignableCompany(UUID companyId, String companyName) { }

    public record CreateResellerRequest(
            @NotBlank @Size(max = 64) String code,
            @NotBlank @Size(max = 160) String name,
            @Size(max = 120) String contactName,
            @Size(max = 200) String contactInfo,
            @NotBlank @Email @Size(max = 320) String loginEmail,
            @NotBlank @Size(min = 8, max = 128) String initialPassword) { }

    public record ResellerDashboard(ResellerPartner reseller, long companyCount,
                                    long activeSubscriptionCount, long expiredSubscriptionCount,
                                    List<ResellerDashboardCompany> companies) { }

    public record ResellerDashboardCompany(UUID companyId, String companyName, String accountEmail,
                                           String certificationStatus, String planName,
                                           String subscriptionStatus, Instant expiresAt,
                                           long materialCount, int materialLimit, long caseCount,
                                           int caseLimit, long generationUsed, int generationQuota,
                                           Instant assignedAt) { }
}
