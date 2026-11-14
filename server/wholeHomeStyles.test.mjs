import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { createAiGatewayPlugin } from './aiGateway.ts';
import { wholeHomeStyles } from '../src/features/styleLibrary/wholeHomeStyles.ts';

function jsonRequest(url, body) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' } } : {}, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks)) }));
    });
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

test('whole-home templates send their own prompts and two ordered reference images; legacy styles remain unchanged', async () => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.info;
  const calls = [];
  console.info = () => {};
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/images/edits')) {
      calls.push(init.body);
      return Response.json({ data: [{ b64_json: 'iVBORw0KGgo=' }] });
    }
    return Response.json({ choices: [{ message: { content: '{"status":"pass","note":"ok"}' } }] });
  };
  const routes = [];
  createAiGatewayPlugin({ AI_API_KEY: 'test-only', AI_BASE_URL: 'http://mock.invalid' }).configureServer({ middlewares: { use(path, handler) { routes.push([path, handler]); } } });
  const server = createServer((req, res) => {
    const route = routes.find(([path]) => req.url === path || req.url.startsWith(path + '/'));
    if (!route) { res.writeHead(404).end(); return; }
    req.url = req.url.slice(route[0].length) || '/';
    route[1](req, res, () => res.writeHead(404).end());
  });
  const baseInput = { mode: 'floorplan', floorPlan: 'data:image/png;base64,aGVsbG8=', analysis: 'test', rooms: [{ name: '客厅', description: 'living' }] };
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal(wholeHomeStyles.length, 8);
    for (const style of wholeHomeStyles) {
      assert.ok(!['songAesthetic', 'modernMinimal', 'american'].includes(style.sourceStyleKey));
      const image = await readFile('public' + style.reference.image);
      assert.equal(createHash('sha256').update(image).digest('hex'), style.reference.sha256);
      assert.ok((await readFile('public' + style.reference.thumbnail)).length > 0);
      const start = calls.length;
      const posted = await jsonRequest(base + '/api/ai/generate', { ...baseInput, style: style.key, templateId: style.id, referenceAssetId: style.reference.id });
      assert.equal(posted.status, 202);
      let result;
      for (let attempt = 0; attempt < 80; attempt++) {
        await delay(20);
        result = (await jsonRequest(base + '/api/ai/generation-jobs/' + posted.body.jobId)).body;
        if (['completed', 'failed'].includes(result.status)) break;
      }
      assert.equal(result.status, 'completed', style.name + ': ' + result.error);
      assert.equal(calls.length - start, 2, 'cover and room must both use the style');
      for (const form of calls.slice(start)) {
        const prompt = form.get('prompt');
        assert.ok(prompt.includes(style.prompt));
        assert.ok(prompt.includes(style.negativePrompt));
        assert.ok(prompt.includes(style.reference.direction));
        assert.ok(prompt.includes('不得用参考图的户型替代用户户型'));
        const images = form.getAll('image[]');
        assert.equal(images.length, 2);
        assert.equal(await images[0].text(), 'hello');
        assert.deepEqual(Buffer.from(await images[1].arrayBuffer()), image);
        assert.equal(form.get('image'), null);
      }
    }
    for (const style of ['modern', 'song', 'smallAmerican']) {
      const start = calls.length;
      const posted = await jsonRequest(base + '/api/ai/generate', { ...baseInput, style });
      assert.equal(posted.status, 202);
      for (let attempt = 0; attempt < 80; attempt++) {
        await delay(20);
        const result = (await jsonRequest(base + '/api/ai/generation-jobs/' + posted.body.jobId)).body;
        if (result.status === 'completed') break;
        assert.notEqual(result.status, 'failed');
      }
      assert.equal(calls.length - start, 2);
      assert.ok(calls[start].get('image'));
      assert.equal(calls[start].getAll('image[]').length, 0);
    }
    const start = calls.length;
    for (const overrides of [
      { style: 'bauhaus', referenceAssetId: wholeHomeStyles[1].reference.id },
      { style: 'modern', referenceAssetId: wholeHomeStyles[0].reference.id },
      { style: 'bauhaus', templateId: 'whole-home-oldMoney' },
    ]) {
      const rejected = await jsonRequest(base + '/api/ai/generate', { ...baseInput, ...overrides });
      assert.equal(rejected.status, 400);
    }
    assert.equal(calls.length, start, 'invalid references must never reach the model');
  } finally {
    await new Promise(resolve => server.close(resolve));
    globalThis.fetch = originalFetch;
    console.info = originalLog;
  }
});
