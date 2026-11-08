package com.decoration.business;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class PublicCaseCatalogDtos {
    private PublicCaseCatalogDtos() { }

    public record CaseFile(UUID id, String fileName, String mediaType) { }

    public record PublicCase(UUID id, String title, BigDecimal area, String style, BigDecimal budget,
                             String companyId, String companyName, String city, String services,
                             List<CaseFile> files, Instant updatedAt) { }

    public record PageMeta(int page, int size, long total, int totalPages) { }

    public record Page<T>(List<T> items, PageMeta page) { }
}
