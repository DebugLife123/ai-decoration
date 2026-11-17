import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Info } from 'lucide-react';
import { fetchCreditLedger, type CreditEntry, type CreditLedger as CreditLedgerData } from '../services/credits';
import { computeCreditStats } from '../services/creditStats';
import { findPlan, formatCredits } from '../subscription/catalog';
import './ProfilePage.css';

type Tab = 'overview' | 'detail';

function formatTime(iso: string) {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function entryState(entry: CreditEntry): { text: string; spent: boolean; pending?: boolean } {
  if (entry.type === 'hold') return entry.status === 'pending' ? { text: entry.label, spent: true, pending: true } : { text: entry.label, spent: true };
  if (entry.type === 'consume') return { text: `${entry.label}（结算）`, spent: true };
  return { text: entry.label, spent: false };
}

export default function ProfilePage() {
  const [data, setData] = useState<CreditLedgerData | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    let active = true;
    void fetchCreditLedger().then((ledger) => { if (active) setData(ledger); }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : '积分信息读取失败。'); });
    return () => { active = false; };
  }, []);

  const summary = data?.summary;
  const entries = useMemo(() => data?.entries ?? [], [data]);

  const stats = useMemo(() => computeCreditStats(entries), [entries]);

  const maxTaskCost = stats.byTask.length > 0 ? stats.byTask[0][1] : 0;
  const detailEntries = entries.filter((entry) => entry.type !== 'consume');

  return (
    <main className="profile-page">
      {error && <div className="profile-error" role="alert">{error}</div>}

      <section className="profile-balance" aria-label="积分概括">
        <div className="profile-balance-top">
          <div className="profile-balance-total">
            <strong>{summary ? formatCredits(summary.balance) : '—'}</strong>
            <span>总剩余积分 <Info size={13} aria-label="生成任务预扣积分，成功后结算，失败自动返还" /></span>
          </div>
          <Link className="profile-buy-link" to="/subscription">购买积分</Link>
        </div>
        <div className="profile-balance-breakdown">
          <div>
            <span>套餐基础积分</span>
            <strong>{formatCredits(stats.planCredits)}</strong>
          </div>
          <div>
            <span>平台奖励积分</span>
            <strong>{formatCredits(stats.rewardCredits)}</strong>
          </div>
        </div>
        <p className="profile-balance-note">
          当前套餐：{summary ? findPlan((summary.planId as 'free' | 'pro_month' | 'pro_year') || 'free').name : '—'}
          {summary && summary.pendingHolds > 0 ? ` · 处理中 ${formatCredits(summary.pendingHolds)} 积分` : ''}
        </p>
      </section>

      <section className="profile-ledger" aria-label="积分明细">
        <div className="profile-ledger-heading">
          <h2>积分明细</h2>
          <div className="profile-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'overview'} className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>积分概览</button>
            <button type="button" role="tab" aria-selected={tab === 'detail'} className={tab === 'detail' ? 'active' : ''} onClick={() => setTab('detail')}>消耗明细</button>
          </div>
        </div>

        {!data ? (
          <p className="profile-ledger-empty">正在读取积分记录…</p>
        ) : tab === 'overview' ? (
          <div className="profile-overview">
            <div className="profile-stat-grid">
              <div className="profile-stat">
                <span>累计获得</span>
                <strong>+{formatCredits(stats.totalEarned)}</strong>
              </div>
              <div className="profile-stat">
                <span>累计消耗</span>
                <strong>-{formatCredits(stats.consumed)}</strong>
              </div>
              <div className="profile-stat">
                <span>处理中</span>
                <strong>{summary ? formatCredits(summary.pendingHolds) : '0'}</strong>
              </div>
            </div>
            <div className="profile-task-breakdown">
              <h3>各任务消耗</h3>
              {stats.byTask.length === 0 ? (
                <p className="profile-ledger-empty">还没有消耗记录，去工作台生成第一套方案吧。</p>
              ) : (
                <ul>
                  {stats.byTask.map(([label, cost]) => (
                    <li key={label}>
                      <span className="profile-task-label">{label}</span>
                      <span className="profile-task-bar"><i style={{ width: `${maxTaskCost > 0 ? Math.max(6, (cost / maxTaskCost) * 100) : 0}%` }} /></span>
                      <strong>{formatCredits(cost)}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : detailEntries.length === 0 ? (
          <p className="profile-ledger-empty">还没有积分记录，去工作台生成第一套方案吧。</p>
        ) : (
          <div className="profile-table" role="table" aria-label="积分消耗明细">
            <div className="profile-table-head" role="row">
              <span role="columnheader">请求与时间</span>
              <span role="columnheader">积分变动</span>
              <span role="columnheader">余额</span>
            </div>
            {detailEntries.map((entry) => {
              const state = entryState(entry);
              const positive = entry.delta > 0;
              return (
                <div className="profile-table-row" role="row" key={entry.id}>
                  <div className="profile-table-request" role="cell">
                    <strong>{state.text}{state.pending ? ' · 处理中' : ''}</strong>
                    <small>{formatTime(entry.at)}</small>
                  </div>
                  <span className={`profile-table-delta ${positive ? 'in' : 'out'}`} role="cell">
                    {positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                    {positive ? '+' : ''}{formatCredits(entry.delta)}
                  </span>
                  <span className="profile-table-balance" role="cell">{formatCredits(entry.balanceAfter)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
