package com.decoration.business;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class PublicCompanyDtos {
    private PublicCompanyDtos() { }

    public record PublicCompany(UUID companyId, String name, String city, String services, String intro,
                                List<String> serviceAreas, String businessHours,
                                String publicContactName, String publicContactInfo,
                                UUID logoAssetId, UUID storefrontAssetId, long caseCount,
                                long materialCount, String certificationStatus, Instant updatedAt) { }
}
