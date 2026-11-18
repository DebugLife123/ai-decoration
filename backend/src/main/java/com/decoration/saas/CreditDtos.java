package com.decoration.saas;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class CreditDtos {
    private CreditDtos() { }

    public record CreditAccount(UUID userId, long balance, Instant updatedAt) { }

    public record CreditLedgerEntry(UUID id, long delta, long balanceAfter, String eventType,
                                    String note, Instant createdAt) { }

    public record CreditSummary(CreditAccount account, List<CreditLedgerEntry> entries) { }

    public record AdminCreditUser(UUID userId, String email, String displayName, long balance, Instant updatedAt) { }

    public record CreditOperation(UUID id, long units, String status, UUID referenceId) { }

    public record ReserveCreditsRequest(@Min(1) long units) { }

    public record FinalizeCreditsRequest(boolean success) { }

    public record GrantCreditsRequest(@Min(1) long units, @Size(max = 240) String note) { }
}
