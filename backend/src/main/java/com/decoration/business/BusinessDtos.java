package com.decoration.business;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class BusinessDtos {
    private BusinessDtos() {
    }

    public enum CaseStatus {
        draft, published
    }

    public record ProfileRequest(
            @NotBlank @Size(max = 160) String name,
            @Size(max = 80) String city,
            @Size(max = 500) String services,
            @Size(max = 2000) String intro,
            @Size(max = 120) String publicContactName,
            @Size(max = 160) String publicContactInfo,
            @Size(max = 500) String serviceAreas,
            @Size(max = 240) String businessHours,
            UUID logoAssetId,
            UUID storefrontAssetId,
            Integer version) {
    }

    public record Profile(UUID id, String name, String city, String services, String intro,
                          String publicContactName, String publicContactInfo,
                          String serviceAreas, String businessHours, UUID logoAssetId, UUID storefrontAssetId,
                          int version, Instant createdAt, Instant updatedAt) {
    }

    public record CaseRequest(
            @NotBlank @Size(max = 160) String title,
            @Digits(integer = 8, fraction = 2) @DecimalMin("0.00") BigDecimal area,
            @Size(max = 80) String style,
            @Digits(integer = 12, fraction = 2) @DecimalMin("0.00") BigDecimal budget,
            CaseStatus status,
            @Size(max = 30) List<@NotNull UUID> fileIds) {
    }

    public record CasePatch(
            @Size(max = 160) String title,
            @Digits(integer = 8, fraction = 2) @DecimalMin("0.00") BigDecimal area,
            @Size(max = 80) String style,
            @Digits(integer = 12, fraction = 2) @DecimalMin("0.00") BigDecimal budget,
            CaseStatus status,
            @Size(max = 30) List<@NotNull UUID> fileIds,
            @NotNull Integer version) {
        public boolean hasChanges() {
            return title != null || area != null || style != null || budget != null || status != null || fileIds != null;
        }
    }

    public record BusinessCase(UUID id, String title, BigDecimal area, String style, BigDecimal budget,
                               CaseStatus status, List<UUID> fileIds, int version,
                               Instant createdAt, Instant updatedAt) {
    }

    public record MaterialQuoteRequest(
            @NotBlank @Size(max = 160) String name,
            @NotBlank @Size(max = 240) String spec,
            @NotBlank @Size(max = 40) String unit,
            @NotNull @Digits(integer = 12, fraction = 2) @DecimalMin(value = "0.01") BigDecimal price,
            @NotBlank @Size(max = 80) String category,
            @NotBlank @Size(max = 80) String region,
            @NotNull LocalDate validUntil,
            UUID imageId,
            @Size(max = 120) String brand,
            @Size(max = 8) List<@NotNull UUID> imageIds) {
    }

    public record MaterialQuotePatch(
            @Size(max = 160) String name,
            @Size(max = 240) String spec,
            @Size(max = 40) String unit,
            @Digits(integer = 12, fraction = 2) @DecimalMin(value = "0.01") BigDecimal price,
            @Size(max = 80) String category,
            @Size(max = 80) String region,
            LocalDate validUntil,
            UUID imageId,
            boolean clearImage,
            @Size(max = 120) String brand,
            @Size(max = 8) List<@NotNull UUID> imageIds,
            @NotNull Integer version) {
        public boolean hasChanges() {
            return name != null || spec != null || unit != null || price != null || category != null || region != null || validUntil != null || imageId != null || clearImage || brand != null || imageIds != null;
        }
    }

    public record MaterialQuote(UUID id, String name, String spec, String unit, BigDecimal price, String brand,
                                String category, String region, LocalDate validUntil, UUID imageId, List<UUID> imageIds, int version,
                                Instant createdAt, Instant updatedAt) {
    }

    public record LaborQuoteRequest(
            @NotBlank @Size(max = 160) String type,
            @NotBlank @Size(max = 40) String unit,
            @NotNull @Digits(integer = 12, fraction = 2) @DecimalMin(value = "0.01") BigDecimal price,
            @NotBlank @Size(max = 80) String region,
            @NotNull LocalDate validUntil) {
    }

    public record LaborQuotePatch(
            @Size(max = 160) String type,
            @Size(max = 40) String unit,
            @Digits(integer = 12, fraction = 2) @DecimalMin(value = "0.01") BigDecimal price,
            @Size(max = 80) String region,
            LocalDate validUntil,
            @NotNull Integer version) {
        public boolean hasChanges() {
            return type != null || unit != null || price != null || region != null || validUntil != null;
        }
    }

    public record LaborQuote(UUID id, String type, String unit, BigDecimal price, String region,
                             LocalDate validUntil, int version, Instant createdAt, Instant updatedAt) {
    }

    public record PageMeta(int page, int size, long total, int totalPages) {
    }

    public record Page<T>(List<T> items, PageMeta page) {
    }
}
