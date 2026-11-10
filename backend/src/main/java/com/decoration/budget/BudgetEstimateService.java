package com.decoration.budget;

import com.decoration.shared.api.BusinessApiException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static com.decoration.budget.BudgetDtos.BudgetItem;
import static com.decoration.budget.BudgetDtos.EstimateRequest;
import static com.decoration.budget.BudgetDtos.EstimateResult;
import static com.decoration.budget.BudgetDtos.PackageItem;
import static com.decoration.budget.BudgetDtos.PackageProductInfo;
import static com.decoration.budget.BudgetDtos.QuoteSample;

/**
 * 预算试算（阶段 2a-2）。
 *
 * <p>核心是三层降级：
 * <pre>
 *   QUOTED     板块有 ≥N 家企业的可识别报价 → 用真实报价
 *   REFERENCE  没有满足门槛的报价           → 用 budget_reference_bands 基准区间
 *   DISABLED   用户显式关闭的板块            → 不计价，但要在结果里列出来
 * </pre>
 *
 * <p>缺失板块必须用基准回填，绝不能算 0——否则只有地板报价时，
 * 用户会看到一个「砍掉 40% 分项」的荒谬低值。
 *
 * <p>回归基准：清空企业报价时，9 个板块合计必须等于
 * 前端 src/pages/BudgetPage.tsx 原 6 项 referenceCosts 的计算总额
 * （BASIC 档 1790–3110 元/㎡ 严格守恒）。
 */
@Service
public class BudgetEstimateService {

