import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { callApi, createAiGatewayPlugin, roomsFrom } from './aiGateway.ts';

function jsonRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, options, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }));
    });
    request.on('error', reject);
    if (options.body) request.write(options.body);
    request.end();
  });
}

test('CAD uncertain room labels normalize to useful unique generation names and retain evidence', () => {
  const rooms = roomsFrom(JSON.stringify({ rooms: [
    { name: '待确认房间（左上，床具区）', description: '可见床具', confidence: 0.68, evidence: [{ type: 'fixture', detail: '可见床具和床头柜' }, { type: 'geometry', detail: '左上独立围合空间' }] },
    { name: '待确认卫生间（上部中央）', description: '卫生间区域', confidence: 0.74, evidence: [{ type: 'fixture', detail: '可见洗手盆和淋浴设施' }] },
    { name: '待确认房间（中部，洁具区）', description: '可见洁具', confidence: 0.77, evidence: [{ type: 'fixture', detail: '可见马桶、洗手盆和淋浴设施' }] },
    { name: '待确认区域（中部起居区）', description: '起居空间', confidence: 0.7, evidence: [{ type: 'fixture', detail: '可见沙发和电视' }] },
    { name: '待确认区域（左下，餐桌区）', description: '餐桌空间', confidence: 0.72, evidence: [{ type: 'fixture', detail: '可见餐桌和餐椅' }] },
    { name: '待确认阳台（下部右侧）', description: '阳台空间', confidence: 0.8, evidence: [{ type: 'geometry', detail: '下部外接空间' }] },
    { name: '卫生间', description: '第二个卫生间', confidence: 0.95, status: 'confirmed', evidence: [{ type: 'label', detail: '原图标注卫生间' }] },
    { name: '主卧', description: '主卧室', confidence: 0.9, status: 'confirmed', evidence: [{ type: 'label', detail: '原图标注主卧' }] },
  ] }));

  assert.deepEqual(rooms.map(({ name }) => name), ['卧室1', '卫生间1', '卫生间2', '客厅1', '餐厅1', '阳台1', '卫生间3', '主卧']);
  assert.equal(new Set(rooms.map(({ name }) => name)).size, rooms.length);
  assert.ok(rooms.every(({ name }) => !/待确认/.test(name)));
  assert.equal(rooms[0].suggestedName, '待确认房间（左上，床具区）');
  assert.equal(rooms[0].status, 'unknown');
  assert.deepEqual(rooms[0].evidence.map(({ detail }) => detail), ['可见床具和床头柜', '左上独立围合空间']);
  assert.equal(rooms[7].name, '主卧');
});

async function waitForJob(base, id) {
  for (let index = 0; index < 40; index += 1) {
    await delay(25);
    const result = await jsonRequest(`${base}/api/ai/generation-jobs/${id}?summary=1&includeCover=1`);
    if (['completed', 'partial', 'failed'].includes(result.body.status)) return result.body;
  }
  throw new Error('Mock job did not settle.');
}

