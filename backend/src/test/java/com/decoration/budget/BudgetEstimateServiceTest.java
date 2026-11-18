package com.decoration.budget;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** 分位数与换算规则的纯函数测试；板块合计守恒走集成测试。 */
class BudgetEstimateServiceTest {

    @Test
    void percentileReturnsNullForEmptySample() {
        assertNull(BudgetEstimateService.percentile(List.of(), 0.25));
    }

    @Test
    void percentileReturnsSingleValueDirectly() {
        var value = BudgetEstimateService.percentile(List.of(new BigDecimal("268.00")), 0.75);
        assertEquals(new BigDecimal("268.00"), value);
    }

    @Test
    void percentileInterpolatesBetweenSamples() {
        var prices = List.of(new BigDecimal("268.00"), new BigDecimal("299.00"));
        // 样本 2 个时 P25 与 P75 都落在中点附近。
        assertEquals(new BigDecimal("268.00"), BudgetEstimateService.percentile(prices, 0.0));
        assertEquals(new BigDecimal("299.00"), BudgetEstimateService.percentile(prices, 1.0));
        assertEquals(new BigDecimal("283.50"), BudgetEstimateService.percentile(prices, 0.5));
    }

    @Test
    void percentileWithThreeSamplesSkewsTowardCenter() {
        var prices = List.of(new BigDecimal("200.00"), new BigDecimal("300.00"), new BigDecimal("400.00"));
        assertEquals(new BigDecimal("200.00"), BudgetEstimateService.percentile(prices, 0.0));
        assertEquals(new BigDecimal("300.00"), BudgetEstimateService.percentile(prices, 0.5));
        assertEquals(new BigDecimal("400.00"), BudgetEstimateService.percentile(prices, 1.0));
    }

    @Test
    void quantityUncertaintyBandIsSymmetric() {
        var base = new BigDecimal("67.40");
        var low = base.multiply(BudgetEstimateService.QUANTITY_LOW_FACTOR);
        var high = base.multiply(BudgetEstimateService.QUANTITY_HIGH_FACTOR);
        // 67.40 × 0.92 = 62.008；67.40 × 1.08 = 72.792
        assertEquals(0, new BigDecimal("62.008").compareTo(low));
        assertEquals(0, new BigDecimal("72.792").compareTo(high));
        assertEquals(0, base.subtract(low).compareTo(high.subtract(base)),
                "区间应围绕基准工程量对称展开");
    }

    @Test
    void interiorAndWallRatiosFollowTemplateRules() {
        // 120㎡ → 套内 93.6 → 墙面 238.68
        var interior = new BigDecimal("120").multiply(BudgetEstimateService.INTERIOR_RATIO);
        assertEquals(0, new BigDecimal("93.6").compareTo(interior));
        var wall = interior.multiply(BudgetEstimateService.WALL_RATIO);
        assertEquals(0, new BigDecimal("238.68").compareTo(wall));
        assertTrue(wall.compareTo(interior) > 0, "墙面面积必须大于套内面积");
    }
}
