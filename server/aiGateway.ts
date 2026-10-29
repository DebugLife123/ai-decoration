import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

type GatewayConfig = { baseUrl: string; apiKey: string; visionModel: string; imageModel: string };
type GenerateRequest = { mode: 'photo' | 'floorplan'; style: string; prompt?: string; photo?: string; floorPlan?: string; photos?: string[] };
type ImageResult = { imageUrl: string };

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<GenerateRequest> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as GenerateRequest;
}

function baseUrl(value: string) { return value.replace(/\/+$/, '').replace(/\/v1$/, ''); }
function imageBlob(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('上传图片格式无效，请重新选择图片。');
  return new Blob([Buffer.from(match[2], 'base64')], { type: match[1] });
}
function textFrom(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content;
  return Array.isArray(content) ? content.map((item) => item?.text ?? '').join('') : typeof content === 'string' ? content : '';
}
function imageFrom(payload: any): string | null {
  const item = payload?.data?.[0];
  if (typeof item?.url === 'string') return item.url;
  if (typeof item?.b64_json === 'string') return `data:image/png;base64,${item.b64_json}`;
  return typeof payload?.image_url === 'string' ? payload.image_url : null;
}

async function callApi(config: GatewayConfig, path: string, init: RequestInit) {
  const response = await fetch(`${baseUrl(config.baseUrl)}/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${config.apiKey}`, ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...init.headers },
  });
  const raw = await response.text();
  let payload: any;
  try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { raw }; }
  if (!response.ok) throw new Error(payload?.error?.message || payload?.message || raw || `上游接口返回 ${response.status}`);
  return payload;
}

async function analyze(config: GatewayConfig, image: string, mode: 'photo' | 'floorplan') {
  const instruction = mode === 'photo'
    ? '分析这张现场毛坯空间照片。用简洁中文描述空间类型、现有结构、采光、主要墙面地面和不可移动元素，供室内效果图生成使用。不要虚构看不见的结构。'
    : '分析这张户型图，识别可见的房间、动线、门窗和大致空间关系。只输出 JSON，格式为 {"rooms":[{"name":"客厅","description":"..."}]}，最多识别 6 个房间。';
  const payload = await callApi(config, '/chat/completions', { method: 'POST', body: JSON.stringify({ model: config.visionModel, temperature: 0.2, messages: [{ role: 'user', content: [{ type: 'text', text: instruction }, { type: 'image_url', image_url: { url: image, detail: 'high' } }] }] }) });
  return textFrom(payload);
}

function roomsFrom(text: string) {
  try {
    const parsed = JSON.parse(text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim());
    if (Array.isArray(parsed?.rooms)) return parsed.rooms.slice(0, 6).map((room: any, index: number) => ({ name: String(room?.name || `空间 ${index + 1}`), description: String(room?.description || '根据户型图识别的空间') }));
  } catch { /* Use a visible fallback when a compatible model ignores JSON mode. */ }
  return [
    { name: '客厅', description: '根据户型图生成的公共活动空间，保留主要采光和动线。' },
    { name: '卧室', description: '根据户型图生成的休息空间，强调舒适、收纳和自然光。' },
    { name: '厨房', description: '根据户型图生成的厨房空间，关注操作动线和储物。' },
  ];
}

async function generate(config: GatewayConfig, prompt: string): Promise<ImageResult> {
  const payload = await callApi(config, '/images/generations', { method: 'POST', body: JSON.stringify({ model: config.imageModel, prompt, n: 1, size: '1024x1024', response_format: 'b64_json' }) });
  const imageUrl = imageFrom(payload);
  if (!imageUrl) throw new Error('生图接口没有返回图片，请检查当前生图模型配置。');
  return { imageUrl };
}
async function edit(config: GatewayConfig, image: string, prompt: string): Promise<ImageResult> {
  const form = new FormData();
  form.append('model', config.imageModel); form.append('prompt', prompt); form.append('n', '1'); form.append('size', '1024x1024'); form.append('response_format', 'b64_json'); form.append('image', imageBlob(image), 'source.png');
  const payload = await callApi(config, '/images/edits', { method: 'POST', body: form });
  const imageUrl = imageFrom(payload);
  if (!imageUrl) throw new Error('图片编辑接口没有返回图片。');
  return { imageUrl };
}

async function photoFlow(config: GatewayConfig, request: GenerateRequest) {
  const photo = request.photo || request.photos?.[0];
  if (!photo) throw new Error('请先上传一张现场毛坯照片。');
  const prompt = `将这张现场毛坯空间改造成${request.style}风格的室内设计效果图。保留原有墙体、门窗、空间比例和视角，不改变不可移动结构；补充合理的墙面、地面、吊顶、灯光、家具、软装和收纳。${request.prompt || ''}。输出真实室内设计渲染图，干净、自然、适合方案沟通。`;
  try { return { type: 'photo', analysis: await analyze(config, photo, 'photo'), ...(await edit(config, photo, prompt)) }; }
  catch (editError) { const analysis = await analyze(config, photo, 'photo'); return { type: 'photo', analysis, ...(await generate(config, `${prompt}\n现场照片分析：${analysis}`)), fallback: String(editError) }; }
}

async function floorPlanFlow(config: GatewayConfig, request: GenerateRequest) {
  if (!request.floorPlan) throw new Error('请先上传户型图。');
  const analysis = await analyze(config, request.floorPlan, 'floorplan');
  const rooms = roomsFrom(analysis);
  const common = `基于同一套住宅户型，保持${request.style}风格、统一材质和色彩。${request.prompt || ''}。这是室内设计方案效果图，不是施工图。`;
  const cover = await generate(config, `${common}生成一张全屋装修方案的代表性总览图，体现客餐厅和整体空间气质。户型识别摘要：${analysis}`);
  const roomResults = [];
  for (const room of rooms) roomResults.push({ ...room, ...(await generate(config, `${common}生成${room.name}的室内效果图。空间说明：${room.description}。画面需要完整展示${room.name}的墙面、地面、家具、灯光和软装。`)) });
  return { type: 'floorplan', analysis, cover: cover.imageUrl, rooms: roomResults };
}

export function createAiGatewayPlugin(env: Record<string, string>): Plugin {
  const config: GatewayConfig = { baseUrl: env.AI_BASE_URL || 'https://codex2api.com', apiKey: env.CODEX2API_API_KEY || env.AI_API_KEY || '', visionModel: env.AI_VISION_MODEL || env.AI_MODEL || 'gpt-4o-mini', imageModel: env.AI_IMAGE_MODEL || env.IMAGE_MODEL || 'gpt-image-1' };
  const gatewayMiddleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      if (req.method !== 'POST') return next();
      if (!config.apiKey) return sendJson(res, 500, { error: '未检测到 CODEX2API_API_KEY 或 AI_API_KEY。' });
      try { const request = await readBody(req); const result = request.mode === 'photo' ? await photoFlow(config, request) : await floorPlanFlow(config, request); sendJson(res, 200, result); }
      catch (error) { sendJson(res, 502, { error: error instanceof Error ? error.message : 'AI 请求失败，请稍后重试。' }); }
    };
  return {
    name: 'ai-decoration-gateway',
    configureServer(server) {
      server.middlewares.use('/api/ai/generate', gatewayMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/ai/generate', gatewayMiddleware);
    },
  };
}