test('generation keeps a completed cover and retries only failed rooms', async () => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.info;
  const logs = [];
  const calls = [];
  const imageInputs = [];
  let failBedroom = true;
  console.info = (line) => logs.push(JSON.parse(line));
  globalThis.fetch = async (url, init) => {
    const path = String(url);
    if (path.endsWith('/images/edits')) {
      const name = String(init.body.get('prompt'));
      const stage = name.includes('本张只生成“卧室”') ? 'bedroom' : name.includes('本张只生成“客厅”') ? 'living' : 'cover';
      calls.push(stage);
      imageInputs.push({ stage, arrayCount: init.body.getAll('image[]').length, single: Boolean(init.body.get('image')), prompt: name });
      if (stage === 'bedroom' && failBedroom) return new Response('', { status: 503 });
      return new Response(JSON.stringify({ data: [{ b64_json: 'iVBORw0KGgo=' }] }), { status: 200, headers: { 'x-request-id': 'mock-image-id' } });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"status":"pass","note":"ok"}' } }] }), { status: 200 });
  };
  const routes = [];
  createAiGatewayPlugin({ CODEX2API_API_KEY: 'mock-key', AI_BASE_URL: 'http://mock.invalid', AI_IMAGE_MODEL: 'mock-image', AI_VISION_MODEL: 'mock-vision' }).configureServer({ middlewares: { use(path, handler) { routes.push([path, handler]); } } });
  const server = createServer((request, response) => {
    const route = routes.find(([path]) => request.url === path || request.url.startsWith(`${path}/`));
    if (!route) { response.writeHead(404).end(); return; }
    request.url = request.url.slice(route[0].length) || '/';
    route[1](request, response, () => response.writeHead(404).end());
  });
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const started = await jsonRequest(`${base}/api/ai/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'floorplan', style: 'modern', floorPlan: 'data:image/png;base64,aGVsbG8=', analysis: 'test', rooms: [{ name: '客厅', description: 'living' }, { name: '卧室', description: 'bedroom' }], selectedRooms: ['客厅', '卧室'], roomReferenceImages: [{ name: '卧室', image: 'data:image/jpeg;base64,aGVsbG8=' }] }),
    });
    assert.equal(started.status, 202);
    const partial = await waitForJob(base, started.body.jobId);
    assert.equal(partial.status, 'partial');
    assert.equal(partial.rooms.length, 1);
    assert.equal(partial.rooms[0].name, '客厅');
    assert.ok(partial.cover);
    assert.deepEqual(partial.failedRooms, ['卧室']);
    assert.ok(logs.some((entry) => entry.stage === 'room-image' && entry.status === 503 && entry.requestId === started.body.requestId));
    assert.ok(logs.every((entry) => !JSON.stringify(entry).includes('mock-key')));
    failBedroom = false;
    const retried = await jsonRequest(`${base}/api/ai/generation-jobs/${started.body.jobId}/retry`, { method: 'POST' });
    assert.equal(retried.status, 202);
    const completed = await waitForJob(base, started.body.jobId);
    assert.equal(completed.status, 'completed');
    assert.equal(completed.rooms.length, 2);
    assert.equal(completed.totalRooms, 2);
    assert.equal(calls.filter((call) => call === 'cover').length, 1);
    assert.equal(calls.filter((call) => call === 'living').length, 1);
    assert.equal(calls.filter((call) => call === 'bedroom').length, 2);
    assert.ok(imageInputs.some((input) => input.stage === 'cover' && input.arrayCount === 0 && input.single));
    assert.ok(imageInputs.some((input) => input.stage === 'living' && input.arrayCount === 0 && input.single));
    assert.ok(imageInputs.filter((input) => input.stage === 'bedroom').every((input) => input.arrayCount === 2 && !input.single));
    assert.ok(imageInputs.filter((input) => input.stage === 'bedroom').every((input) => !input.prompt.includes('全图+房间局部放大')));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = originalFetch;
    console.info = originalLog;
  }
});

test('analysis retries a transient 503 but does not retry a local deadline', async () => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.info;
  const logs = [];
  console.info = (line) => logs.push(JSON.parse(line));
  const config = { baseUrl: 'http://mock.invalid', apiKey: 'test-key', visionModel: 'mock' };
  try {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return calls === 1 ? new Response('', { status: 503 }) : new Response('{"choices":[]}', { status: 200 });
    };
    const response = await callApi(config, '/chat/completions', { method: 'POST', body: '{}' }, { requestId: 'retry-case', stage: 'floorplan-analysis' });
    assert.deepEqual(response, { choices: [] });
    assert.equal(calls, 2);
    assert.ok(logs.some((entry) => entry.event === 'upstream_retry' && entry.status === 503));

    calls = 0;
    globalThis.fetch = (_url, init) => new Promise((_resolve, reject) => {
      calls += 1;
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
    await assert.rejects(callApi({ ...config, analysisTimeoutMs: 15 }, '/chat/completions', { method: 'POST', body: '{}' }, { requestId: 'timeout-case', stage: 'floorplan-analysis' }), /超过 0.015 秒/);
    assert.equal(calls, 1);
    assert.ok(logs.some((entry) => entry.requestId === 'timeout-case' && entry.outcome === 'local_timeout'));
  } finally {
    globalThis.fetch = originalFetch;
    console.info = originalLog;
  }
});

test('image requests retry only a pre-response connection failure and log a sanitized network code', async () => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.info;
  const logs = [];
  const config = { baseUrl: 'http://mock.invalid', apiKey: 'secret-key', imageModel: 'mock' };
  const request = () => callApi(config, '/images/edits', { method: 'POST', body: new FormData() }, { requestId: 'image-network-case', stage: 'room-image' });
  console.info = (line) => logs.push(JSON.parse(line));
  try {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('fetch failed', { cause: Object.assign(new Error('socket detail'), { code: 'ECONNRESET' }) });
      return new Response('{"data":[{"b64_json":"iVBORw0KGgo="}]}', { status: 200 });
    };
    assert.deepEqual(await request(), { data: [{ b64_json: 'iVBORw0KGgo=' }] });
    assert.equal(calls, 2);
    assert.ok(logs.some((entry) => entry.event === 'upstream_retry' && entry.networkErrorCode === 'ECONNRESET' && entry.requestId === 'image-network-case'));
    assert.ok(logs.every((entry) => !JSON.stringify(entry).includes('secret-key')));

    calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response('', { status: 503 });
    };
    await assert.rejects(request(), /503/);
    assert.equal(calls, 1);

    calls = 0;
    globalThis.fetch = (_url, init) => new Promise((_resolve, reject) => {
      calls += 1;
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
    await assert.rejects(callApi({ ...config, imageTimeoutMs: 15 }, '/images/edits', { method: 'POST', body: new FormData() }, { requestId: 'image-timeout-case', stage: 'room-image' }), /0\.015/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    console.info = originalLog;
  }
});
