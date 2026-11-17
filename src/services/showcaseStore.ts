// 用户发布的装修方案（灵感广场）本地存储层。
// 后端 user_showcases 表上线后切换为 API，字段结构保持一致。
export type UserShowcase = {
  id: string;
  title: string;
  style: string;
  description: string;
  imageDataUrl: string;
  authorId: string;
  authorName: string;
  createdAt: string;
};

export const STORAGE_KEY = 'jianyizhuang-user-showcases';
export const MAX_USER_SHOWCASES = 20;

function isShowcase(value: unknown): value is UserShowcase {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<UserShowcase>;
  return typeof item.id === 'string'
    && typeof item.title === 'string'
    && typeof item.style === 'string'
    && typeof item.imageDataUrl === 'string'
    && item.imageDataUrl.startsWith('data:image/')
    && typeof item.createdAt === 'string';
}

export function loadUserShowcases(): UserShowcase[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    return Array.isArray(parsed) ? parsed.filter(isShowcase).slice(0, MAX_USER_SHOWCASES) : [];
  } catch {
    return [];
  }
}

// 写入失败时抛中文错误，由调用方展示；本地存储超限属可预期异常。
function persistShowcases(next: UserShowcase[]): UserShowcase[] {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, MAX_USER_SHOWCASES)));
    return next;
  } catch {
    throw new Error('本地存储空间不足，无法保存作品，请删除部分已发布方案后重试。');
  }
}

export function saveUserShowcase(showcase: UserShowcase): UserShowcase[] {
  const current = loadUserShowcases();
  if (current.length >= MAX_USER_SHOWCASES) throw new Error(`最多发布 ${MAX_USER_SHOWCASES} 套方案，请先删除部分作品。`);
  return persistShowcases([showcase, ...current]);
}

export function deleteUserShowcase(id: string): UserShowcase[] {
  return persistShowcases(loadUserShowcases().filter((item) => item.id !== id));
}
