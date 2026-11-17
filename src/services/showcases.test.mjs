import assert from 'node:assert/strict';
import { test } from 'node:test';

// 提供最小 localStorage mock，必须在导入 showcases 之前安装。
const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, value); },
    removeItem: (key) => { store.delete(key); },
  },
};
const { loadUserShowcases, saveUserShowcase, deleteUserShowcase, MAX_USER_SHOWCASES } = await import('./showcaseStore.ts');

const STORAGE_KEY = 'jianyizhuang-user-showcases';
const valid = (id) => ({
  id, title: '方案' + id, style: '现代简约', description: '',
  imageDataUrl: 'data:image/jpeg;base64,AAAA', authorId: 'u1', authorName: '用户',
  createdAt: '2026-01-01T00:00:00Z',
});

test('读取时过滤损坏记录', () => {
  store.set(STORAGE_KEY, JSON.stringify([valid('a'), { id: 'bad' }, null, valid('b')]));
  assert.deepEqual(loadUserShowcases().map((item) => item.id), ['a', 'b']);
});

test('读取时截断到数量上限', () => {
  store.set(STORAGE_KEY, JSON.stringify(Array.from({ length: 30 }, (_, i) => valid(String(i)))));
  assert.equal(loadUserShowcases().length, MAX_USER_SHOWCASES);
});

test('损坏的 JSON 返回空列表', () => {
  store.set(STORAGE_KEY, '{not json');
  assert.deepEqual(loadUserShowcases(), []);
});

test('达到上限后拒绝新增并给出提示', () => {
  store.set(STORAGE_KEY, JSON.stringify(Array.from({ length: MAX_USER_SHOWCASES }, (_, i) => valid(String(i)))));
  assert.throws(() => saveUserShowcase(valid('new')), /最多发布/);
});

test('删除后返回剩余作品', () => {
  store.set(STORAGE_KEY, JSON.stringify([valid('a'), valid('b')]));
  assert.deepEqual(deleteUserShowcase('a').map((item) => item.id), ['b']);
});
