import type { CreditEntry } from './credits';

export interface CreditStats {
  planCredits: number;
  rewardCredits: number;
  totalEarned: number;
  consumed: number;
  byTask: [string, number][];
}

const round2 = (value: number) => Math.round(value * 100) / 100;

// 账本语义：hold 预扣全额，consume 仅标记（delta=0），结算返还与失败返还是 refund。
// 因此实际消耗 = 已结算 hold 预扣额 - 关联同 hold 的结算返还。
// 失败返还对应的 hold 状态为 refunded，未产生消耗，不计入。
const TASK_LABELS: { match: RegExp; label: string }[] = [
  { match: /单张效果图/, label: '单张效果图' },
  { match: /全屋方案生成/, label: '全屋方案' },
  { match: /重试.*空间/, label: '失败空间重试' },
  { match: /局部方案编辑/, label: '局部编辑' },
  { match: /户型图识别分析/, label: '户型识别' },
];

function taskLabel(label: string): string {
  return TASK_LABELS.find((item) => item.match.test(label))?.label ?? label;
}

export function computeCreditStats(entries: CreditEntry[]): CreditStats {
  let planCredits = 0;
  let rewardCredits = 0;
  const byTask = new Map<string, number>();

  // 结算返还按 refId 归集，用于冲减对应 hold 的实际消耗。
  const settleRefundByHold = new Map<string, number>();
  for (const entry of entries) {
    if (entry.type === 'refund' && entry.refId && entry.delta > 0) {
      settleRefundByHold.set(entry.refId, (settleRefundByHold.get(entry.refId) ?? 0) + entry.delta);
    }
  }

  for (const entry of entries) {
    if (entry.type === 'purchase') planCredits += entry.delta;
    if (entry.type === 'grant') rewardCredits += entry.delta;
    if (entry.type !== 'hold' || entry.status !== 'settled') continue;

    const held = Math.abs(entry.delta);
    const net = round2(Math.max(0, held - (settleRefundByHold.get(entry.id) ?? 0)));
    if (net === 0) continue;
    const label = taskLabel(entry.label);
    byTask.set(label, round2((byTask.get(label) ?? 0) + net));
  }

  const consumed = round2([...byTask.values()].reduce((total, value) => total + value, 0));
  return {
    planCredits: round2(planCredits),
    rewardCredits: round2(rewardCredits),
    totalEarned: round2(planCredits + rewardCredits),
    consumed,
    byTask: [...byTask.entries()].sort((a, b) => b[1] - a[1]),
  };
}
