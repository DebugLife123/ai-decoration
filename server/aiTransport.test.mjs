import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { setImmediate } from 'node:timers/promises';
import { test, after } from 'node:test';
import { aiDispatcher, fetchAiUpstream } from './aiTransport.ts';

after(() => aiDispatcher.close());

test('AI transport reuses a connection after the response is consumed', async () => {
  const sockets = new Set();
  const server = createServer((req, res) => {
    sockets.add(req.socket);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    for (let i = 0; i < 3; i++) {
      const response = await fetchAiUpstream(`http://127.0.0.1:${server.address().port}`, {
        method: 'POST', body: '{}', signal: AbortSignal.timeout(2000),
      });
      assert.deepEqual(await response.json(), { ok: true });
      await setImmediate();
    }
    assert.equal(sockets.size, 1);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('AI transport still obeys the request deadline while reading a stalled body', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('{');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const controller = new AbortController();
    const response = await fetchAiUpstream(`http://127.0.0.1:${server.address().port}`, {
      signal: controller.signal,
    });
    const body = response.text();
    controller.abort();
    await assert.rejects(body, { name: 'AbortError' });
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
