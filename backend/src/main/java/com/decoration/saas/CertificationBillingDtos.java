package com.decoration.saas;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

public final class CertificationBillingDtos {
    private CertificationBillingDtos() { }

    public enum PaymentStatus { PENDING, PAID, CANCELLED }
    public enum ProofStatus { NOT_SUBMITTED, SUBMITTED, REJECTED }

    public record FeeConfig(long amountCents, UUID updatedBy, Instant updatedAt) { }

    public record PaymentOrder(UUID id, String orderNo, UUID companyId, String companyName,
                               long amountCents, PaymentStatus status, String paymentChannel,
                               UUID proofAssetId, String proofFileName, String payerNote, Instant proofSubmittedAt,
                               ProofStatus proofStatus, String proofRejectionReason, UUID proofReviewedBy, Instant proofReviewedAt,
                               String paymentReference, String note, UUID confirmedBy, Instant createdAt, Instant paidAt) { }

    public record BillingSummary(long amountCents, boolean eligible, boolean exempt,
                                 String exemptionReason, PaymentOrder latestOrder) { }

    public record UpdateFeeRequest(@Min(0) @Max(100_000_000) long amountCents) { }

    public record SubmitPaymentProofRequest(@NotNull UUID proofAssetId,
                                            @NotBlank @Size(max = 500) String payerNote) { }

    public record ConfirmPaymentRequest(@NotBlank @Size(max = 120) String paymentReference,
                                        @Size(max = 500) String note) { }

    public record RejectPaymentProofRequest(@NotBlank @Size(max = 500) String reason) { }
}
