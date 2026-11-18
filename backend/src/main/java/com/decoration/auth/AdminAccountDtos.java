package com.decoration.auth;

import com.decoration.saas.CreditDtos.CreditLedgerEntry;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class AdminAccountDtos {
    private AdminAccountDtos() { }

    public record Account(UUID id, String email, String displayName, String accountType, String status,
                          UUID companyId, String companyName, String certificationStatus, long materialCount,
                          long caseCount, long balance, Instant createdAt, Instant lastLoginAt) { }
    public record AccountPage(List<Account> items, int page, int size, long total, int totalPages) { }
    public record Submission(UUID id, String title, String style, String status, Instant updatedAt) { }
    public record Detail(Account account, List<CreditLedgerEntry> creditEntries, List<Submission> submissions) { }
    public record CreateRequest(@NotBlank @Email @Size(max = 320) String email,
                                @NotBlank @Size(min = 8, max = 128) String password,
                                @NotBlank @Size(max = 120) String displayName,
                                @NotBlank @Pattern(regexp = "PERSONAL|BUSINESS") String accountType,
                                @Size(max = 160) String companyName) { }
    public record UpdateRequest(@NotBlank @Email @Size(max = 320) String email,
                                @NotBlank @Size(max = 120) String displayName,
                                @Size(max = 160) String companyName) { }
    public record StatusRequest(@NotBlank @Pattern(regexp = "ACTIVE|DISABLED") String status) { }
}
