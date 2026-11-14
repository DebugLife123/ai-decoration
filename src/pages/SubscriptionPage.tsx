import { useMemo, useState } from 'react';
import { Check, CircleHelp, Coins, Sparkles, X } from 'lucide-react';
import { CREDIT_PACKS, PLANS, findPlan, formatCredits, formatPrice } from '../subscription/catalog';
import type { Plan } from '../subscription/types';
import './SubscriptionPage.css';

type Cycle = 'month' | 'year';

const COMPARE_ROWS: { label: string; value: (plan: Plan) => string }[] = [
  { label: '每期积分', value: (plan) => (plan.period === 'none' ? `${plan.creditsPerPeriod} 积分（一次性）` : `${plan.creditsPerPeriod} 积分 / ${plan.period === 'year' ? '年' : '月'}`) },
  { label: '并发生成任务', value: (plan) => `${plan.limits.concurrency} 个` },
  { label: '方案记录保留', value: (plan) => (plan.limits.historyDays >= 3650 ? '长期保留' : `${plan.limits.historyDays} 天`) },
  { label: '去水印导出', value: (plan) => (plan.entitlements.nowatermark ? '支持' : '不支持') },
  { label: '2K / 4K 高清原图', value: (plan) => (plan.entitlements.hires ? '支持' : '不支持') },
  { label: 'CAD 全屋渲染', value: (plan) => (plan.entitlements.cad ? '支持' : '不支持') },
  { label: '优先生成队列', value: (plan) => (plan.entitlements.priority ? '支持' : '不支持') },
];

const FAQS = [
  ['积分怎么用？', '户型图分析和单张效果图各消耗 1 积分，房间局部编辑消耗 0.5 积分，CAD 鸟瞰渲染消耗 3 积分。具体消耗以实际功能提示为准。'],
  ['会员到期后，我的方案还在吗？', '已生成的效果图和历史方案不会删除。订阅权益和生成额度会按套餐周期变化，页面展示不影响已有项目。'],
  ['积分包和会员可以一起使用吗？', '可以。会员额度与积分包是独立的展示项，后续接入业务时可按实际扣减规则统一管理。'],
  ['现在可以直接购买吗？', '当前页面仅用于展示套餐结构和价格，暂未接入真实支付、订单、积分扣减或自动续费。'],
];

function ActionNotice({ onClose }: { onClose: () => void }) {
  return (
    <div className="subscription-notice" role="status">
      <div className="subscription-notice-icon"><CircleHelp size={18} /></div>
      <div><strong>展示页面</strong><span>支付与积分业务尚未接入，本次操作不会产生扣款。</span></div>
      <button type="button" onClick={onClose} aria-label="关闭提示"><X size={16} /></button>
    </div>
  );
}

