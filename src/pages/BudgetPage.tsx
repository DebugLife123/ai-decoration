import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import { fallbackStyleProfiles, recommendStyles, type StyleRecommendationProfile } from '../services/styleRecommendation';
import { loadPlatformStyleProfiles } from '../services/styleProfileSource';
import { styleCatalogByKey } from '../services/styleCatalog';
import { estimateBudget, type BudgetItem, type BudgetPackageProduct, type EstimateResult } from '../services/budgetApi';
import './BudgetPage.css';

type FinishLevel = 'basic' | 'standard' | 'premium';

const finishLevels: { id: FinishLevel; label: string; factor: number; api: 'BASIC' | 'STANDARD' | 'PREMIUM' }[] = [
  { id: 'basic', label: '基础', factor: 0.82, api: 'BASIC' },
  { id: 'standard', label: '舒适', factor: 1, api: 'STANDARD' },
  { id: 'premium', label: '品质', factor: 1.34, api: 'PREMIUM' },
];

/**
 * 本地兜底用的 6 项参考区间。
 *
 * 2a-2 之后后端会返回 9 板块的更细拆分；这里保留一份，用于后端不可用时兜底，
 * 保证预算页在离线状态下依旧可用（约数与后端 budget_reference_bands 同源）。
 */
const referenceCosts = [
  { label: '拆改与水电', low: 320, high: 520 },
  { label: '泥瓦与防水', low: 280, high: 450 },
  { label: '墙顶面与涂装', low: 180, high: 320 },
  { label: '地板、瓷砖等主材', low: 450, high: 780 },
  { label: '厨卫与定制收纳', low: 380, high: 720 },
  { label: '安装、辅料与管理', low: 180, high: 320 },
];

const dataQualityText: Record<EstimateResult['dataQuality'], string> = {
  QUOTED: '基于多家企业的现行报价测算，可按明细查看报价来源。',
  PARTIAL: '部分板块基于企业报价，其余按行业基准估算。',
  REFERENCE: '行业参考区间，当前地区暂无可比企业报价。',
  PACKAGE: '按套餐单价 × 实测框架面积计算，套餐外的项目单独计为增项。',
};

