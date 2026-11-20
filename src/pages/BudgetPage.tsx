import { estimateBudget, type EstimateResult } from '../services/budgetApi';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import { fallbackStyleProfiles, recommendStyles, type StyleRecommendationProfile } from '../services/styleRecommendation';
import { loadPlatformStyleProfiles } from '../services/styleProfileSource';
import { styleCatalogByKey } from '../services/styleCatalog';
import { loadBudgetSnapshot, saveBudgetSnapshot } from '../services/budgetSnapshot';
import { loadUserProfile } from '../services/userProfile';
import './BudgetPage.css';

type FinishLevel = 'basic' | 'standard' | 'premium';

const finishLevels: { id: FinishLevel; label: string; factor: number }[] = [
  { id: 'basic', label: '基础', factor: 0.82 },
  { id: 'standard', label: '舒适', factor: 1 },
  { id: 'premium', label: '品质', factor: 1.34 },
];

const referenceCosts = [
  { label: '拆改与水电', low: 320, high: 520 },
  { label: '泥瓦与防水', low: 280, high: 450 },
  { label: '墙顶面与涂装', low: 180, high: 320 },
  { label: '地板、瓷砖等主材', low: 450, high: 780 },
  { label: '厨卫与定制收纳', low: 380, high: 720 },
  { label: '安装、辅料与管理', low: 180, high: 320 },
];