    /** 引用基准前需要的最少企业数；低于门槛的类目降级为 REFERENCE。 */
    static final int MIN_COMPANY_COUNT = 3;
    static final BigDecimal QUANTITY_LOW_FACTOR = new BigDecimal("0.92");
    static final BigDecimal QUANTITY_HIGH_FACTOR = new BigDecimal("1.08");
    /** 得房率（高层 0.75–0.82 的保守中值）。 */
    static final BigDecimal INTERIOR_RATIO = new BigDecimal("0.78");
    /** 墙面展开系数（周长 × 层高的经验值，扣门窗后约 2.55）。 */
    static final BigDecimal WALL_RATIO = new BigDecimal("2.55");
    /**
     * 外墙厚度（米），与 docs/ROADMAP.md 阶段 2a-4 的公式一致：
     * {@code area_measured = area × 0.78 + 0.24 × perimeter_estimate}。
     *
     * <p>ROADMAP 里写的是「外墙 240mm」，公式里按 0.24 全额计入周长，
     * 这里照抄不改——改系数属于 2a-6 校准的范畴，会动总额。
     */
    static final BigDecimal EXTERIOR_WALL_THICKNESS = new BigDecimal("0.24");
    /**
     * 周长估算系数：周长 ≈ 建筑面积 ^ 0.5 × 该系数。
     *
     * <p>户型越方正周长越短，这个系数取的是常见两/三居的平均值（约 4.4）：
     * 120㎡ → 4.4 × 10.95 ≈ 48.2 m，与「开间 12m × 进深 10m」的方盒周长 44m 同量级。
     */
    static final BigDecimal PERIMETER_FACTOR = new BigDecimal("4.4");
    /** 套餐最低计价面积兜底（模板 90㎡）。 */
    static final BigDecimal DEFAULT_PACKAGE_MIN_AREA = new BigDecimal("90");
    static final String MODEL_VERSION = "v5";

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public BudgetEstimateService(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    /** 板块定义（来自 budget_items）。 */
    record ItemDef(String key, String label, String unitKind, int sortOrder,
                   boolean defaultOn, BigDecimal materialRatio) {
    }

    /** 工程量系数（来自 workload_factors）。 */
    record Factor(String basis, BigDecimal perSqm, BigDecimal wasteRate) {
    }

    /** 最低计量规则（来自 budget_min_qty）。 */
    record MinQty(BigDecimal minQty, String scope, String note) {
    }

    /** 匹配到的报价（来自 material_quotes / labor_quotes）。 */
    record Quote(UUID id, String name, BigDecimal price, String unit, String unitKind,
                 String companyName, boolean isLabor) {
    }

    /** 单价区间（P25 / P75）。 */
    record Band(BigDecimal low, BigDecimal high) {
    }

    public EstimateResult estimate(EstimateRequest request) {
        // 两种模式的结果不能混加：PACKAGE 只出「套餐价 + 增项」，
        // LIST 才逐板块算。「混加」在模板里就是最常见的算错来源
        // （套餐价已经含了地面/墙面/水电，再叠一遍分项就翻倍）。
        if ("PACKAGE".equals(request.pricingModeOrDefault())) {
            return estimateByPackage(request);
        }
        return estimateByList(request);
    }

    private EstimateResult estimateByList(EstimateRequest request) {
        var area = request.area();
        var finishLevel = request.finishLevelOrDefault();
        var spaceType = request.spaceTypeOrDefault();

        var interiorArea = area.multiply(INTERIOR_RATIO).setScale(2, RoundingMode.HALF_UP);
        var wallArea = interiorArea.multiply(WALL_RATIO).setScale(2, RoundingMode.HALF_UP);

        var items = loadItems();
        var factors = loadFactors(spaceType);
        var minQtyRules = loadMinQtyRules();
        var categoriesByItem = loadCategories();
        var warnings = new ArrayList<String>();

        var disabledKeys = new HashSet<>(nullSafe(request.disabledItems()));
        var enabledKeys = new HashSet<>(nullSafe(request.enabledItems()));
        // STRUCTURE 默认参与：模板里结构改造是独立分部，老房必然有拆改。
        // 用户可用 disabledItems 关闭（新房不想包含拆改）。

        var resultItems = new ArrayList<BudgetItem>();
        var materialLow = BigDecimal.ZERO;
        var materialHigh = BigDecimal.ZERO;
        var laborLow = BigDecimal.ZERO;
        var laborHigh = BigDecimal.ZERO;
        var quotedCount = 0;
        var partialCount = 0;

        for (var item : items) {
            var disabled = disabledKeys.contains(item.key());
            var factor = factors.get(item.key());
            var demandUnit = item.unitKind();

            BigDecimal qtyBase = null;
            String basis = null;
            BigDecimal wasteRate = BigDecimal.ZERO;
            if (!disabled && factor != null) {
                var base = switch (factor.basis()) {
                    case "BUILDING_AREA" -> area;
                    case "WALL_AREA" -> wallArea;
                    default -> interiorArea;
                };
                qtyBase = base.multiply(factor.perSqm()).setScale(2, RoundingMode.HALF_UP);
                wasteRate = factor.wasteRate();
                basis = factor.basis();
            }

            BigDecimal qtyLow = null;
            BigDecimal qtyHigh = null;
            boolean appliedMinQty = false;
            String appliedMinQtyRule = null;
            if (qtyBase != null) {
                qtyLow = money(qtyBase.multiply(QUANTITY_LOW_FACTOR));
                qtyHigh = money(qtyBase.multiply(QUANTITY_HIGH_FACTOR));
                var rule = minQtyRules.get(item.key() + ":" + demandUnit);
                if (rule != null && "PER_HOUSE".equals(rule.scope()) && qtyHigh.compareTo(rule.minQty()) < 0) {
                    // 按户兜底（如水电不足 85㎡ 按 85㎡）：数量低于阈值就抬到阈值。
                    qtyLow = rule.minQty();
                    qtyHigh = rule.minQty();
                    appliedMinQty = true;
                    appliedMinQtyRule = rule.note();
                }
                if (isCountUnit(demandUnit)) {
                    qtyLow = roundUp(qtyLow);
                    qtyHigh = roundUp(qtyHigh);
                }
            }

            var materialQuotes = disabled || qtyBase == null
                    ? List.<Quote>of()
                    : findQuotes("MATERIAL", item.key(), categoriesByItem, demandUnit, request.region());
            var laborQuotes = disabled || qtyBase == null
                    ? List.<Quote>of()
                    : findQuotes("LABOR", item.key(), categoriesByItem, demandUnit, request.region());

            var materialCostLow = BigDecimal.ZERO;
            var materialCostHigh = BigDecimal.ZERO;
            var laborCostLow = BigDecimal.ZERO;
            var laborCostHigh = BigDecimal.ZERO;
            BigDecimal materialPriceLow = null;
            BigDecimal materialPriceHigh = null;
            BigDecimal laborPriceLow = null;
            BigDecimal laborPriceHigh = null;
            String materialSource = "NONE";
            String laborSource = "NONE";
            String source;
            var skipped = new ArrayList<String>();
            List<QuoteSample> samples = List.of();

            if (disabled || qtyBase == null) {
                source = "DISABLED";
                if (disabled) skipped.add("用户已关闭该板块");
                if (!disabled && factor == null) skipped.add("该板块暂无工程量系数，未参与计算");
            } else {
                var band = referenceBand(item.key(), finishLevel);
                if (band == null) {
                    source = "DISABLED";
                    skipped.add("该板块没有配置基准区间，未参与计算");
                } else {
                    // 基准总额（元/㎡ × 计价面积）先算出来，材料/人工按占比拆分。
                    // 这条路径是「无报价时的守恒基准」：9 板块合计必须严格等于区间 × 建筑面积，
                    // 所以只能做「总额 → 按占比拆一次」，不能再拿单价乘回去，否则每板块多一次取整就破坏守恒。
                    var billableArea = area;
                    var houseRule = minQtyRules.get(item.key() + ":" + item.unitKind());
                    if (houseRule != null && "PER_HOUSE".equals(houseRule.scope())
                            && area.compareTo(houseRule.minQty()) < 0) {
                        billableArea = houseRule.minQty();
                        appliedMinQty = true;
                        appliedMinQtyRule = houseRule.note();
                    }
                    var totalLow = money(band.low().multiply(billableArea));
                    var totalHigh = money(band.high().multiply(billableArea));
                    var ratio = item.materialRatio();
                    var refMaterialCostLow = money(totalLow.multiply(ratio));
                    var refMaterialCostHigh = money(totalHigh.multiply(ratio));
                    var refLaborCostLow = totalLow.subtract(refMaterialCostLow);
                    var refLaborCostHigh = totalHigh.subtract(refMaterialCostHigh);

                    // 材料与人工各自独立判定：某一路达标就用真实报价，另一路照常走基准。
                    // 绝不能让「人工没报价」把「材料有报价」一起拖回基准——那样用户永远看不出材料花在哪。
                    var materialQuoted = distinctCompanies(materialQuotes) >= MIN_COMPANY_COUNT;
                    var laborQuoted = distinctCompanies(laborQuotes) >= MIN_COMPANY_COUNT;
                    var waste = wasteRate.add(BigDecimal.ONE);

                    if (materialQuoted) {
                        var materialBand = priceBand(materialQuotes);
                        materialPriceLow = materialBand.low();
                        materialPriceHigh = materialBand.high();
                        materialCostLow = money(qtyLow.multiply(materialBand.low()).multiply(waste));
                        materialCostHigh = money(qtyHigh.multiply(materialBand.high()).multiply(waste));
                        materialSource = "QUOTED";
                        samples = new ArrayList<>(mergeSamples(materialQuotes, List.of()));
                    } else {
                        materialCostLow = refMaterialCostLow;
                        materialCostHigh = refMaterialCostHigh;
                        materialPriceLow = unitPrice(materialCostLow, qtyLow, waste);
                        materialPriceHigh = unitPrice(materialCostHigh, qtyHigh, waste);
                        materialSource = "REFERENCE";
                    }

                    if (laborQuoted) {
                        var laborBand = priceBand(laborQuotes);
                        laborPriceLow = laborBand.low();
                        laborPriceHigh = laborBand.high();
                        laborCostLow = money(qtyLow.multiply(laborBand.low()).multiply(waste));
                        laborCostHigh = money(qtyHigh.multiply(laborBand.high()).multiply(waste));
                        laborSource = "QUOTED";
                        samples = mergeSamples(materialQuoted ? materialQuotes : List.of(), laborQuotes);
                    } else {
                        laborCostLow = refLaborCostLow;
                        laborCostHigh = refLaborCostHigh;
                        laborPriceLow = unitPrice(laborCostLow, qtyLow, waste);
                        laborPriceHigh = unitPrice(laborCostHigh, qtyHigh, waste);
                        laborSource = "REFERENCE";
                    }

                    if (materialQuoted && laborQuoted) {
                        source = "QUOTED";
                        quotedCount++;
                    } else if (materialQuoted || laborQuoted) {
                        source = "PARTIAL";
                        partialCount++;
                        skipped.add((materialQuoted ? "人工" : "材料") + "一路报价不足 "
                                + MIN_COMPANY_COUNT + " 家企业，该路按行业基准占比估算；"
                                + (materialQuoted ? "材料" : "人工") + "一路采用真实报价");
                    } else {
                        source = "REFERENCE";
                        if (!materialQuotes.isEmpty() || !laborQuotes.isEmpty()) {
                            skipped.add("同板块最多仅 " + Math.max(distinctCompanies(materialQuotes),
                                    distinctCompanies(laborQuotes)) + " 家企业报价，低于 " + MIN_COMPANY_COUNT
                                    + " 家门槛，按行业基准估算");
                        } else {
                            skipped.add("暂无企业报价，按行业基准估算");
                        }
                    }
                }
            }

            materialLow = materialLow.add(materialCostLow);
            materialHigh = materialHigh.add(materialCostHigh);
            laborLow = laborLow.add(laborCostLow);
            laborHigh = laborHigh.add(laborCostHigh);

            resultItems.add(new BudgetItem(item.key(), item.label(), demandUnit, basis,
                    qtyBase, appliedMinQty, appliedMinQtyRule, wasteRate,
                    disabled, materialCostLow, materialCostHigh, laborCostLow, laborCostHigh,
                    materialPriceLow, materialPriceHigh, laborPriceLow, laborPriceHigh,
                    materialCostLow.add(laborCostLow), materialCostHigh.add(laborCostHigh),
                    source, materialSource, laborSource, skipped, samples));
        }

        var totalLow = money(materialLow.add(laborLow));
        var totalHigh = money(materialHigh.add(laborHigh));

        // 只有「材料与人工两路都用真实报价」的板块才算完全 QUOTED；
        // 只要有一路是真报价，整体就至少是 PARTIAL，不能退化成 REFERENCE。
        var dataQuality = quotedCount >= items.size() ? "QUOTED"
                : (quotedCount > 0 || partialCount > 0) ? "PARTIAL" : "REFERENCE";

        var target = request.targetBudget();
        String overBudgetStatus = null;
        if (target != null && target.signum() > 0) {
            overBudgetStatus = target.compareTo(totalLow) < 0 ? "OVER"
                    : target.compareTo(totalHigh) > 0 ? "UNDER" : "WITHIN";
        }

        if (quotedCount > 0 && quotedCount < items.size()) {
            warnings.add("仅 " + quotedCount + " 个板块达到 " + MIN_COMPANY_COUNT
                    + " 家企业门槛并同时采用真实材料价与人工价，其余板块至少有一路按行业基准估算");
        }
        if (partialCount > 0) {
            warnings.add(partialCount + " 个板块只有材料或只有人工的真实报价，另一路按行业基准占比估算");
        }

        return new EstimateResult(totalLow, totalHigh, target, overBudgetStatus, dataQuality,
                "LIST", MODEL_VERSION, interiorArea, wallArea,
                materialLow, materialHigh, laborLow, laborHigh,
                null, List.of(), List.of(),
                resultItems, warnings, Instant.now());
    }

    /**
     * 套餐式计价（阶段 2a-4）。
     *
     * <pre>
     *   实测框架面积 = 建筑面积 × 0.78 + 外墙 0.24m × 周长估算
     *   计价面积     = max(实测框架面积, 套餐最低计价面积)
     *   套餐价       = 套餐单价(元/㎡) × 计价面积
     *   合同总造价   = 套餐价 + 增项
     * </pre>
     *
     * <p>管理费（10%）属于阶段 2a-5，这里不加。
     *
     * <p>「两种模式不能混加」是本阶段最容易错的地方：套餐价已经含了地面、墙面、水电等，
     * 再叠一遍分项清单总额会直接翻倍。所以套餐模式**不返回** 9 板块清单，
     * 只返回套餐价 + 用户显式点名的增项。增项只认 {@code enabledItems}：
     * 没被点名的一律视为套餐已覆盖（含 STRUCTURE 这种默认不参与的）。
     */
    private EstimateResult estimateByPackage(EstimateRequest request) {
        var product = loadPackage(request.packageId());
        var area = request.area();

        // 得房率与 LIST 模式共用同一常量，两种模式的面积口径必须能互相解释。
        var interiorArea = area.multiply(INTERIOR_RATIO).setScale(2, RoundingMode.HALF_UP);
        // 周长 ≈ √建筑面积 × 系数：户型越方正周长越短，没有户型图时这是最省参数的估法。
        var perimeter = BigDecimal.valueOf(Math.sqrt(area.doubleValue()))
                .multiply(PERIMETER_FACTOR).setScale(2, RoundingMode.HALF_UP);
        var measuredArea = interiorArea
                .add(EXTERIOR_WALL_THICKNESS.multiply(perimeter))
                .setScale(2, RoundingMode.HALF_UP);
        var minArea = product.minArea() == null ? DEFAULT_PACKAGE_MIN_AREA : product.minArea();
        var minAreaApplied = measuredArea.compareTo(minArea) < 0;
        var billableArea = minAreaApplied ? minArea : measuredArea;

        // 套餐价是确定值，不是区间：low 与 high 相等（模板 G49 = 单价 × 面积）。
        var baseCost = money(product.pricePerSqm().multiply(billableArea));
        var ratio = product.materialRatio();
        var baseMaterial = money(baseCost.multiply(ratio));
        var baseLabor = baseCost.subtract(baseMaterial);

        var packageKeys = product.items().stream().map(PackageItem::itemKey).toList();
        var enabledKeys = new LinkedHashSet<>(nullSafe(request.enabledItems()));
        var addonKeys = enabledKeys.stream().filter(key -> !packageKeys.contains(key)).toList();
        var addons = List.<BudgetItem>of();
        var warnings = new ArrayList<String>();
        if (!addonKeys.isEmpty()) {
            // 复用 LIST 路径算增项，而不是另写一套：增项与分项的口径必须完全一致，
            // 否则「套餐 + 增项」和纯 LIST 在同样的增项上会给出两个数。
            var disabled = loadItems().stream().map(ItemDef::key)
                    .filter(key -> !addonKeys.contains(key)).toList();
            var addonRequest = new EstimateRequest(area, request.region(), request.finishLevel(),
                    request.spaceType(), "LIST", null, request.projectId(), disabled, addonKeys, null);
            addons = estimateByList(addonRequest).items().stream().filter(item -> !item.disabled()).toList();
            warnings.add("套餐外另有 " + addons.size() + " 项增项单独计价，套餐价不包含这部分");
        }
        var addonMaterialLow = addons.stream().map(BudgetItem::materialCostLow)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        var addonMaterialHigh = addons.stream().map(BudgetItem::materialCostHigh)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        var addonLaborLow = addons.stream().map(BudgetItem::laborCostLow)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        var addonLaborHigh = addons.stream().map(BudgetItem::laborCostHigh)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        var addonLow = money(addonMaterialLow.add(addonLaborLow));
        var addonHigh = money(addonMaterialHigh.add(addonLaborHigh));

        var totalLow = money(baseCost.add(addonLow));
        var totalHigh = money(baseCost.add(addonHigh));
        var materialLow = money(baseMaterial.add(addonMaterialLow));
        var materialHigh = money(baseMaterial.add(addonMaterialHigh));
        var laborLow = money(baseLabor.add(addonLaborLow));
        var laborHigh = money(baseLabor.add(addonLaborHigh));

        if (minAreaApplied) {
            warnings.add("面积 " + measuredArea.stripTrailingZeros().toPlainString()
                    + " ㎡ 低于套餐最低计价面积 " + minArea.stripTrailingZeros().toPlainString()
                    + " ㎡，按最低面积计价");
        }
        if (product.companyId() == null) {
            warnings.add("当前使用平台通用套餐价，与企业实际套餐价可能存在差异");
        }

        var target = request.targetBudget();
        String overBudgetStatus = null;
        if (target != null && target.signum() > 0) {
            overBudgetStatus = target.compareTo(totalLow) < 0 ? "OVER"
                    : target.compareTo(totalHigh) > 0 ? "UNDER" : "WITHIN";
        }

        var info = new PackageProductInfo(product.id(), product.name(), product.companyName(),
                product.pricePerSqm(), minArea, perimeter, measuredArea, billableArea,
                minAreaApplied, baseCost, baseCost);

        return new EstimateResult(totalLow, totalHigh, target, overBudgetStatus, "PACKAGE",
                "PACKAGE", MODEL_VERSION, interiorArea, interiorArea.multiply(WALL_RATIO)
                .setScale(2, RoundingMode.HALF_UP),
                materialLow, materialHigh, laborLow, laborHigh,
                info, product.items(), addons, List.of(), warnings, Instant.now());
    }

    /** 已生效的套餐定义（来自 package_products）。 */
    record PackageRow(UUID id, UUID companyId, String companyName, String name,
                      BigDecimal pricePerSqm, BigDecimal minArea, BigDecimal materialRatio,
                      List<PackageItem> items) {
    }

    /**
     * 取套餐：显式 packageId 用指定套餐；否则用平台通用套餐（company_id 为空）。
     *
     * <p>下架或过期的套餐不参与——否则用户会拿一个再也买不到的价格去做预算。
     */
    private PackageRow loadPackage(UUID packageId) {
        var sql = """
                select p.id, p.company_id, p.name, p.price_per_sqm, p.min_area, p.material_ratio,
                       p.items_json, coalesce(pr.name, c.name) as company_name
                from package_products p
                left join company_profiles pr on pr.company_id = p.company_id
                left join auth_companies c on c.id = p.company_id
                where p.status = 'ACTIVE' and p.valid_until >= current_date
                """;
        var args = new ArrayList<Object>();
        if (packageId != null) {
            sql += " and p.id = ?";
            args.add(packageId);
        } else {
            // 平台通用套餐：没有企业套餐时也能出价，否则刚上线的地区用不了套餐模式。
            sql += " and p.company_id is null";
        }
        sql += " order by p.price_per_sqm asc limit 1";
        var rows = jdbc.query(sql, (rs, n) -> new PackageRow(
                rs.getObject("id", UUID.class),
                rs.getObject("company_id", UUID.class),
                rs.getString("company_name"),
                rs.getString("name"),
                rs.getBigDecimal("price_per_sqm"),
                rs.getBigDecimal("min_area"),
                rs.getBigDecimal("material_ratio"),
                parsePackageItems(rs.getString("items_json"))), args.toArray());
        if (rows.isEmpty()) {
            throw new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND",
                    packageId == null ? "暂无可用的套餐报价" : "套餐不存在或已下架");
        }
        return rows.getFirst();
    }