export default function SubscriptionPage() {
  const [cycle, setCycle] = useState<Cycle>('year');
  const [noticeVisible, setNoticeVisible] = useState(false);
  const featuredId = cycle === 'year' ? 'pro_year' : 'pro_month';
  const currentPlan = findPlan('free');
  const monthlyPrice = useMemo(() => Math.round(findPlan('pro_year').priceCents / 12), []);

  const showNotice = () => setNoticeVisible(true);

  return (
    <main className="subscription-page">
      {noticeVisible && <ActionNotice onClose={() => setNoticeVisible(false)} />}

      <header className="subscription-hero">
        <div className="subscription-hero-copy">
          <span className="subscription-eyebrow">CREDITS & SUBSCRIPTION</span>
          <h1>用积分，把每一次灵感变成方案</h1>
          <p>按创作量选择订阅或积分包。当前为展示版本，先把套餐、权益和积分消耗方式讲清楚。</p>
        </div>
        <div className="subscription-balance" aria-label="当前积分概览">
          <div className="subscription-balance-icon"><Coins size={20} /></div>
          <div><span>当前积分余额</span><strong>3 <small>积分</small></strong></div>
          <em>免费体验</em>
        </div>
      </header>

      <section className="subscription-section" aria-labelledby="plans-heading">
        <div className="subscription-section-heading">
          <div><span className="subscription-kicker">PLANS</span><h2 id="plans-heading">订阅方案</h2></div>
          <div className="subscription-cycle" role="radiogroup" aria-label="订阅周期">
            <button type="button" role="radio" aria-checked={cycle === 'month'} className={cycle === 'month' ? 'active' : ''} onClick={() => setCycle('month')}>月付</button>
            <button type="button" role="radio" aria-checked={cycle === 'year'} className={cycle === 'year' ? 'active' : ''} onClick={() => setCycle('year')}>年付 <em>省 2 个月</em></button>
          </div>
        </div>

        <div className="subscription-plan-grid">
          {PLANS.map((plan) => {
            const featured = plan.id === featuredId;
            const isYear = plan.period === 'year';
            return (
              <article className={`subscription-plan ${featured ? 'featured' : ''}`} key={plan.id}>
                {plan.badge && <span className="subscription-badge">{plan.badge}</span>}
                <span className="subscription-plan-tier">{plan.tier}</span>
                <h3>{plan.name}</h3>
                <p className="subscription-plan-tagline">{plan.tagline}</p>
                <div className="subscription-price"><strong>{formatPrice(plan.priceCents)}</strong>{plan.period !== 'none' && <span>/ {isYear ? '年' : '月'}</span>}</div>
                {isYear && <p className="subscription-price-note">折合 {formatPrice(monthlyPrice)} / 月</p>}
                <div className="subscription-credit-count"><strong>{formatCredits(plan.creditsPerPeriod)}</strong><span>积分{plan.period === 'none' ? ' · 一次性' : ` / ${isYear ? '年' : '月'}`}</span></div>
                <ul className="subscription-highlights">
                  {plan.highlights.map((item) => <li key={item}><Check size={15} aria-hidden="true" />{item}</li>)}
                </ul>
                <button className={`subscription-action ${featured ? 'primary' : ''}`} type="button" onClick={showNotice}>{plan.id === 'free' ? '当前体验方案' : '选择此方案'}</button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="subscription-section" aria-labelledby="packs-heading">
        <div className="subscription-section-heading"><div><span className="subscription-kicker">CREDIT PACKS</span><h2 id="packs-heading">积分包</h2></div><p>不想订阅时，也可以按次补充积分。积分包有效期均为 12 个月。</p></div>
        <div className="subscription-pack-grid">
          {CREDIT_PACKS.map((pack) => {
            const total = pack.credits + pack.bonus;
            return <article className="subscription-pack" key={pack.id}>
              {pack.bonus > 0 && <span className="subscription-pack-bonus">赠 {pack.bonus} 积分</span>}
              <span className="subscription-pack-name">{pack.name}</span>
              <div className="subscription-pack-total"><strong>{total}</strong><span>积分</span></div>
              <p>{pack.note}</p>
              <div className="subscription-pack-footer"><div><strong>{formatPrice(pack.priceCents)}</strong><small>{formatPrice(Math.round(pack.priceCents / total))} / 积分</small></div><button type="button" onClick={showNotice}>查看</button></div>
            </article>;
          })}
        </div>
      </section>

      <section className="subscription-section" aria-labelledby="compare-heading">
        <div className="subscription-section-heading"><div><span className="subscription-kicker">COMPARE</span><h2 id="compare-heading">权益对比</h2></div><p>积分数决定可创作量，权益决定交付质量与效率。</p></div>
        <div className="subscription-table-wrap"><table className="subscription-table"><thead><tr><th scope="col">对比项</th>{PLANS.map((plan) => <th className={plan.id === featuredId ? 'featured' : ''} scope="col" key={plan.id}>{plan.name}</th>)}</tr></thead><tbody>{COMPARE_ROWS.map((row) => <tr key={row.label}><th scope="row">{row.label}</th>{PLANS.map((plan) => { const value = row.value(plan); return <td className={`${plan.id === featuredId ? 'featured' : ''} ${value === '不支持' ? 'disabled' : ''}`} key={plan.id}>{value === '不支持' ? '—' : value}</td>; })}</tr>)}<tr><th scope="row">未用完积分</th>{PLANS.map((plan) => <td className={plan.id === featuredId ? 'featured' : ''} key={plan.id}>{plan.period === 'none' ? '永久有效' : '按周期管理'}</td>)}</tr></tbody></table></div>
      </section>

      <section className="subscription-faq" aria-labelledby="faq-heading">
        <div><span className="subscription-kicker">FAQ</span><h2 id="faq-heading">常见问题</h2></div>
        <div className="subscription-faq-list">{FAQS.map(([question, answer]) => <details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div>
      </section>

      <footer className="subscription-footnote"><Sparkles size={15} /><span>当前为积分订阅展示页面，所有套餐、价格和余额均为静态演示数据，不会调用支付或积分接口。</span><span className="subscription-current-plan">当前方案：{currentPlan.name}</span></footer>
    </main>
  );
}
