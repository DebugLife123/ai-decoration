import assert from 'node:assert/strict';
import { test } from 'node:test';
import { editRoomImage, generateDesign, resumeGenerationJob, retryGenerationRooms } from './aiClient.ts';
import { createId } from '../utils/id.ts';

test('id generation works when crypto.randomUUID is unavailable', () => {
  const originalCrypto = globalThis.crypto;
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {} });
  try {
    assert.match(createId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  } finally {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: originalCrypto });
  }
});

test('room edit converts a persisted blob image to a supported data URL', async () => {
  const originalFetch = globalThis.fetch;
  const originalFileReader = globalThis.FileReader;
  let requestBody;
  globalThis.FileReader = class {
    readAsDataURL(blob) {
      this.result = `data:${blob.type};base64,${Buffer.from('saved-room-image').toString('base64')}`;
      this.onload();
    }
  };
  globalThis.fetch = async (url, options) => {
    if (url === 'blob:http://localhost/saved-room') return new Response(new Blob(['saved-room-image'], { type: 'image/png' }));
    requestBody = JSON.parse(options.body);
    return Response.json({ imageUrl: 'data:image/png;base64,edited', model: 'test-image-model' });
  };
  try {
    const result = await editRoomImage({ image: 'blob:http://localhost/saved-room', mask: 'data:image/png;base64,mask', instruction: '把门换成黑色', roomName: '次卧1', style: '现代简约' });
    assert.match(requestBody.image, /^data:image\/png;base64,/);
    assert.equal(requestBody.mask, 'data:image/png;base64,mask');
    assert.equal(result.model, 'test-image-model');
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.FileReader = originalFileReader;
  }
});

test('room edit leaves a supported data URL unchanged', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return Response.json({ imageUrl: 'data:image/png;base64,edited', model: 'test-image-model' });
  };
  try {
    const image = 'data:image/jpeg;base64,original';
    await editRoomImage({ image, mask: 'data:image/png;base64,mask', instruction: '调整颜色', roomName: '客厅', style: '现代简约' });
    assert.equal(requestBody.image, image);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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

test('resuming a task tolerates a temporary not-found while the gateway registers it', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = { setTimeout: (callback) => setTimeout(callback, 0) };
  let polls = 0;
  globalThis.fetch = async () => {
    polls += 1;
    if (polls === 1) return new Response('not registered', { status: 404 });
    return Response.json({
      id: 'task-1', requestId: 'request-1', status: 'completed', stage: 'completed', message: '完成',
      completedRooms: 0, totalRooms: 0, cover: 'cover-image', analysis: '识别结果', rooms: [],
    });
  };
  try {
    const result = await resumeGenerationJob('task-1');
    assert.equal(result.cover, 'cover-image');
    assert.equal(result.jobId, 'task-1');
    assert.equal(polls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});