    /** items_json 是 {@code [{"itemKey":"GROUND","label":"..."}]}；坏数据不能拖垮整次试算。 */
    private List<PackageItem> parsePackageItems(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            List<Map<String, Object>> raw = objectMapper.readValue(json, new TypeReference<>() {
            });
            var items = new ArrayList<PackageItem>();
            for (var row : raw) {
                var key = row.get("itemKey");
                var label = row.get("label");
                if (key == null) continue;
                items.add(new PackageItem(key.toString(), label == null ? key.toString() : label.toString()));
            }
            return items;
        } catch (Exception exception) {
            return List.of();
        }
    }

    private List<ItemDef> loadItems() {
        return jdbc.query("""
                select item_key, label, unit_kind, sort_order, default_on, material_ratio
                from budget_items order by sort_order
                """, (rs, n) -> new ItemDef(rs.getString("item_key"), rs.getString("label"),
                rs.getString("unit_kind"), rs.getInt("sort_order"),
                rs.getBoolean("default_on"), rs.getBigDecimal("material_ratio")));
    }

    private Map<String, Factor> loadFactors(String spaceType) {
        var map = new HashMap<String, Factor>();
        // 必须用 ResultSetExtractor + 显式循环：Spring 6 没有 query(String, RowCallbackHandler, Object...)，
        // 单参数 lambda 会被当成 ResultSetExtractor，rs 是单行游标而已，不循环会只读到第一行。
        jdbc.query("""
                select item_key, basis, per_sqm, waste_rate from workload_factors
                where space_type in (?, 'WHOLE_HOME')
                order by case when space_type = ? then 0 else 1 end
                """, (org.springframework.jdbc.core.ResultSetExtractor<Void>) rs -> {
            while (rs.next()) {
                map.putIfAbsent(rs.getString("item_key"), new Factor(rs.getString("basis"),
                        rs.getBigDecimal("per_sqm"), rs.getBigDecimal("waste_rate")));
            }
            return null;
        }, spaceType, spaceType);
        return map;
    }

    private Map<String, MinQty> loadMinQtyRules() {
        var map = new HashMap<String, MinQty>();
        jdbc.query("select item_key, unit_kind, min_qty, scope, note from budget_min_qty",
                (org.springframework.jdbc.core.ResultSetExtractor<Void>) rs -> {
            while (rs.next()) {
                map.put(rs.getString("item_key") + ":" + rs.getString("unit_kind"),
                        new MinQty(rs.getBigDecimal("min_qty"), rs.getString("scope"), rs.getString("note")));
            }
            return null;
        });
        return map;
    }

    private Map<String, List<String>> loadCategories() {
        var map = new HashMap<String, List<String>>();
        jdbc.query("select item_key, source, category from budget_item_categories order by priority",
                (org.springframework.jdbc.core.ResultSetExtractor<Void>) rs -> {
            while (rs.next()) {
                var key = rs.getString("source") + ":" + rs.getString("item_key");
                map.computeIfAbsent(key, k -> new ArrayList<>()).add(rs.getString("category"));
            }
            return null;
        });
        return map;
    }

    private Band referenceBand(String itemKey, String finishLevel) {
        var rows = jdbc.query("""
                select low_per_sqm, high_per_sqm from budget_reference_bands
                where item_key = ? and finish_level = ?
                """, (rs, n) -> new Band(rs.getBigDecimal("low_per_sqm"), rs.getBigDecimal("high_per_sqm")),
                itemKey, finishLevel);
        if (!rows.isEmpty()) return rows.getFirst();
        return jdbc.query("""
                select low_per_sqm, high_per_sqm from budget_reference_bands
                where item_key = ? and finish_level = 'BASIC'
                """, (rs, n) -> new Band(rs.getBigDecimal("low_per_sqm"), rs.getBigDecimal("high_per_sqm")),
                itemKey).stream().findFirst().orElse(null);
    }

    /**
     * 匹配板块对应的报价。
     *
     * <p>过滤顺序（任何一步不满足即剔除）：
     * 类目映射命中 → 企业认证 APPROVED → 未下架 → 单位可识别 →
     * 计价项（GIFT / OWNER_SUPPLIED 不参与）→ 有效期内 → 期望单位一致。
     */
    List<Quote> findQuotes(String source, String itemKey,
                           Map<String, List<String>> categoriesByItem,
                           String demandUnit, String region) {
        var categories = categoriesByItem.getOrDefault(source + ":" + itemKey, List.of());
        if (categories.isEmpty()) return List.of();

        var isLabor = "LABOR".equals(source);
        var table = isLabor ? "labor_quotes" : "material_quotes";
        // 匹配列必须是 budget_item_categories.category 对应的那一列：
        // 材料是 material_quotes.category（不是 name，name 是具体型号名如「强化复合地板 A 型」），
        // 人工是 labor_quotes.labor_type。用错列会让所有报价都匹配不上，预算永远停在 REFERENCE。
        var matchCol = isLabor ? "labor_type" : "category";
        var placeholders = String.join(",", java.util.Collections.nCopies(categories.size(), "?"));

        var sql = """
                select q.id, q.%s as item_name, q.price, q.unit, q.unit_kind,
                       coalesce(p.name, c.name) as company_name
                from %s q
                join company_certifications cert on cert.company_id = q.company_id and cert.status = 'APPROVED'
                left join company_profiles p on p.company_id = q.company_id
                left join auth_companies c on c.id = q.company_id
                where q.admin_hidden = false
                  and q.unit_unknown = false
                  and q.item_nature = 'INCLUDED'
                  and q.valid_until >= current_date
                  and q.%s in (%s)
                """.formatted(matchCol, table, matchCol, placeholders);

        var args = new ArrayList<Object>();
        args.addAll(categories);
        if (region != null && !region.isBlank()) {
            sql += " and q.region = ?";
            args.add(region.trim());
        }

        var quotes = jdbc.query(sql, (rs, n) -> new Quote(rs.getObject("id", UUID.class),
                rs.getString("item_name"), rs.getBigDecimal("price"), rs.getString("unit"),
                rs.getString("unit_kind"), rs.getString("company_name"), isLabor), args.toArray());

        // 期望单位与报价计价单位不一致的报价不能参与（台面按 ㎡ 报、按延米算会错）。
        return quotes.stream().filter(q -> demandUnit.equals(q.unitKind())).toList();
    }

    /** 门槛检查用的「企业数」，不是「报价条数」。 */
    private static int distinctCompanies(List<Quote> quotes) {
        return (int) quotes.stream().map(Quote::companyName).distinct().count();
    }

    private Band priceBand(List<Quote> quotes) {
        var prices = quotes.stream().map(Quote::price).sorted().toList();
        return new Band(percentile(prices, 0.25), percentile(prices, 0.75));
    }

    /**
     * 由成本反推单价（元/计量单位），只用于展示，不参与任何成本计算。
     *
     * <p>成本 = 数量 × 单价 × (1 + 损耗)，所以单价 = 成本 ÷ 数量 ÷ (1 + 损耗)。
     * 反向换算会带来 0.01 级的误差，展示上可以接受——成本本身才是守恒的对象。
     */
    private BigDecimal unitPrice(BigDecimal cost, BigDecimal qty, BigDecimal waste) {
        if (cost == null || qty == null || qty.signum() <= 0) return null;
        return cost.divide(qty, 4, RoundingMode.HALF_UP)
                .divide(waste, 2, RoundingMode.HALF_UP);
    }

    /** 线性插值分位数；样本少时不引统计库。 */
    static BigDecimal percentile(List<BigDecimal> sorted, double p) {
        if (sorted.isEmpty()) return null;
        if (sorted.size() == 1) return sorted.getFirst();
        double idx = p * (sorted.size() - 1);
        int lo = (int) Math.floor(idx), hi = (int) Math.ceil(idx);
        if (lo == hi) return sorted.get(lo);
        var frac = BigDecimal.valueOf(idx - lo);
        return sorted.get(lo).multiply(BigDecimal.ONE.subtract(frac))
                .add(sorted.get(hi).multiply(frac))
                .setScale(2, RoundingMode.HALF_UP);
    }

    private List<QuoteSample> mergeSamples(List<Quote> material, List<Quote> labor) {
        var samples = new ArrayList<QuoteSample>();
        for (var q : material) samples.add(new QuoteSample(q.id(), q.name(), q.price(), q.unit(), q.unitKind(), q.companyName()));
        for (var q : labor) samples.add(new QuoteSample(q.id(), q.name(), q.price(), q.unit(), q.unitKind(), q.companyName()));
        return samples;
    }

    private boolean isCountUnit(String unitKind) {
        return "PIECE".equals(unitKind) || "SET".equals(unitKind) || "HOUSE".equals(unitKind)
                || "ROOM".equals(unitKind) || "PACKAGE".equals(unitKind);
    }

    private BigDecimal roundUp(BigDecimal value) {
        return value.setScale(0, RoundingMode.CEILING);
    }

    private static BigDecimal money(BigDecimal value) {
        return value == null ? BigDecimal.ZERO.setScale(2) : value.setScale(2, RoundingMode.HALF_UP);
    }

    private static <T> List<T> nullSafe(List<T> list) {
        return list == null ? List.of() : list;
    }
}
