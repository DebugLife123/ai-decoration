package com.decoration.saas;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;
import java.util.List;

public final class SaasDtos {
    private SaasDtos() { }

    public enum SubscriptionStatus { TRIALING, ACTIVE, PAST_DUE, GRACE_PERIOD, EXPIRED, CANCELLED }

    public record Subscription(
            UUID id,
            UUID companyId,
            String planCode,
            String planName,
            SubscriptionStatus status,
            Instant startedAt,
            Instant expiresAt,
            Instant trialEndsAt,
            int generationQuota,
            long storageLimitBytes,
            int materialLimit,
            int caseLimit,
            long materialCount,
            long caseCount,
            long generationUsed,
            int version,
            Instant updatedAt) { }

    public record UsageEntry(UUID id, String usageType, long units, UUID referenceId, Instant createdAt) { }

    public record UsageSummary(UUID subscriptionId, long generationUsed, int generationQuota,
                               long generationRemaining, List<UsageEntry> entries) { }

    public record Plan(String code, String name, int generationQuota, long storageLimitBytes,
                       int materialLimit, int caseLimit, long monthlyPriceCents) { }

    public record CreateOrderRequest(@NotBlank @Size(max = 32) String planCode) { }

    public enum OrderStatus { PENDING, PAID, CANCELLED }

    public record SubscriptionOrder(UUID id, String orderNo, String planCode, String planName,
                                    long amountCents, OrderStatus status, String paymentChannel,
                                    Instant createdAt, Instant paidAt) { }

    public record AdminSubscriptionOrder(UUID id, String orderNo, UUID companyId, String companyName,
                                         String planCode, String planName, long amountCents, OrderStatus status,
                                         String paymentChannel, Instant createdAt, Instant paidAt) { }
}
