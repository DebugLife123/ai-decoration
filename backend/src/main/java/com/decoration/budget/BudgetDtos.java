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
            @Pattern(regexp = "LIST|PACKAGE") String pricingMode,
            /** PACKAGE 模式下指定套餐；缺省用平台通用套餐。LIST 模式下忽略。 */
            UUID packageId,
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

        /** 计价方式：LIST 按板块清单逐项计价，PACKAGE 按套餐单价 × 实测框架面积。 */
        public String pricingModeOrDefault() {
            return pricingMode == null || pricingMode.isBlank() ? "LIST" : pricingMode;
        }
    }

    /**
     * PACKAGE 模式下命中的套餐。
     *
     * <p>套餐价是确定值（不是区间），所以 baseCostLow 与 baseCostHigh 相等；
     * 保留两个字段是为了让前端的区间渲染逻辑对两种模式通用。
     */
    public record PackageProductInfo(
            UUID id,
            String name,
            /** 企业自报价套餐有值；平台通用套餐为 null。 */
            String companyName,
            BigDecimal pricePerSqm,
            BigDecimal minArea,
            /** 按输入面积推算的外墙周长（米）。 */
            BigDecimal perimeterEstimate,
            /** 实测框架面积 = 套内面积 + 外墙厚度 × 周长。 */
            BigDecimal measuredArea,
            /** 实际计价面积 = max(实测框架面积, 最低计价面积)。 */
            BigDecimal billableArea,
            /** 是否触发了最低计价面积兜底。 */
            boolean minAreaApplied,
            BigDecimal baseCostLow,
            BigDecimal baseCostHigh) {
    }

    /** 套餐内含的配置项（对应模板「配置内全包价」）。 */
    public record PackageItem(String itemKey, String label) {
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
            /** 单价（元/计量单位），不含工程量与损耗，便于用户理解「一平米多少钱」。 */
            BigDecimal materialPriceLow,
            BigDecimal materialPriceHigh,
            BigDecimal laborPriceLow,
            BigDecimal laborPriceHigh,
            BigDecimal costLow,
            BigDecimal costHigh,
            /** QUOTED / PARTIAL / REFERENCE / DISABLED —— 整项的取值口径。 */
            String source,
            /** 材料一路的口径：QUOTED / REFERENCE / NONE。 */
            String materialSource,
            /** 人工一路的口径：QUOTED / REFERENCE / NONE。 */
            String laborSource,
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
            /** LIST 或 PACKAGE。两种模式的结果不能混加。 */
            String pricingMode,
            String modelVersion,
            BigDecimal interiorArea,
            BigDecimal wallArea,
            BigDecimal materialCostLow,
            BigDecimal materialCostHigh,
            BigDecimal laborCostLow,
            BigDecimal laborCostHigh,
            /** PACKAGE 模式下命中的套餐；LIST 模式为 null。 */
            PackageProductInfo packageProduct,
            /** 套餐内含的配置清单（模板「配置内全包价」）；LIST 模式为空数组。 */
            List<PackageItem> packageItems,
            /** 套餐外的增减项（按板块清单计价）；LIST 模式为空数组。 */
            List<BudgetItem> addonItems,
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
