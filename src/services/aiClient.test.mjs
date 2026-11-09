import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateDesign, retryGenerationRooms } from './aiClient.ts';

test('polling receives each image once and merges retry results', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = { setTimeout: (callback) => setTimeout(callback, 0) };
  const polls = [];
  let generationRound = 0;
  globalThis.fetch = async (url, options) => {
    if (url === '/api/ai/generate') return Response.json({ jobId: 'job-1', requestId: 'request-1' }, { status: 202 });
    if (url === '/api/ai/generation-jobs/job-1/retry' && options.method === 'POST') { generationRound = 1; return Response.json({ jobId: 'job-1' }, { status: 202 }); }
    const query = new URL(url, 'http://localhost').searchParams;
    polls.push({ after: query.get('afterRooms'), includeCover: query.get('includeCover') });
    if (generationRound === 0 && polls.length === 1) return Response.json({ requestId: 'request-1', status: 'running', stage: 'room-generation', message: '正在生成', cover: 'cover-image', coverReady: true, rooms: [{ name: '客厅', imageUrl: 'living-image', description: '' }], completedRooms: 1, totalRooms: 2 });
    if (generationRound === 0) return Response.json({ requestId: 'request-1', status: 'partial', stage: 'partial', message: '部分失败', rooms: [], completedRooms: 1, totalRooms: 2, failedRooms: ['卧室'], error: '卧室失败' });
    return Response.json({ requestId: 'request-1', status: 'completed', stage: 'completed', message: '完成', rooms: [{ name: '卧室', imageUrl: 'bedroom-image', description: '' }], completedRooms: 2, totalRooms: 2 });
  };
  try {
    const progress = [];
    const partial = await generateDesign({ mode: 'floorplan', style: 'modern', prompt: '', analysis: 'test' }, (job) => progress.push(job));
    assert.equal(partial.cover, 'cover-image');
    assert.deepEqual(partial.rooms.map((room) => room.name), ['客厅']);
    assert.match(partial.warning, /卧室失败/);
    assert.deepEqual(polls.slice(0, 2), [{ after: '0', includeCover: '1' }, { after: '1', includeCover: '0' }]);
    const completed = await retryGenerationRooms(partial.jobId, partial);
    assert.deepEqual(completed.rooms.map((room) => room.name), ['客厅', '卧室']);
    assert.equal(completed.warning, undefined);
    assert.deepEqual(polls[2], { after: '1', includeCover: '0' });
    assert.equal(progress.at(-1).completedRooms, 1);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});
