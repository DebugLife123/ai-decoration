package com.decoration.budget;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** 预算试算的出入参。对应 docs/ROADMAP.md 阶段 2a-2。 */
public final class BudgetDtos {
    private BudgetDtos() {
    }

    public record EstimateRequest(
            @NotNull @DecimalMin(value = "1") @DecimalMax(value = "2000") BigDecimal area,
            @Size(max = 80) String region,
            @Pattern(regexp = "BASIC|STANDARD|PREMIUM") String finishLevel,
            @Size(max = 40) String spaceType,
            UUID projectId,
            /** 关闭的板块（如不打算做结构改造）。缺省时 STRUCTURE 不参与。 */
            List<@Size(max = 40) String> disabledItems,
            /** 强制开启的板块（如老房必须做结构改造）。 */
            List<@Size(max = 40) String> enabledItems,
            /** 计划总预算（元），可选；用于超支提醒。 */
            BigDecimal targetBudget) {

        public String finishLevelOrDefault() {
            return finishLevel == null || finishLevel.isBlank() ? "STANDARD" : finishLevel;
        }

        public String spaceTypeOrDefault() {
            return spaceType == null || spaceType.isBlank() ? "WHOLE_HOME" : spaceType;
        }
    }

    /** 单个板块的试算结果。 */
    public record BudgetItem(
            String itemKey,
            String label,
            String unitKind,
            String basis,
            BigDecimal quantity,
            boolean appliedMinQty,
            String appliedMinQtyRule,
            BigDecimal wasteRate,
            /** 该板块是否被用户关闭。 */
            boolean disabled,
            /** 板块小计的材料部分。 */
            BigDecimal materialCostLow,
            BigDecimal materialCostHigh,
            /** 板块小计的人工部分。 */
            BigDecimal laborCostLow,
            BigDecimal laborCostHigh,
            BigDecimal costLow,
            BigDecimal costHigh,
            /** QUOTED / REFERENCE / DISABLED */
            String source,
            /** 单位无法识别等原因导致该板块没有可用报价。 */
            List<String> skippedReasons,
            List<QuoteSample> quoteSamples) {
    }

    public record QuoteSample(
            UUID quoteId,
            String name,
            BigDecimal price,
            String unit,
            String unitKind,
            String companyName) {
    }

    public record EstimateResult(
            BigDecimal totalLow,
            BigDecimal totalHigh,
            BigDecimal targetBudget,
            String overBudgetStatus,
            String dataQuality,
            String pricingMode,
            String modelVersion,
            BigDecimal interiorArea,
            BigDecimal wallArea,
            BigDecimal materialCostLow,
            BigDecimal materialCostHigh,
            BigDecimal laborCostLow,
            BigDecimal laborCostHigh,
            List<BudgetItem> items,
            List<String> warnings,
            Instant generatedAt) {
    }

    public record SavedBudget(
            UUID id,
            UUID projectId,
            String pricingMode,
            String modelVersion,
            BigDecimal totalLow,
            BigDecimal totalHigh,
            String dataQuality,
            EstimateResult result,
            Instant createdAt) {
    }
}
