package com.decoration.budget;

import java.util.Locale;
import java.util.Optional;

/**
 * 报价计量单位枚举。
 *
 * <p>依据 docs/BUDGET_SECTIONS.md §7.3：真实装企模板里出现的单位写法有 20 种，
 * 除了常规的面积/长度/件/套/包装/工日，还存在复合单位（楼梯按级、清运按层、
 * 找平按厘米厚度、橱柜按套米）以及按户/间的计数单位。
 *
 * <p>无法识别的单位（例如把规格「mm」误填成单位）一律落到 {@link #UNKNOWN}，
 * 并让报价带 {@code unit_unknown = true} 从而不参与预算计算——
 * 否则「299 元/mm」会被当成「299 元/㎡」，结果放大 1000 倍。
 */
public enum BudgetUnitKind {
    /** 平方米 */
    SQM,
    /** 延米 */
    LM,
    /** 件（含樘／个／片／扇／盏／根） */
    PIECE,
    /** 套／项／组 */
    SET,
    /** 桶／袋／箱／包 */
    PACKAGE,
    /** 工日 */
    DAY,
    /** 楼梯踏步：延米／级 */
    LM_PER_LEVEL,
    /** 垃圾清运：平方米／层 */
    SQM_PER_FLOOR,
    /** 上楼费：延米／层 */
    LM_PER_FLOOR,
    /** 落差找平：厘米／平方米 */
    CM_PER_SQM,
    /** 橱柜：套米 */
    SET_LM,
    /** 按户 */
    HOUSE,
    /** 按间 */
    ROOM,
    /** 无法识别，不参与计算 */
    UNKNOWN;

    /**
     * 把企业录入的自由文本单位映射成枚举。
     *
     * <p>规则与 V20 迁移里的 SQL 回填保持一致；改这里的映射要同步改迁移脚本，
     * 否则历史数据和新增数据会分叉。
     */
    public static BudgetUnitKind fromLabel(String rawUnit) {
        if (rawUnit == null) return UNKNOWN;
        var unit = rawUnit.trim();
        if (unit.isEmpty()) return UNKNOWN;
        var lower = unit.toLowerCase(Locale.ROOT);
        return switch (lower) {
            case "㎡", "m2", "m²", "平方米", "平米", "平方" -> SQM;
            case "m", "米", "延米" -> LM;
            case "m/级" -> LM_PER_LEVEL;
            case "m2/层", "㎡/层" -> SQM_PER_FLOOR;
            case "m/层" -> LM_PER_FLOOR;
            case "cm/m2", "cm/㎡" -> CM_PER_SQM;
            default -> switch (unit) {
                case "樘", "个", "件", "块", "片", "扇", "盏", "根" -> PIECE;
                case "套", "项", "组" -> SET;
                case "桶", "袋", "箱", "包" -> PACKAGE;
                case "工日", "人日", "天" -> DAY;
                case "套米" -> SET_LM;
                case "户" -> HOUSE;
                case "间" -> ROOM;
                default -> UNKNOWN;
            };
        };
    }

    /** 单位字符串是否可识别（可直接用于预算计算）。 */
    public static boolean isRecognized(String rawUnit) {
        return fromLabel(rawUnit) != UNKNOWN;
    }

    /** 给企业端展示的「请改成什么」提示。 */
    public static Optional<String> suggestion(String rawUnit) {
        if (isRecognized(rawUnit)) return Optional.empty();
        return Optional.of("该单位无法识别，请改为：平方米 / 延米 / 樘 / 套 / 桶 / 工日 等计量单位"
                + "（规格尺寸请填在「规格」字段，不要填在单位里）");
    }
}
