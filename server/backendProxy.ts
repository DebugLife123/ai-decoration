import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

export function createBackendProxyPlugin(target: string): Plugin {
  const forward = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/v1/')) return next();
    const destination = new URL(req.url, target);
    const proxy = http.request(destination, {
      method: req.method,
      headers: { ...req.headers, host: destination.host },
    }, (upstream) => {
      res.writeHead(upstream.statusCode || 502, upstream.headers);
      upstream.pipe(res);
    });
    proxy.on('error', () => {
      if (!res.headersSent) {
        res.statusCode = 503;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      res.end(JSON.stringify({ code: 'BACKEND_UNAVAILABLE', message: '项目服务暂时不可用，请稍后重试。', data: null }));
    });
    req.pipe(proxy);
  };
  const install = (server: { middlewares: { use: (handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void } }) => {
    server.middlewares.use(forward);
  };
  return { name: 'decoration-backend-proxy', configureServer: install, configurePreviewServer: install };
}
