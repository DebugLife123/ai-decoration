package com.decoration.business;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

public final class InquiryDtos {
    private InquiryDtos() { }

    public enum InquiryStatus { NEW, CONTACTED, QUOTED, CLOSED }

    public record CreateInquiryRequest(
            @NotNull UUID materialId,
            @NotBlank @Size(max = 120) String contactName,
            @NotBlank @Size(max = 160) String contactInfo,
            @NotBlank @Size(max = 2000) String message) { }

    public record UpdateInquiryStatusRequest(@NotNull InquiryStatus status, int version) { }

    public record CompanyInquiry(
            UUID id,
            UUID materialId,
            String materialName,
            String contactName,
            String contactInfo,
            String message,
            InquiryStatus status,
            int version,
            Instant createdAt,
            Instant updatedAt) { }
}
