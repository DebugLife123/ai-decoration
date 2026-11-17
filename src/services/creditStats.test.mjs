import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeCreditStats } from './creditStats.ts';

const entry = (fields) => ({
  id: 'e', at: '2026-01-01T00:00:00Z', type: 'grant', delta: 0,
  balanceAfter: 0, label: '默认', ...fields,
});

test('退款不计入奖励积分，赠送才计入', () => {
  const stats = computeCreditStats([
    entry({ id: 'g', type: 'grant', delta: 3, balanceAfter: 3, label: '注册赠送积分' }),
    entry({ id: 'r', type: 'refund', delta: 2, balanceAfter: 2, label: '任务失败，积分返还' }),
    entry({ id: 'p', type: 'purchase', delta: 20, balanceAfter: 22, label: '购买积分包' }),
  ]);
  assert.equal(stats.rewardCredits, 3);
  assert.equal(stats.planCredits, 20);
  assert.equal(stats.totalEarned, 23);
  assert.equal(stats.consumed, 0);
});

test('预扣不计消耗，结算才计入', () => {
  const stats = computeCreditStats([
    entry({ id: 'h1', type: 'hold', delta: -1, balanceAfter: 2, label: '单张效果图生成', status: 'pending' }),
    entry({ id: 'h2', type: 'hold', delta: -1, balanceAfter: 1, label: '单张效果图生成', status: 'settled' }),
    entry({ id: 'c', type: 'consume', delta: 0, balanceAfter: 1, label: '单张效果图生成（结算）', refId: 'h2' }),
  ]);
  assert.equal(stats.consumed, 1);
  assert.deepEqual(stats.byTask, [['单张效果图', 1]]);
});

test('失败返还的预扣不计入消耗', () => {
  const stats = computeCreditStats([
    entry({ id: 'h', type: 'hold', delta: -3, balanceAfter: 0, label: '全屋方案生成（封面+2个空间）', status: 'refunded' }),
    entry({ id: 'r', type: 'refund', delta: 3, balanceAfter: 3, label: '任务失败，积分返还', refId: 'h' }),
  ]);
  assert.equal(stats.consumed, 0);
  assert.equal(stats.byTask.length, 0);
});

test('结算返还按关联预扣冲减实际消耗', () => {
  const stats = computeCreditStats([
    entry({ id: 'h', type: 'hold', delta: -4, balanceAfter: 0, label: '全屋方案生成（封面+3个空间）', status: 'settled' }),
    entry({ id: 'r', type: 'refund', delta: 1, balanceAfter: 1, label: '任务结算返还', refId: 'h' }),
  ]);
  assert.equal(stats.consumed, 3);
  assert.deepEqual(stats.byTask, [['全屋方案', 3]]);
});

test('同类任务归一聚合，异类分开并按消耗降序', () => {
  const stats = computeCreditStats([
    entry({ id: 'h1', type: 'hold', delta: -1, balanceAfter: 0, label: '单张效果图生成', status: 'settled' }),
    entry({ id: 'h2', type: 'hold', delta: -2, balanceAfter: 0, label: '户型图识别分析', status: 'settled' }),
    entry({ id: 'h3', type: 'hold', delta: -2, balanceAfter: 0, label: '单张效果图生成', status: 'settled' }),
  ]);
  assert.deepEqual(stats.byTask, [['单张效果图', 3], ['户型识别', 2]]);
});
