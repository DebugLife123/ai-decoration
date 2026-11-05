package com.decoration.business;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * 企业风格资料：企业维护自己擅长的风格与预算区间，C 端预算试算时作为推荐依据。
 * 预算区间以「万元」为单位，maxBudgetWan 为空表示不设上限。
 */
public final class StyleDtos {
    private StyleDtos() {
    }

    public record StyleProfileRequest(
            @NotBlank @Size(max = 40) String style,
            @NotBlank @Size(max = 80) String name,
            @Size(max = 300) String note,
            @Size(max = 600) String reason,
            @NotNull @DecimalMin("0") @Digits(integer = 6, fraction = 1) BigDecimal minBudgetWan,
            @DecimalMin("0") @Digits(integer = 6, fraction = 1) BigDecimal maxBudgetWan,
            @Size(max = 20) List<@NotBlank @Size(max = 40) String> regions,
            @Min(0) @Max(99) Integer priority) {
    }

    public record StyleProfileUpdateRequest(@NotNull @Size(max = 30) List<@Valid StyleProfileRequest> profiles) {
    }

    /** 企业自己看到的风格资料（带企业标识与版本，便于乐观锁）。 */
    public record CompanyStyleProfile(UUID companyId, String companyName, List<StyleProfileRequest> profiles,
                                      int version, Instant updatedAt) {
    }

    public record CompanyStyleProfileStore(List<StyleProfileRequest> profiles, int version) {
    }

    /** C 端推荐用：只暴露展示所需字段，附带企业名方便标注来源。 */
    public record RecommendationProfile(
            String style,
            String name,
            String note,
            String reason,
            BigDecimal minBudgetWan,
            BigDecimal maxBudgetWan,
            List<String> regions,
            Integer priority,
            UUID companyId,
            String companyName) {
    }
}
