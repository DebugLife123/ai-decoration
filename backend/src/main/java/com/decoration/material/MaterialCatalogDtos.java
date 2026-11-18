package com.decoration.material;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** 平台侧材料目录的出入参。C 端只读，数据来自已认证企业录入的报价。 */
public final class MaterialCatalogDtos {
    private MaterialCatalogDtos() {
    }

    public record CatalogMaterial(
            UUID id,
            UUID companyId,
            String companyName,
            String companyContactName,
            String companyContactInfo,
            String name,
            String spec,
            String unit,
            BigDecimal price,
            String brand,
            String category,
            String region,
            LocalDate validUntil,
            UUID imageId,
            List<UUID> imageIds,
            Instant updatedAt,
            String unitKind,
            boolean unitUnknown,
            String itemNature,
            List<String> styleKeys) {
    }

    public record PageMeta(int page, int size, long total, int totalPages) {
    }

    public record Page<T>(List<T> items, PageMeta page) {
    }
}
