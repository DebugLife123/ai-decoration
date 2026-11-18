// 用户资料本地存储层。
// 后端 user_profiles 表上线后切换为 API，字段结构保持一致。
// displayName / avatar 等以本层为准，登录会话里的字段仅作初始值。
export type UserProfile = {
  displayName: string;
  avatar: string; // data:image/... 头像，空串表示未设置
  region: string;
  bio: string;
  // 装修偏好：作为预算试算、工作台的默认值来源
  defaultArea: string; // 常用面积（㎡），字符串便于直接回填输入框
  preferredStyle: string; // styleCatalog 的 key，空串表示未选择
};

const KEY_PREFIX = 'jianyizhuang-user-profile:';

function storageKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

export function loadUserProfile(userId: string): UserProfile | null {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    if (typeof parsed.displayName !== 'string') return null;
    return {
      displayName: parsed.displayName,
      avatar: typeof parsed.avatar === 'string' ? parsed.avatar : '',
      region: typeof parsed.region === 'string' ? parsed.region : '',
      bio: typeof parsed.bio === 'string' ? parsed.bio : '',
      defaultArea: typeof parsed.defaultArea === 'string' ? parsed.defaultArea : '',
      preferredStyle: typeof parsed.preferredStyle === 'string' ? parsed.preferredStyle : '',
    };
  } catch {
    return null;
  }
}

export function saveUserProfile(userId: string, profile: UserProfile): UserProfile {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(profile));
    return profile;
  } catch {
    throw new Error('本地存储空间不足，资料保存失败。');
  }
}

// 删除头像时清空字段，不删除整份资料。
export function clearProfileAvatar(userId: string): UserProfile | null {
  const profile = loadUserProfile(userId);
  if (!profile) return null;
  return saveUserProfile(userId, { ...profile, avatar: '' });
}
