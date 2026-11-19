import { Agent } from 'undici';

// Scope pooling to AI traffic; database and authentication requests keep their own transport.
export const aiDispatcher = new Agent({
  connect: { timeout: 30_000 },
  connections: 8,
  pipelining: 1,
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
});

export function fetchAiUpstream(url: string, init: RequestInit): Promise<Response> {
  const options: RequestInit & { dispatcher: Agent } = { ...init, dispatcher: aiDispatcher };
  return fetch(url, options);
}