function formatMoney(value: number) {
  return (value / 10000).toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export default function BudgetPage() {
  const authSession = useAppStore((state) => state.authSession);
  const isAuthenticated = Boolean(authSession);
  const projects = useAppStore((state) => state.projects);
  const location = useLocation();
  const navigate = useNavigate();
  const userId = authSession?.user.id || '';
  const [projectId, setProjectId] = useState('');
  // 面积与地区默认来自个人中心的「装修偏好」，免得每次重复填写。
  const savedProfile = isAuthenticated ? loadUserProfile(userId) : null;
  const [areaInput, setAreaInput] = useState(savedProfile?.defaultArea || '');
  const [region, setRegion] = useState(savedProfile?.region || '');
  const [budgetInput, setBudgetInput] = useState('');
  const [finishLevel, setFinishLevel] = useState<FinishLevel>('standard');
  const [platformProfiles, setPlatformProfiles] = useState<StyleRecommendationProfile[] | null>(null);
  const [savedAt, setSavedAt] = useState<string>(() => isAuthenticated ? loadBudgetSnapshot(userId)?.savedAt || '' : '');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadPlatformStyleProfiles()
      .then((profiles) => { if (!cancelled) setPlatformProfiles(profiles); })
      .catch(() => { /* 回退到内置风格资料 */ });
    return () => { cancelled = true; };
  }, []);
  const selectedProject = isAuthenticated ? projects.find((project) => project.id === projectId) : undefined;
  const requireLogin = () => {
    const next = `${location.pathname}${location.search}${location.hash}`;
    navigate(`/login?next=${encodeURIComponent(next)}`);
  };
  const area = Number(areaInput);
  const targetBudget = Number(budgetInput) * 10000;
  const currentLevel = finishLevels.find((item) => item.id === finishLevel)!;
  const [result, setResult] = useState<EstimateResult | null>(null);
  const [estimating, setEstimating] = useState(false);
  const fallback = useMemo(() => {
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

  const estimate = result ? {
    low: result.payableTotalLow, high: result.payableTotalHigh,
    breakdown: [
      ...result.items.filter(item => !item.disabled).map(item => ({ label: item.label, low: item.costLow, high: item.costHigh })),
      { label: '管理费', low: result.managementFeeLow, high: result.managementFeeHigh },
      { label: '税费', low: result.taxLow, high: result.taxHigh },
      { label: '远程、楼层及层高附加费', low: result.remoteFeeLow + result.floorSurchargeLow + result.highCeilingFeeLow, high: result.remoteFeeHigh + result.floorSurchargeHigh + result.highCeilingFeeHigh },
    ],
  } : fallback;
  const selectProject = (id: string) => {
    setProjectId(id);
    const project = projects.find((item) => item.id === id);
    if (!project) return;
    setAreaInput(project.area?.toString() || '');
    setRegion(project.region || project.city || '');
    setBudgetInput(project.budget?.toString() || '');
  };

  const budgetStatus = estimate && targetBudget > 0
    ? targetBudget < estimate.low ? 'low' : targetBudget > estimate.high ? 'high' : 'within'
    : null;
  const recommendationBudget = Number.isFinite(Number(budgetInput)) && Number(budgetInput) > 0 ? Number(budgetInput) : null;

  const saveSnapshot = () => {
    if (!isAuthenticated) { requireLogin(); return; }
    if (!estimate) return;
    saveBudgetSnapshot(userId, {
      area, region: region.trim(), finishLevel, finishLabel: currentLevel.label,
      budgetWan: recommendationBudget, lowWan: estimate.low / 10000, highWan: estimate.high / 10000,
      savedAt: new Date().toISOString(),
    });
    setSavedAt(new Date().toISOString());
  };

  const generateSheet = async () => {
    if (!isAuthenticated) { requireLogin(); return; }
    setEstimating(true);
    const current = await estimateBudget({ area, region: region.trim(), finishLevel: ({ basic: 'BASIC', standard: 'STANDARD', premium: 'PREMIUM' } as const)[finishLevel], pricingMode: 'LIST', targetBudget: targetBudget > 0 ? targetBudget : null });
    setResult(current);
    setEstimating(false);
    setSheetOpen(true);
    setGeneratedAt(new Date());
  };

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

  return <main className="budget-page">
    <header className="budget-header">
      <div><span className="budget-eyebrow">EARLY PLANNING</span><h1>装修预算试算</h1><p>按面积和装修档位生成一份前期参考范围。</p></div>
      {isAuthenticated ? <Link to="/projects">我的项目</Link> : <button type="button" onClick={requireLogin}>登录查看项目</button>}
    </header>

    {sheetOpen && estimate ? <article className="budget-sheet budget-sheet-page">
      <header className="sheet-head">
        <div className="sheet-title">
          <span className="sheet-tag">预算单 · EARLY BUDGET SHEET</span>
          <h2>{area.toLocaleString('zh-CN')} ㎡{region.trim() ? ` · ${region.trim()}` : ''} · {currentLevel.label}装修</h2>
          <small>生成于 {generatedAt ? `${generatedAt.getMonth() + 1}月${generatedAt.getDate()}日 ${String(generatedAt.getHours()).padStart(2, '0')}:${String(generatedAt.getMinutes()).padStart(2, '0')}` : ''} · {result ? `预算模型 ${result.modelVersion}` : '本地参考估算（预算服务未返回结果）'}</small>
        </div>
        <div className="sheet-total">
          <span>参考总价区间</span>
          <strong>¥{formatMoney(estimate.low)}<small>万</small><i> - </i>¥{formatMoney(estimate.high)}<small>万</small></strong>
        </div>
      </header>
      <div className="sheet-actions">
        <button type="button" className="budget-snapshot-save" onClick={saveSnapshot}>{isAuthenticated ? '保存快照' : '登录后保存'}</button>
        {isAuthenticated ? <Link className="sheet-workspace" to="/workspace">前往工作台 →</Link> : <button type="button" className="sheet-workspace" onClick={requireLogin}>登录后前往工作台 →</button>}
        <button type="button" className="sheet-back" onClick={() => { setSheetOpen(false); setResult(null); }}>修改试算条件</button>
        {savedAt && <span className="budget-snapshot-saved">已保存 · 工作台将显示这份预算参考</span>}
      </div>
      {budgetStatus && <p className={`budget-comparison ${budgetStatus}`}>
        {budgetStatus === 'within' ? `计划预算 ${recommendationBudget} 万元落在参考区间内。` : budgetStatus === 'low' ? `计划预算 ${recommendationBudget} 万元低于参考区间，可调整面积或装修档位。` : `计划预算 ${recommendationBudget} 万元高于参考区间，可预留部分用于家具、家电或软装。`}
      </p>}
      <div className="sheet-columns">
        <div className="sheet-section"><h3>分项参考</h3><div className="sheet-breakdown">{estimate.breakdown.map((item) => <div className="estimate-row" key={item.label}><span>{item.label}</span><strong>¥{formatMoney(item.low)} - ¥{formatMoney(item.high)} 万</strong></div>)}</div></div>
        <div className="sheet-section style-recommendations">
          <div className="style-recommendations-heading"><div><h3>按预算推荐风格</h3><p>{recommendationBudget ? `根据 ${recommendationBudget} 万元计划预算，优先考虑这些方向。` : '填写计划总预算后，可查看更匹配的风格方向。'}</p></div>{recommendationBudget && <span>{recommendationBudget < 10 ? '预算较紧' : recommendationBudget < 25 ? '舒适区间' : '品质空间'}</span>}</div>
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
      </div>
      <p className="estimate-disclaimer">以上为演示用样例估算，不是企业报价或市场实时报价。地区、房屋状况、施工范围和选材会造成较大差异；不含家具家电、软装及可能产生的结构加固费用。</p>
    </article>
    : <div className="budget-layout">
      <section inert={estimating} className="budget-inputs" aria-label="试算条件">
        <label className="budget-field">
          <span>关联项目</span>
          <select value={projectId} onChange={(event) => selectProject(event.target.value)} disabled={!isAuthenticated || !projects.length}>
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
        <label className="budget-field"><span>计划总预算 <small>可选</small></span><div className="budget-input"><input type="number" min="0" step="0.1" value={budgetInput} onChange={(event) => setBudgetInput(event.target.value)} placeholder="填写后可对照估算范围" /><b>万元</b></div></label>
        <button type="button" className="budget-generate" disabled={isAuthenticated && (!estimate || estimating)} onClick={generateSheet}>{!isAuthenticated ? '登录后生成预算单' : estimating ? '正在计算…' : '生成预算单'}</button>
        {selectedProject && <p className="project-budget-note">数据来自项目“{selectedProject.name}”，可在此临时调整，不会覆盖项目资料。</p>}
      </section>

      <section className="budget-result" aria-live="polite">
        {!estimate ? <div className="budget-prompt"><strong>{isAuthenticated ? '填写面积开始试算' : '装修预算参考'}</strong><span>{isAuthenticated ? '请输入 0 至 2000 ㎡之间的装修面积。' : '按每平方米的主要施工类别查看参考区间，具体价格因地区、房屋情况和选材而异。'}</span>{!isAuthenticated && <div className="budget-reference-costs">{referenceCosts.map((item) => <div className="estimate-row" key={item.label}><span>{item.label}</span><strong>¥{item.low} - ¥{item.high} / ㎡</strong></div>)}</div>}</div>
        : <div className="budget-prompt"><strong>条件已填写完成</strong><span>{isAuthenticated ? '点击「生成预算单」生成这份前期预算参考。' : '登录后可计算并保存个性化预算单。'}</span><button type="button" className="budget-generate" disabled={estimating} onClick={generateSheet}>{!isAuthenticated ? '登录后生成预算单' : estimating ? '正在计算…' : '生成预算单'}</button></div>}
      </section>
    </div>}
  </main>;
}
