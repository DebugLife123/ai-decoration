import type { CreditPack, Plan, PlanId } from './types';

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: '免费体验',
    tier: 'FREE',
    tagline: '先体验一套完整方案，再决定是否升级。',
    priceCents: 0,
    period: 'none',
    creditsPerPeriod: 3,
    entitlements: { cad: false, nowatermark: false, hires: false, priority: false, history: false },
    limits: { concurrency: 1, historyDays: 30 },
    highlights: ['注册赠送 3 积分，永久有效', '单张效果图带演示水印', '每日最多 2 次生成', '方案记录保留 30 天'],
  },
  {
    id: 'pro_month',
    name: '专业版 · 月付',
    tier: 'PRO',
    tagline: '适合连续出方案的设计师与家装顾问。',
    priceCents: 3900,
    period: 'month',
    creditsPerPeriod: 30,
    badge: '最超值',
    entitlements: { cad: true, nowatermark: true, hires: true, priority: true, history: true },
    limits: { concurrency: 3, historyDays: 3650 },
    highlights: ['每月自动到账 30 积分', '去水印 + 2K 高清导出', '解锁 CAD 全屋渲染', '支持 3 个并发生成任务'],
  },
  {
    id: 'pro_year',
    name: '旗舰年卡',
    tier: 'FLAGSHIP',
    tagline: '一次付一年，覆盖长期装修创作需求。',
    priceCents: 39900,
    period: 'year',
    creditsPerPeriod: 480,
    badge: '省 2 个月',
    entitlements: { cad: true, nowatermark: true, hires: true, priority: true, history: true },
    limits: { concurrency: 4, historyDays: 3650 },
    highlights: ['一次性到账 480 积分', '包含专业版全部权益', '支持 4 个并发生成任务', '优先队列，出图更快'],
  },
];

export const CREDIT_PACKS: CreditPack[] = [
  { id: 'pack_5', name: '体验包', credits: 5, bonus: 0, priceCents: 1990, validMonths: 12, note: '适合试做单间与一次全屋总览。' },
  { id: 'pack_20', name: '标准包', credits: 20, bonus: 2, priceCents: 5900, validMonths: 12, note: '适合一到两套房的常规出图量。' },
  { id: 'pack_50', name: '大户型包', credits: 50, bonus: 10, priceCents: 12900, validMonths: 12, note: '适合多套房或反复改稿的创作量。' },
];

export function findPlan(id: PlanId): Plan {
  return PLANS.find((plan) => plan.id === id) ?? PLANS[0];
}

export function formatCredits(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatPrice(cents: number): string {
  if (cents === 0) return '免费';
  const yuan = cents / 100;
  return `¥${Number.isInteger(yuan) ? yuan : yuan.toFixed(2)}`;
}
