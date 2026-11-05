package com.decoration.business;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class CertificationDtos {
    private CertificationDtos() { }

    public enum CertificationStatus { PENDING, APPROVED, REJECTED }

    public record CertificationRequest(
            @NotBlank @Size(max = 160) String companyName,
            @NotBlank @Size(max = 120) String contactName,
            @NotBlank @Size(max = 160) String contactInfo,
            @NotNull @Size(max = 20) List<@NotBlank @Size(max = 80) String> serviceAreas,
            @NotNull @Size(max = 30) List<@NotBlank @Size(max = 2000) String> documentRefs,
            Integer version) { }

    public record CertificationDecision(
            @NotNull CertificationStatus status,
            @Size(max = 1000) String reviewNote,
            @NotNull Integer version) { }

    public record Certification(UUID id, String companyName, String contactName, String contactInfo,
                                List<String> serviceAreas, List<String> documentRefs, CertificationStatus status,
                                String reviewNote, UUID reviewedBy, Instant reviewedAt, int version,
                                Instant submittedAt, Instant updatedAt) { }

    public record AdminCertification(UUID companyId, String registeredCompanyName, String accountEmail,
                                     Certification certification) { }
}