function formatMoney(value: number) {
  return (value / 10000).toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** 单价是元/㎡，不能按「万元」缩写，否则 1180 元/㎡ 会显示成 0.1 万。 */
function formatYuan(value: number) {
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

type PricingMode = 'list' | 'package';

const pricingModes: { id: PricingMode; label: string; hint: string }[] = [
  { id: 'list', label: '分项计价', hint: '按地面、墙面、水电等板块逐项累加' },
  { id: 'package', label: '套餐计价', hint: '按套餐单价 × 实测框架面积，套餐外另计增项' },
];

export default function BudgetPage() {
  const projects = useAppStore((state) => state.projects);
  const [projectId, setProjectId] = useState('');
  const [areaInput, setAreaInput] = useState('');
  const [region, setRegion] = useState('');
  const [budgetInput, setBudgetInput] = useState('');
  const [finishLevel, setFinishLevel] = useState<FinishLevel>('standard');
  const [pricingMode, setPricingMode] = useState<PricingMode>('list');
  const [platformProfiles, setPlatformProfiles] = useState<StyleRecommendationProfile[] | null>(null);
  const [remoteEstimate, setRemoteEstimate] = useState<EstimateResult | null>(null);
  /** 套餐模式下后端没给结果（服务不可用 / 没有可用套餐），用来区分「正在算」和「算不出来」。 */
  const [packageFailure, setPackageFailure] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadPlatformStyleProfiles()
      .then((profiles) => { if (!cancelled) setPlatformProfiles(profiles); })
      .catch(() => { /* 回退到内置风格资料 */ });
    return () => { cancelled = true; };
  }, []);

  const selectedProject = projects.find((project) => project.id === projectId);
  const area = Number(areaInput);
  const targetBudget = Number(budgetInput) * 10000;
  const currentLevel = finishLevels.find((item) => item.id === finishLevel)!;

  /** 本地兜底估算：后端不可用时使用，口径与旧版完全一致。 */
  const localEstimate = useMemo(() => {
    if (!Number.isFinite(area) || area <= 0 || area > 2000) return null;
    const breakdown = referenceCosts.map((item) => ({
      ...item,
      low: Math.round(item.low * currentLevel.factor * area / 1000) * 1000,
      high: Math.round(item.high * currentLevel.factor * area / 1000) * 1000,
    }));
    return {
      breakdown,
      low: breakdown.reduce((total, item) => total + item.low, 0),
      high: breakdown.reduce((total, item) => total + item.high, 0),
    };
  }, [area, currentLevel.factor]);

  // 后端试算：面积 / 地区 / 档位 / 计价方式变化时防抖重算。
  // 分项模式失败静默回退本地口径；套餐模式没有可用的本地口径，失败要显式提示（见 packageFailure）。
  useEffect(() => {
    if (!Number.isFinite(area) || area <= 0 || area > 2000) {
      setRemoteEstimate(null);
      setPackageFailure(false);
      return;
    }
    let cancelled = false;
    setPackageFailure(false);
    const timer = window.setTimeout(() => {
      estimateBudget({
        area,
        region: region.trim() || undefined,
        finishLevel: currentLevel.api,
        pricingMode: pricingMode === 'package' ? 'PACKAGE' : 'LIST',
        projectId: projectId || null,
        targetBudget: targetBudget > 0 ? targetBudget : null,
      })
        .then((result) => {
          if (cancelled) return;
          setRemoteEstimate(result);
          setPackageFailure(!result && pricingMode === 'package');
        })
        .catch(() => {
          if (cancelled) return;
          setRemoteEstimate(null);
          setPackageFailure(pricingMode === 'package');
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [area, currentLevel.api, pricingMode, projectId, region, targetBudget]);

  const selectProject = (id: string) => {
    setProjectId(id);
    const project = projects.find((item) => item.id === id);
    if (!project) return;
    setAreaInput(project.area?.toString() || '');
    setRegion(project.region || project.city || '');
    setBudgetInput(project.budget?.toString() || '');
  };

  const budgetStatus = remoteEstimate?.overBudgetStatus
    ? remoteEstimate.overBudgetStatus === 'OVER' ? 'low'
      : remoteEstimate.overBudgetStatus === 'UNDER' ? 'high' : 'within'
    : estimate0(localEstimate, targetBudget);
  const recommendationBudget = Number.isFinite(Number(budgetInput)) && Number(budgetInput) > 0 ? Number(budgetInput) : null;

  // 企业资料优先，但不足 3 条时用内置风格补齐：
  // 消费者不该因为某家企业只录了 1 条资料，就只看到 1 个可选方向。
  const displayStyleProfiles = useMemo(() => {
    if (!recommendationBudget) return [];
    const platform = recommendStyles({ budgetWan: recommendationBudget, area, region }, platformProfiles ?? fallbackStyleProfiles);
    if (!platformProfiles) return platform;
    const usedStyles = new Set(platform.map((item) => item.style));
    const supplements = recommendStyles({ budgetWan: recommendationBudget, area, region }, fallbackStyleProfiles)
      .filter((item) => !usedStyles.has(item.style));
    return [...platform, ...supplements].slice(0, 3);
  }, [area, platformProfiles, recommendationBudget, region]);

  /**
   * 展示口径：套餐模式只认后端返回的套餐结果；分项模式远端 9 板块优先、本地 6 项兜底。
   *
   * 套餐价不能本地兜底：本地那套 referenceCosts 是分项口径，套在套餐上会给出明显错误的数字，
   * 所以套餐模式在后端不可用时宁可提示不可用，也不编一个数出来。
   * 同理，两种模式的数字也不能相加——套餐价已经含了分项清单里的那些板块。
   */
  const packageEstimate = remoteEstimate?.pricingMode === 'PACKAGE' ? remoteEstimate : null;
  const packageUnavailable = pricingMode === 'package' && packageFailure;
  const display = packageEstimate
    ? { low: packageEstimate.totalLow, high: packageEstimate.totalHigh, items: null }
    : remoteEstimate
      ? { low: remoteEstimate.totalLow, high: remoteEstimate.totalHigh, items: remoteEstimate.items }
      : pricingMode === 'package'
        ? null
        : localEstimate ? { low: localEstimate.low, high: localEstimate.high, items: null } : null;

  return <main className="budget-page">
    <header className="budget-header">
      <div><span className="budget-eyebrow">EARLY PLANNING</span><h1>装修预算试算</h1><p>按面积和装修档位生成一份前期参考范围。</p></div>
      <Link to="/projects">我的项目</Link>
    </header>

    <div className="budget-layout">
      <section className="budget-inputs" aria-label="试算条件">
        <label className="budget-field">
          <span>关联项目</span>
          <select value={projectId} onChange={(event) => selectProject(event.target.value)} disabled={!projects.length}>
            <option value="">不关联项目</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        <div className="budget-fields-row">
          <label className="budget-field"><span>装修面积</span><div className="budget-input"><input type="number" min="1" max="2000" step="0.1" value={areaInput} onChange={(event) => setAreaInput(event.target.value)} placeholder="例如 100" /><b>㎡</b></div></label>
          <label className="budget-field"><span>所在地区</span><input value={region} onChange={(event) => setRegion(event.target.value)} maxLength={80} placeholder="例如：上海" /></label>
        </div>
        <fieldset className="finish-picker">
          <legend>装修档位</legend>
          <div>{finishLevels.map((level) => <button type="button" key={level.id} className={finishLevel === level.id ? 'selected' : ''} aria-pressed={finishLevel === level.id} onClick={() => setFinishLevel(level.id)}>{level.label}</button>)}</div>
        </fieldset>
        <fieldset className="pricing-mode-picker">
          <legend>计价方式</legend>
          <div>{pricingModes.map((mode) => <button type="button" key={mode.id} className={pricingMode === mode.id ? 'selected' : ''} aria-pressed={pricingMode === mode.id} title={mode.hint} onClick={() => setPricingMode(mode.id)}>{mode.label}</button>)}</div>
          <p className="pricing-mode-hint">{pricingModes.find((mode) => mode.id === pricingMode)?.hint}</p>
        </fieldset>
        <label className="budget-field"><span>计划总预算 <small>可选</small></span><div className="budget-input"><input type="number" min="0" step="0.1" value={budgetInput} onChange={(event) => setBudgetInput(event.target.value)} placeholder="填写后可对照估算范围" /><b>万元</b></div></label>
        {selectedProject && <p className="project-budget-note">数据来自项目“{selectedProject.name}”，可在此临时调整，不会覆盖项目资料。</p>}
      </section>

      <section className="budget-result" aria-live="polite">
        {!display ? <div className="budget-prompt">
          {packageUnavailable
            ? <><strong>套餐报价暂时取不到</strong><span>套餐价需要从后端读取，无法本地估算。可切换到分项计价查看区间，或稍后再试。</span></>
            : <><strong>填写面积开始试算</strong><span>请输入 0 至 2000 ㎡之间的装修面积。</span></>}
        </div> : <>
          <div className="estimate-heading"><div><span>{packageEstimate ? '套餐总价' : '参考总价区间'}</span><strong>¥{formatMoney(display.low)}<small>万</small>{display.low !== display.high && <><i> - </i>¥{formatMoney(display.high)}<small>万</small></>}</strong></div><span className="estimate-area">{area.toLocaleString('zh-CN')} ㎡{region.trim() ? ` · ${region.trim()}` : ''}</span></div>
          {packageEstimate?.packageProduct && <PackageSummary product={packageEstimate.packageProduct} />}
          {budgetStatus && <p className={`budget-comparison ${budgetStatus}`}>
            {budgetStatus === 'within' ? '计划预算落在当前参考区间内。' : budgetStatus === 'low' ? '计划预算低于当前参考区间，可调整面积或装修档位。' : '计划预算高于当前参考区间，可预留部分用于家具、家电或软装。'}
          </p>}
          <div className="style-recommendations">
            <div className="style-recommendations-heading"><div><h2>按预算推荐风格</h2><p>{recommendationBudget ? `根据 ${recommendationBudget} 万元计划预算，优先考虑这些方向。` : '填写计划总预算后，可查看更匹配的风格方向。'}</p></div>{recommendationBudget && <span>{recommendationBudget < 10 ? '预算较紧' : recommendationBudget < 25 ? '舒适区间' : '品质空间'}</span>}</div>
            {recommendationBudget ? <div className="style-recommendation-list">{displayStyleProfiles.map((style, index) => {
              // 工作台通过 query 参数接收风格与提示词（它只读 useSearchParams），
              // 所以这里必须落到 URL 上，不能用 state —— 否则点击后风格不会切换。
              const styleName = styleCatalogByKey.get(style.style)?.name ?? style.name;
              const workspaceParams = new URLSearchParams({ style: style.style, prompt: `预算约 ${recommendationBudget} 万元，倾向${styleName}风格。` });
              if (area > 0) workspaceParams.set('area', String(area));
              if (region.trim()) workspaceParams.set('region', region.trim());
              workspaceParams.set('budget', String(recommendationBudget));
              return <article className={`style-recommendation ${index === 0 ? 'primary' : ''}`} key={`${style.style}-${style.companyName ?? 'platform'}`}><div className="style-recommendation-copy"><div><strong>{styleName}</strong>{index === 0 && <em>{style.companyName ? '企业优先' : '优先推荐'}</em>}{style.companyName && <i className="style-recommendation-source">合作企业 · {style.companyName}</i>}</div><span>{style.note}</span><p>{style.reason}</p></div><Link to={`/workspace?${workspaceParams.toString()}`}>采用此风格</Link></article>;
            })}</div> : <div className="style-recommendation-empty">先填写预算金额，再查看风格建议。</div>}
          </div>
          <div className="estimate-breakdown">
            <h2>{packageEstimate ? '套餐与增项' : '分项参考'}</h2>
            {packageEstimate
              ? <PackageBreakdown estimate={packageEstimate} />
              : renderBreakdown(display.items, localEstimate?.breakdown)}
          </div>
          <p className="estimate-disclaimer">
            {remoteEstimate ? dataQualityText[remoteEstimate.dataQuality] : '以上为演示用样例估算，不是企业报价或市场实时报价。'}
            {' '}地区、房屋状况、施工范围和选材会造成较大差异；不含家具家电、软装及可能产生的结构加固费用。
          </p>
        </>}
      </section>
    </div>
  </main>;
}

function estimate0(localEstimate: { low: number; high: number } | null, targetBudget: number) {
  return localEstimate && targetBudget > 0
    ? targetBudget < localEstimate.low ? 'low' : targetBudget > localEstimate.high ? 'high' : 'within'
    : null;
}

/**
 * 套餐口径的计价过程。
 *
 * 用户最容易误解的是「为什么 60㎡ 和 90㎡ 报一样的价」——那是套餐的最低价兜底，
 * 所以把实测框架面积、计价面积、单价都摊开写，并把兜底这件事单独标出来。
 */
function PackageSummary({ product }: { product: BudgetPackageProduct }) {
  return <div className="package-summary">
    <div className="package-summary-head">
      <strong>{product.name}</strong>
      {product.companyName
        ? <span className="package-summary-source">合作企业 · {product.companyName}</span>
        : <span className="package-summary-source">平台通用套餐</span>}
    </div>
    <p className="package-summary-price">¥{formatYuan(product.pricePerSqm)} / ㎡ × {product.billableArea.toLocaleString('zh-CN')} ㎡</p>
    <p className="package-summary-note">
      实测框架面积 {product.measuredArea.toLocaleString('zh-CN')} ㎡（套内 + 外墙 240mm × 约 {product.perimeterEstimate.toLocaleString('zh-CN')} m）
      {product.minAreaApplied && <>，低于最低计价面积 {product.minArea.toLocaleString('zh-CN')} ㎡，按 {product.minArea.toLocaleString('zh-CN')} ㎡ 计</>}
    </p>
  </div>;
}

/** 套餐模式的两段清单：套餐已含什么、套餐外还加了什么。两者分开，绝不合并成一个总额。 */
function PackageBreakdown({ estimate }: { estimate: EstimateResult }) {
  return <>
    <div className="estimate-row">
      <span>{estimate.packageProduct?.name ?? '套餐'} 基础价
        {estimate.packageProduct?.minAreaApplied && <em className="estimate-row-flag" title={`实测框架面积不足 ${estimate.packageProduct.minArea} ㎡，按最低计价面积收取`}>按最低面积计</em>}
      </span>
      <strong>¥{formatMoney(estimate.packageProduct?.baseCostLow ?? 0)} 万</strong>
    </div>
    <p className="package-included">
      已含 {estimate.packageItems.length} 项：{estimate.packageItems.map((item) => item.label).join('、')}
    </p>
    {estimate.addonItems.length > 0 && <>
      <h3 className="package-addon-title">套餐外增项</h3>
      {estimate.addonItems.map((item) => (
        <div className="estimate-row" key={item.itemKey}>
          <span>{item.label}{item.appliedMinQty && <em className="estimate-row-flag" title={item.appliedMinQtyRule ?? ''}>按最低量计</em>}
            {item.source === 'QUOTED' && <em className="estimate-row-flag quoted">企业报价</em>}
            {item.source === 'PARTIAL' && <em className="estimate-row-flag partial">部分报价</em>}
          </span>
          <strong>¥{formatMoney(item.costLow)}{item.costLow !== item.costHigh && <> - ¥{formatMoney(item.costHigh)}</>} 万</strong>
        </div>
      ))}
    </>}
  </>;
}

/** 分项模式的 9 板块明细：显示材料/人工拆分、来源标记与最低计量提示；兜底时退回本地 6 项。 */
function renderBreakdown(items: BudgetItem[] | null, localBreakdown: { label: string; low: number; high: number }[] | undefined) {
  if (!items) {
    return (localBreakdown ?? []).map((item) => (
      <div className="estimate-row" key={item.label}><span>{item.label}</span><strong>¥{formatMoney(item.low)} - ¥{formatMoney(item.high)} 万</strong></div>
    ));
  }
  return items.map((item) => (
    <div className="estimate-row" key={item.itemKey}>
      <span>{item.label}{item.disabled && <em className="estimate-row-flag">未包含</em>}
        {item.appliedMinQty && <em className="estimate-row-flag" title={item.appliedMinQtyRule ?? ''}>按最低量计</em>}
        {item.source === 'QUOTED' && <em className="estimate-row-flag quoted">企业报价</em>}
        {item.source === 'PARTIAL' && (
          <em
            className="estimate-row-flag partial"
            title={`材料参考 ${item.materialSource === 'QUOTED' ? '企业报价' : '行业基准'}，人工参考 ${item.laborSource === 'QUOTED' ? '企业报价' : '行业基准'}`}
          >
            部分报价
          </em>
        )}
      </span>
      <strong>
        {item.disabled
          ? '—'
          : <>¥{formatMoney(item.costLow)}{item.costLow !== item.costHigh && <> - ¥{formatMoney(item.costHigh)}</>} 万
            <small className="estimate-row-split">材料 {formatMoney(item.materialCostLow)}–{formatMoney(item.materialCostHigh)} · 人工 {formatMoney(item.laborCostLow)}–{formatMoney(item.laborCostHigh)}</small>
            {(item.materialPriceLow != null || item.laborPriceLow != null) && (
              <small className="estimate-row-unit-price">
                {item.materialPriceLow != null && <>材料单价 ¥{formatYuan(item.materialPriceLow)}</>}
                {item.materialPriceLow != null && item.laborPriceLow != null && ' · '}
                {item.laborPriceLow != null && <>人工单价 ¥{formatYuan(item.laborPriceLow)}</>}
                {item.materialPriceHigh != null && item.materialPriceHigh !== item.materialPriceLow && <>–{formatYuan(item.materialPriceHigh)}</>}
                {item.laborPriceHigh != null && item.laborPriceHigh !== item.laborPriceLow && <>–{formatYuan(item.laborPriceHigh)}</>}
                {' /'} {item.unitKind}
              </small>
            )}
          </>}
      </strong>
    </div>
  ));
}
