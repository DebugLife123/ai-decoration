import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import { recommendStyles } from '../services/styleRecommendation';
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
  const projects = useAppStore((state) => state.projects);
  const [projectId, setProjectId] = useState('');
  const [areaInput, setAreaInput] = useState('');
  const [region, setRegion] = useState('');
  const [budgetInput, setBudgetInput] = useState('');
  const [finishLevel, setFinishLevel] = useState<FinishLevel>('standard');
  const selectedProject = projects.find((project) => project.id === projectId);
  const area = Number(areaInput);
  const targetBudget = Number(budgetInput) * 10000;
  const currentLevel = finishLevels.find((item) => item.id === finishLevel)!;
  const estimate = useMemo(() => {
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
  const recommendedStyleProfiles = recommendationBudget ? recommendStyles({ budgetWan: recommendationBudget, area, region }) : [];

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
        <label className="budget-field"><span>计划总预算 <small>可选</small></span><div className="budget-input"><input type="number" min="0" step="0.1" value={budgetInput} onChange={(event) => setBudgetInput(event.target.value)} placeholder="填写后可对照估算范围" /><b>万元</b></div></label>
        {selectedProject && <p className="project-budget-note">数据来自项目“{selectedProject.name}”，可在此临时调整，不会覆盖项目资料。</p>}
      </section>

      <section className="budget-result" aria-live="polite">
        {!estimate ? <div className="budget-prompt"><strong>填写面积开始试算</strong><span>请输入 0 至 2000 ㎡之间的装修面积。</span></div> : <>
          <div className="estimate-heading"><div><span>参考总价区间</span><strong>¥{formatMoney(estimate.low)}<small>万</small><i> - </i>¥{formatMoney(estimate.high)}<small>万</small></strong></div><span className="estimate-area">{area.toLocaleString('zh-CN')} ㎡{region.trim() ? ` · ${region.trim()}` : ''}</span></div>
          {budgetStatus && <p className={`budget-comparison ${budgetStatus}`}>
            {budgetStatus === 'within' ? '计划预算落在当前参考区间内。' : budgetStatus === 'low' ? '计划预算低于当前参考区间，可调整面积或装修档位。' : '计划预算高于当前参考区间，可预留部分用于家具、家电或软装。'}
          </p>}
          <div className="style-recommendations">
            <div className="style-recommendations-heading"><div><h2>按预算推荐风格</h2><p>{recommendationBudget ? `根据 ${recommendationBudget} 万元计划预算，优先考虑这些方向。` : '填写计划总预算后，可查看更匹配的风格方向。'}</p></div>{recommendationBudget && <span>{recommendationBudget < 10 ? '预算较紧' : recommendationBudget < 25 ? '舒适区间' : '品质空间'}</span>}</div>
            {recommendationBudget ? <div className="style-recommendation-list">{recommendedStyleProfiles.map((style, index) => {
              return <article className={`style-recommendation ${index === 0 ? 'primary' : ''}`} key={style.style}><div className="style-recommendation-copy"><div><strong>{style.name}</strong>{index === 0 && <em>优先推荐</em>}</div><span>{style.note}</span><p>{style.reason}</p></div><Link to="/workspace" state={{ style: style.style, prompt: `预算约 ${recommendationBudget} 万元，倾向${style.name}风格。` }}>采用此风格</Link></article>;
            })}</div> : <div className="style-recommendation-empty">先填写预算金额，再查看风格建议。</div>}
          </div>
          <div className="estimate-breakdown"><h2>分项参考</h2>{estimate.breakdown.map((item) => <div className="estimate-row" key={item.label}><span>{item.label}</span><strong>¥{formatMoney(item.low)} - ¥{formatMoney(item.high)} 万</strong></div>)}</div>
          <p className="estimate-disclaimer">以上为演示用样例估算，不是企业报价或市场实时报价。地区、房屋状况、施工范围和选材会造成较大差异；不含家具家电、软装及可能产生的结构加固费用。</p>
        </>}
      </section>
    </div>
  </main>;
}
