// 预算试算快照：把预算页的试算结果带入装修工作流（工作台/画布）。
// 存储在浏览器本地，按用户隔离；后端上线后可迁移为服务端快照。
export type BudgetSnapshot = {
  area: number;
  region: string;
  finishLevel: 'basic' | 'standard' | 'premium';
  finishLabel: string;
  budgetWan: number | null;
  lowWan: number;
  highWan: number;
  savedAt: string;
};

const storageKey = (userId: string) => `jianyizhuang-budget-snapshot:${userId}`;

export function loadBudgetSnapshot(userId: string): BudgetSnapshot | null {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BudgetSnapshot;
    return parsed.area > 0 && parsed.highWan >= parsed.lowWan ? parsed : null;
  } catch {
    return null;
  }
}

export function saveBudgetSnapshot(userId: string, snapshot: BudgetSnapshot): void {
  window.localStorage.setItem(storageKey(userId), JSON.stringify(snapshot));
}

export function clearBudgetSnapshot(userId: string): void {
  window.localStorage.removeItem(storageKey(userId));
}
