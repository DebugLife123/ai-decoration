import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getWholeHomeStyle, wholeHomePrompt } from '../src/features/styleLibrary/wholeHomeStyles.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { CREDIT_COSTS, databaseCredits } from './databaseCredits.ts';
import { fetchAiUpstream } from './aiTransport.ts';

function insufficient(res: ServerResponse, result: { required: number; balance: number }) {
  return sendJson(res, 402, { error: `积分不足：本次需要 ${result.required} 积分，当前余额 ${result.balance}。请联系管理员核对余额。`, code: 'INSUFFICIENT_CREDITS', required: result.required, balance: result.balance });
}

export type GatewayConfig = { baseUrl: string; apiKey: string; imageApiKey?: string; visionModel: string; imageModel: string; analysisTimeoutMs?: number; visionFallbackModels?: string[]; analysisTotalTimeoutMs?: number; reviewTimeoutMs?: number; imageTimeoutMs?: number };
type RoomBounds = { x: number; y: number; width: number; height: number };
type RoomEvidence = { type: string; detail: string };
type IdentifiedRoom = { id?: string; name: string; description: string; suggestedName?: string; confidence?: number | null; status?: 'confirmed' | 'identified' | 'unknown'; evidence?: RoomEvidence[]; adjacentTo?: string[]; bounds?: RoomBounds | null };
type PlanImageMeta = { sourceWidth: number; sourceHeight: number; sentWidth: number; sentHeight: number; sourceBytes: number };
type GenerateRequest = { mode: 'photo' | 'floorplan'; style: string; prompt?: string; photo?: string; floorPlan?: string; imageMeta?: PlanImageMeta; photos?: string[]; source?: 'cad' | 'floorplan'; analysis?: string; rooms?: IdentifiedRoom[]; selectedRooms?: string[]; roomReferenceImages?: { name: string; image: string }[]; taskId?: string; templateId?: string; referenceAssetId?: string };
type AnalyzeRequest = { floorPlan?: string; imageMeta?: PlanImageMeta; source?: 'cad' | 'floorplan' };
type RoomImageEditRequest = { image?: string; mask?: string; instruction?: string; roomName?: string; style?: string };
type ImageResult = { imageUrl: string };
type AiCallContext = { requestId?: string; operation?: string; stage?: string; model?: string; inputImageBytes?: number; maxAttempts?: number };
type GenerationJob = {
  id: string;
  requestId: string;
  status: 'queued' | 'running' | 'completed' | 'partial' | 'failed';
  stage: string;
  message: string;
  completedRooms: number;
  totalRooms: number;
  analysis?: string;
  cover?: string;
  rooms: (IdentifiedRoom & { imageUrl: string; review?: { status: 'pass' | 'check' | 'unverified'; note: string } })[];
  failedRooms?: string[];
  error?: string;
  updatedAt: string;
};

export function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export async function readBody<T = GenerateRequest>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
}

function baseUrl(value: string) { return value.replace(/\/+$/, '').replace(/\/v1$/, ''); }
const DEFAULT_ANALYSIS_TIMEOUT_MS = 120_000;
const DEFAULT_REVIEW_TIMEOUT_MS = 90_000;
const DEFAULT_IMAGE_TIMEOUT_MS = 180_000;
function imageByteLength(image: string) {
  const comma = image.indexOf(',');
  return comma >= 0 ? Math.floor((image.length - comma - 1) * 0.75) : 0;
}
function safeImageMeta(meta?: PlanImageMeta) {
  if (!meta) return undefined;
  return Object.fromEntries((['sourceWidth', 'sourceHeight', 'sentWidth', 'sentHeight', 'sourceBytes'] as const).map((key) => [key, Number.isFinite(meta[key]) && meta[key] >= 0 ? Math.floor(meta[key]) : 0]));
}
function logAiEvent(event: Record<string, unknown>) {
  console.info(JSON.stringify({ timestamp: new Date().toISOString(), component: 'ai-gateway', ...event }));
}
function networkErrorCode(error: unknown) {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && /^[A-Z0-9_]{2,40}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}
function imageBlob(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('上传图片格式无效，请重新选择图片。');
  return new Blob([Buffer.from(match[2], 'base64')], { type: match[1] });
}
export function textFrom(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content;
  return Array.isArray(content) ? content.map((item) => item?.text ?? '').join('') : typeof content === 'string' ? content : '';
}
export function imageFrom(payload: any): string | null {
  const item = payload?.data?.[0];
  if (typeof item?.b64_json === 'string' && item.b64_json.length > 0) {
    const mime = item.b64_json.startsWith('/9j/')
      ? 'image/jpeg'
      : item.b64_json.startsWith('iVBORw0KGgo')
        ? 'image/png'
        : item.b64_json.startsWith('UklGR')
          ? 'image/webp'
          : 'image/png';
    return `data:${mime};base64,${item.b64_json}`;
  }
  if (typeof item?.url === 'string') return item.url;
  return typeof payload?.image_url === 'string' ? payload.image_url : null;
}

// Never expose upstream HTML, credentials, or provider internals to the browser.
export function upstreamErrorMessage(status: number): string {
  if ([408, 504, 524].includes(status)) return `模型服务响应超时（${status}），本次识别未完成，请稍后重试。`;
  if ([401, 403].includes(status)) return '模型服务鉴权失败，请联系管理员检查服务端密钥或模型权限。';
  if (status === 429) return '模型服务当前繁忙，请稍后重试。';
  return `模型服务暂时不可用（${status}），请稍后重试。`;
}

export class UpstreamError extends Error {
  status: number;
  constructor(status: number) {
    super(upstreamErrorMessage(status));
    this.name = 'UpstreamError';
    this.status = status;
  }
}

export class AiConnectionError extends Error {}
export class AiDeadlineError extends Error {}
export class InvalidAnalysisError extends Error {}

export async function callApi(config: GatewayConfig, path: string, init: RequestInit, context: AiCallContext = {}) {
  const isImageRequest = path.startsWith('/images/');
  const timeoutMs = isImageRequest
    ? config.imageTimeoutMs || DEFAULT_IMAGE_TIMEOUT_MS
    : context.stage === 'room-review'
      ? config.reviewTimeoutMs || DEFAULT_REVIEW_TIMEOUT_MS
      : config.analysisTimeoutMs || DEFAULT_ANALYSIS_TIMEOUT_MS;
  const startedAt = Date.now();
  const requestId = context.requestId || crypto.randomUUID();
  const inputImageBytes = context.inputImageBytes ?? (typeof init.body === 'string' ? [...init.body.matchAll(/data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]+)/gi)].reduce((sum, match) => sum + Math.floor(match[1].length * 0.75), 0) : undefined);
  const maxAttempts = context.maxAttempts ?? 2;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptStartedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let status: number | undefined;
    let upstreamRequestId: string | undefined;
    let responseReceived = false;
    try {
      const apiKey = isImageRequest ? config.imageApiKey || config.apiKey : config.apiKey;
      const response = await fetchAiUpstream(`${baseUrl(config.baseUrl)}/v1${path}`, {
        ...init,
        signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...init.headers },
      });
      responseReceived = true;
      status = response.status;
      upstreamRequestId = response.headers.get('x-request-id') || response.headers.get('request-id') || undefined;
      if (!response.ok) {
        await response.body?.cancel();
        throw new UpstreamError(response.status);
      }
      const raw = await response.text();
      let payload: any;
      try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { raw }; }
      logAiEvent({ event: 'upstream_request', requestId, operation: context.operation || 'unspecified', stage: context.stage || path, path, model: context.model, inputImageBytes, attempt, status, upstreamRequestId, attemptDurationMs: Date.now() - attemptStartedAt, durationMs: Date.now() - startedAt, outcome: 'success' });
      return payload;
    } catch (error) {
      lastError = error;
      const retryableStatus = !isImageRequest && error instanceof UpstreamError && [408, 429, 502, 503, 504, 524].includes(error.status);
      const retryableNetwork = !responseReceived && !(error instanceof UpstreamError) && !(error instanceof Error && error.name === 'AbortError');
      if (attempt < maxAttempts && (retryableStatus || retryableNetwork)) {
        logAiEvent({ event: 'upstream_retry', requestId, operation: context.operation || 'unspecified', stage: context.stage || path, path, model: context.model, inputImageBytes, attempt, status, upstreamRequestId, networkErrorCode: retryableNetwork ? networkErrorCode(error) : undefined, attemptDurationMs: Date.now() - attemptStartedAt, durationMs: Date.now() - startedAt, reason: retryableStatus ? `http_${error instanceof UpstreamError ? error.status : 'error'}` : 'network_error' });
        await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
        continue;
      }
      logAiEvent({ event: 'upstream_request', requestId, operation: context.operation || 'unspecified', stage: context.stage || path, path, model: context.model, inputImageBytes, attempt, status, upstreamRequestId, networkErrorCode: !responseReceived ? networkErrorCode(error) : undefined, attemptDurationMs: Date.now() - attemptStartedAt, durationMs: Date.now() - startedAt, outcome: error instanceof Error && error.name === 'AbortError' ? 'local_timeout' : 'failure' });
      if (error instanceof Error && error.name === 'AbortError') throw new AiDeadlineError(`${context.stage === 'room-review' ? '效果图复核' : isImageRequest ? '图片生成' : 'AI 分析'}请求超过 ${timeoutMs / 1000} 秒，本次步骤未完成。`);
      if (error instanceof UpstreamError) throw error;
      throw new AiConnectionError(`上游接口连接失败：${error instanceof Error ? error.message : '未知网络错误'}`);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

export async function analyze(config: GatewayConfig, image: string, mode: 'photo' | 'floorplan' | 'cad', context: AiCallContext = {}) {
  const instruction = mode === 'photo'
    ? '分析这张现场毛坯空间照片。用简洁中文描述空间类型、现有结构、采光、主要墙面地面和不可移动元素，供室内效果图生成使用。不要虚构看不见的结构。'
    : mode === 'cad'
      ? '分析这张 CAD 导出的住宅平面图。识别可见墙体边界、门窗、标注、空间名称、固定设施及邻接关系，忽略图框，不得凭面积臆测功能。只输出严格 JSON，包含 rooms、walls、openings、connections、uncertainties。rooms 项包含 id、name、description、confidence、status、evidence、adjacentTo、bounds。evidence 是可见证据数组，每项为 {type:"label|fixture|adjacency|geometry",detail:"图上看到的具体依据"}；不确定的证据不得写成事实。bounds 是该房间在原图中的归一化矩形 {x,y,width,height}，左上为原点，值在 0 到 1，仅在边界可辨时返回，否则为 null；不要伪造坐标。主卧/次卧仅在房间标注或明确套卫/衣帽间关系支持时使用，否则 name 写“待确认房间（方位/特征）”，候选名称放入 suggestedName。卫生间需有洁具/排水设施或图面文字证据。confidence 为 0 到 1；status 只能 confirmed、identified、unknown；最多 20 个空间。walls、openings、connections 尽量按可见证据列出，不确定写入 uncertainties。'
      : '分析这张住宅户型图。严格依据图面识别全部可辨空间、墙体、门窗开口、固定设施、邻接和主要动线，不清晰内容列入 uncertainties，不得猜测尺寸或结构。只输出严格 JSON，包含 rooms、walls、openings、connections、circulation、uncertainties。rooms 项包含 id、name、description、confidence、status、evidence、adjacentTo、bounds。evidence 是可见证据数组，每项为 {type:"label|fixture|adjacency|geometry",detail:"图上看到的具体依据"}。bounds 是房间在原图中的归一化矩形 {x,y,width,height}，左上为原点、值在 0 到 1，只在边界清楚时给出，否则 null，禁止估算坐标。主卧/次卧仅在房间文字标注或明确套卫/衣帽间关系支持时使用，否则 name 写“待确认房间（方位/特征）”，候选名称放入 suggestedName；不得只凭面积/采光命名。卫生间需有洁具/排水设施或文字证据。房间名称不得使用编号占位；confidence 为 0 到 1，status 只能 confirmed、identified、unknown；最多 20 个空间。';
  const prompt = mode === 'photo' ? instruction : `${mode === 'cad' ? '分析这张 CAD 导出的住宅平面图' : '分析这张住宅户型图'}。识别图中全部文字标注的房间/区域，以及明显独立围合但未标注的房间；玄关、过道、阳台等标注区域即使开放连接也必须列出，不得遗漏或虚构。忽略图框，不猜测尺寸。只输出严格 JSON：{"rooms":[{"id":"r1","name":"原图标注名称或待确认房间（方位/特征）","description":"简短可见结构描述","confidence":0.0,"status":"confirmed|identified|unknown","evidence":[{"type":"label|fixture|adjacency|geometry","detail":"图上看到的依据"}],"adjacentTo":[],"bounds":null}],"uncertainties":[]}。卧室主次只按原图标注或明确套卫/衣帽间关系确认；否则使用待确认名称并将候选写入 suggestedName。卫生间须有洁具或文字证据。边界清楚时 bounds 用左上为原点的 0 到 1 归一化矩形 {"x":0,"y":0,"width":0,"height":0}，否则 null，不估算。最多20个空间，不要 Markdown。`;
  const stage = mode === 'photo' ? 'photo-analysis' : mode === 'cad' ? 'cad-plan-analysis' : 'floorplan-analysis';
  const requestId = context.requestId || crypto.randomUUID();
  const models = [...new Set([config.visionModel, ...(config.visionFallbackModels || [])].map(m => m.trim()).filter(Boolean))].slice(0, 3);
  const startedAt = Date.now();
  const perModelTimeout = config.analysisTimeoutMs || DEFAULT_ANALYSIS_TIMEOUT_MS;
  const totalTimeout = config.analysisTotalTimeoutMs || 300_000;
  let lastError: unknown;
  for (let index = 0; index < models.length; index += 1) {
    const remaining = totalTimeout - (Date.now() - startedAt);
    if (remaining <= 0) throw new AiDeadlineError(`AI 分析总耗时超过 ${totalTimeout / 1000} 秒，本次步骤未完成。`);
    const model = models[index];
    try {
      const payload = await callApi({ ...config, analysisTimeoutMs: Math.min(perModelTimeout, remaining) }, '/chat/completions', {
        method: 'POST', body: JSON.stringify({ model, temperature: 0.2, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: image, detail: 'high' } }] }] }),
      }, { ...context, requestId, operation: context.operation || 'analysis', stage, model, inputImageBytes: imageByteLength(image), maxAttempts: 1 });
      const text = textFrom(payload);
      if (!text.trim() || (mode !== 'photo' && !hasRecognizedRooms(text))) {
        throw new InvalidAnalysisError('模型未返回有效的空间识别结果，本次识别未完成。');
      }
      logAiEvent({ event: 'vision_route_success', requestId, stage, model, candidate: index + 1, durationMs: Date.now() - startedAt });
      return text;
    } catch (error) {
      lastError = error;
      const retryable = error instanceof AiConnectionError || error instanceof AiDeadlineError || error instanceof InvalidAnalysisError
        || (error instanceof UpstreamError && [403, 404, 408, 429, 500, 502, 503, 504, 524].includes(error.status));
      if (!retryable || index === models.length - 1) throw error;
      logAiEvent({ event: 'vision_route_fallback', requestId, stage, model, nextModel: models[index + 1], reason: error instanceof UpstreamError ? `http_${error.status}` : error instanceof AiDeadlineError ? 'timeout' : error instanceof InvalidAnalysisError ? 'invalid_result' : 'connection_failure', durationMs: Date.now() - startedAt });
    }
  }
  throw lastError;
}

function hasRecognizedRooms(text: string): boolean {
  try {
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed.rooms) && parsed.rooms.length > 0 && parsed.rooms.length <= 20
      && parsed.rooms.every((room: unknown) => room && typeof room === 'object' && typeof (room as { name?: unknown }).name === 'string' && (room as { name: string }).name.trim());
  } catch { return false; }

}

// 灵感广场发布门禁：判断图片是否为家居实景或户型图，拦截无关内容。
export type ShowcaseReview = { category: 'interior' | 'floorplan' | 'other'; reason: string };

const SHOWCASE_REVIEW_PROMPT = '你是家装平台的内容审核员。判断这张图片是否适合作为「装修方案分享」发布。只输出严格 JSON，不要 Markdown：{"category":"interior|floorplan|other","reason":"一句话中文理由"}。category 定义：interior=家居室内实景照片或装修效果图（能看到房间、家具、软装、门窗等室内环境）；floorplan=住宅户型图、CAD 平面图、手绘户型草图；other=人物、动漫、游戏、风景、动物、物品特写、软件截图、海报等与住宅装修无关的内容。以人物为主体或人物占画面显著位置的图片一律判 other。';

export async function classifyShowcaseImage(config: GatewayConfig, image: string, context: AiCallContext = {}): Promise<ShowcaseReview> {
  const payload = await callApi(config, '/chat/completions', { method: 'POST', body: JSON.stringify({ model: config.visionModel, temperature: 0, messages: [{ role: 'user', content: [{ type: 'text', text: SHOWCASE_REVIEW_PROMPT }, { type: 'image_url', image_url: { url: image, detail: 'low' } }] }] }) }, { ...context, operation: 'showcase-review', stage: 'showcase-review', model: config.visionModel, inputImageBytes: imageByteLength(image) });
  let parsed: any;
  try { parsed = JSON.parse(textFrom(payload).replace(/^```json\s*/i, '').replace(/```$/i, '').trim()); } catch { throw new Error('审查结果解析失败，请重试。'); }
  const category = String(parsed?.category || '');
  if (category !== 'interior' && category !== 'floorplan' && category !== 'other') throw new Error('审查结果异常，请重试。');
  return { category, reason: String(parsed?.reason || '').slice(0, 120) || '未提供理由' };
}

type RoomCategory = '卧室' | '卫生间' | '厨房' | '餐厅' | '客厅' | '阳台' | '玄关' | '过道' | '功能区';

const ROOM_CATEGORY_RULES: Array<{ category: RoomCategory; pattern: RegExp }> = [
  { category: '卫生间', pattern: /卫生间|洗手间|厕所|主卫|次卫|洁具|马桶|坐便|洗手盆|淋浴|地漏|排水/ },
  { category: '厨房', pattern: /厨房|灶具|灶台|操作台|水槽|橱柜/ },
  { category: '餐厅', pattern: /餐厅|餐桌|餐椅/ },
  { category: '客厅', pattern: /客厅|起居|沙发|电视|茶几/ },
  { category: '阳台', pattern: /阳台|露台|外接空间|临外墙/ },
  { category: '玄关', pattern: /玄关|入户/ },
  { category: '过道', pattern: /过道|走廊|通道/ },
  { category: '卧室', pattern: /卧室|床具|床头|床|衣柜/ },
];

function inferRoomCategory(candidate: string, description: string, evidence: RoomEvidence[]): RoomCategory {
  const source = [candidate, description, ...evidence.map((item) => item.detail)].join(' ');
  return ROOM_CATEGORY_RULES.find((rule) => rule.pattern.test(source))?.category || '功能区';
}

export function roomsFrom(text: string): IdentifiedRoom[] {
  let parsed: any;
  try {
    parsed = JSON.parse(text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim());
  } catch { /* Fall through to an explicit model-output error. */ }
  if (Array.isArray(parsed?.rooms) && parsed.rooms.length > 0) {
    const categoryCounts = new Map<RoomCategory, number>();
    const usedNames = new Set<string>();
    const rooms: IdentifiedRoom[] = parsed.rooms.slice(0, 20).map((room: any, index: number) => {
      const candidate = String(room?.name || '').trim();
      const evidence: RoomEvidence[] = Array.isArray(room?.evidence) ? room.evidence.slice(0, 12).map((item: any) => ({ type: String(item?.type || 'geometry'), detail: String(item?.detail || '').trim() })).filter((item: RoomEvidence) => item.detail) : [];
      const labelEvidence = evidence.some((item) => item.type === 'label');
      const suiteEvidence = evidence.some((item) => item.type === 'adjacency' && /(套卫|主卫|衣帽间|套间)/.test(item.detail));
      const unsupportedBedroomRank = /^(主卧|次卧|主人房|主卧室|次卧室)$/.test(candidate) && !labelEvidence && !suiteEvidence;
      const unsupportedBathroom = /^(卫生间|主卫|次卫|公卫)$/.test(candidate) && !labelEvidence && !evidence.some((item) => item.type === 'fixture' && /(洁具|马桶|坐便|洗手盆|淋浴|地漏|排水)/.test(item.detail));
      const genericModelName = !candidate || /^(空间|房间|区域)\s*\d+$/.test(candidate) || /^待确认/.test(candidate);
      const uncertain = unsupportedBedroomRank || unsupportedBathroom || genericModelName;
      const rawBounds = room?.bounds;
      const bounds = rawBounds && ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(rawBounds[key])) && rawBounds.x >= 0 && rawBounds.y >= 0 && rawBounds.width > 0 && rawBounds.height > 0 && rawBounds.x + rawBounds.width <= 1.001 && rawBounds.y + rawBounds.height <= 1.001
        ? { x: rawBounds.x, y: rawBounds.y, width: rawBounds.width, height: rawBounds.height }
        : null;
      const category = inferRoomCategory(candidate, String(room?.description || ''), evidence);
      let categoryIndex = (categoryCounts.get(category) || 0) + 1;
      categoryCounts.set(category, categoryIndex);
      let normalizedName = uncertain ? `${category}${categoryIndex}` : candidate;
      if (!uncertain && normalizedName === category && categoryIndex > 1) normalizedName = `${category}${categoryIndex}`;
      while (usedNames.has(normalizedName)) {
        categoryIndex += 1;
        categoryCounts.set(category, categoryIndex);
        normalizedName = `${category}${categoryIndex}`;
      }
      usedNames.add(normalizedName);
      return {
        id: String(room?.id || `room_${index + 1}`),
        name: normalizedName,
        ...(uncertain && candidate ? { suggestedName: candidate } : {}),
        description: String(room?.description || '根据户型图识别的空间'),
        confidence: Number.isFinite(room?.confidence) ? Math.max(0, Math.min(1, room.confidence)) : null,
        status: uncertain ? 'unknown' : room?.status === 'confirmed' ? 'confirmed' : 'identified',
        evidence,
        adjacentTo: Array.isArray(room?.adjacentTo) ? room.adjacentTo.slice(0, 12).map(String) : [],
        bounds,
      };
    });
    if (rooms.some((room) => !room.name)) throw new Error('户型识别没有返回可用的空间名称。请上传更清晰的图纸后重试。');
    return rooms;
  }
  throw new Error('户型识别模型未返回有效空间列表，请重试或更换清晰的户型图片。');
}

export async function generate(config: GatewayConfig, prompt: string, context: AiCallContext = {}): Promise<ImageResult> {
  const payload = await callApi(config, '/images/generations', { method: 'POST', body: JSON.stringify({ model: config.imageModel, prompt, n: 1, size: '1024x1024', response_format: 'b64_json' }) }, { ...context, model: config.imageModel });
  const imageUrl = imageFrom(payload);
  if (!imageUrl) throw new Error('生图接口没有返回图片，请检查当前生图模型配置。');
  return { imageUrl };
}
async function mapConcurrent<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index]);
    }
  }));
  return results;
}
async function edit(config: GatewayConfig, images: string | string[], prompt: string, context: AiCallContext = {}, styleReference?: Blob): Promise<ImageResult> {
  const form = new FormData();
  const sources = Array.isArray(images) ? images : [images];
  if (!sources.length) throw new Error('图片编辑请求缺少结构参考图。');
  const inputImageBytes = sources.reduce((total, image) => total + imageByteLength(image), 0);
  form.append('model', config.imageModel); form.append('prompt', prompt); form.append('n', '1'); form.append('size', '1024x1024'); form.append('response_format', 'b64_json');
  sources.forEach((image, index) => {
    const source = imageBlob(image);
    const extension = source.type === 'image/jpeg' ? 'jpg' : source.type === 'image/webp' ? 'webp' : 'png';
    const filename = index === 0 ? `floorplan.${extension}` : `room-reference-${index}.${extension}`;
    form.append(sources.length > 1 || styleReference ? 'image[]' : 'image', source, filename);
  });
  if (styleReference) form.append('image[]', styleReference, 'style-reference.jpg');
  const payload = await callApi(config, '/images/edits', { method: 'POST', body: form }, { ...context, model: config.imageModel, inputImageBytes });
  const imageUrl = imageFrom(payload);
  if (!imageUrl) throw new Error('图片编辑接口没有返回图片。');
  return { imageUrl };
}

async function editRoomImageRequest(config: GatewayConfig, request: RoomImageEditRequest, context: AiCallContext = {}) {
  const { image, mask, instruction, roomName, style } = request;
  if (!image || !mask || !instruction?.trim() || !roomName?.trim()) throw new Error('局部编辑请求缺少图片、选区或修改要求。');
  if (instruction.length > 600) throw new Error('修改要求不能超过 600 个字符。');
  if (!/^data:image\/(png|jpeg|webp);base64,/.test(image)) throw new Error('原图格式不支持，请使用 PNG、JPG 或 WEBP 图片。');
  if (!/^data:image\/png;base64,/.test(mask)) throw new Error('选区遮罩格式无效，请重新涂抹选区。');
  const imageSize = Buffer.from(image.slice(image.indexOf(',') + 1), 'base64').byteLength;
  const maskSize = Buffer.from(mask.slice(mask.indexOf(',') + 1), 'base64').byteLength;
  if (imageSize > 12 * 1024 * 1024 || maskSize > 8 * 1024 * 1024) throw new Error('图片或选区过大，请缩小图片后重试。');
  const form = new FormData();
  form.append('model', config.imageModel);
  form.append('prompt', `仅修改“${roomName.trim()}”中用户遮罩选中的区域。用户要求：${instruction.trim()}。整体设计风格：${style || '沿用原图'}。严格保持未遮罩区域、房间布局、镜头视角、透视、家具、门窗和整体光照不变；仅允许选区边缘必要的自然融合。`);
  form.append('n', '1');
  form.append('size', '1024x1024');
  form.append('response_format', 'b64_json');
  form.append('image', imageBlob(image), 'room-image.png');
  form.append('mask', imageBlob(mask), 'mask.png');
  const payload = await callApi(config, '/images/edits', { method: 'POST', body: form }, { ...context, operation: 'room-image-edit', stage: 'local-image-edit', model: config.imageModel, inputImageBytes: imageSize });
  const imageUrl = imageFrom(payload);
  if (!imageUrl) throw new Error('图片编辑接口没有返回图片。');
  return { imageUrl, model: config.imageModel };
}

async function reviewRoomImage(config: GatewayConfig, image: string, room: IdentifiedRoom, references: { floorPlan?: string; roomCrop?: string } = {}, context: AiCallContext = {}) {
  try {
    const referenceImages = [
      references.floorPlan ? { type: 'image_url', image_url: { url: references.floorPlan, detail: 'low' } } : null,
      references.roomCrop ? { type: 'image_url', image_url: { url: references.roomCrop, detail: 'low' } } : null,
    ].filter(Boolean);
    const payload = await callApi(config, '/chat/completions', { method: 'POST', body: JSON.stringify({
      model: config.visionModel, temperature: 0, messages: [{ role: 'user', content: [
        { type: 'text', text: `核对最后一张生成的室内效果图是否与目标房间的结构依据一致。目标空间：${room.name}${room.suggestedName ? `（候选：${room.suggestedName}）` : ''}。户型依据：${room.description}。可见证据：${(room.evidence || []).map((item) => item.detail).join('；') || '无结构化证据'}。后续图片依次为：生成结果、完整户型图、目标空间原始裁剪图。只核对结构一致性，不评价审美。重点检查：是否只生成目标房间；是否出现多个独立房间、全屋俯视图、楼梯、夹层、台阶、挑空或错层；是否出现第二张床、额外门洞或额外窗户；房间长宽比例、墙体走向、门窗开口、固定设施位置是否明显改变；是否把相邻空间合并。被遮挡或原图没有证据的结构不要臆测。严格输出 JSON：{"status":"pass|check","note":"简短中文说明"}。` },
        { type: 'image_url', image_url: { url: image, detail: 'low' } },
        ...referenceImages,
      ] }] }),
    }, { ...context, operation: context.operation || 'whole-home-generation', stage: 'room-review', model: config.visionModel });
    const text = textFrom(payload).replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const result = JSON.parse(text);
    return { status: result.status === 'pass' ? 'pass' as const : 'check' as const, note: String(result.note || '建议人工核对房间功能与户型依据。') };
  } catch {
    return { status: 'unverified' as const, note: '自动复核暂不可用，请人工对照户型图确认。' };
  }
}

async function photoFlow(config: GatewayConfig, request: GenerateRequest, context: AiCallContext = {}) {
  const photo = request.photo || request.photos?.[0];
  if (!photo) throw new Error('请先上传一张现场毛坯照片。');
  const prompt = `将这张现场毛坯空间改造成${request.style}风格的室内设计效果图。保留原有墙体、门窗、空间比例和视角，不改变不可移动结构；补充合理的墙面、地面、吊顶、灯光、家具、软装和收纳。${request.prompt || ''}。输出真实室内设计渲染图，干净、自然、适合方案沟通。`;
  try { return { type: 'photo', analysis: await analyze(config, photo, 'photo', context), ...(await edit(config, photo, prompt, { ...context, operation: 'photo-generation', stage: 'photo-image-generation' })) }; }
  catch (editError) { const analysis = await analyze(config, photo, 'photo', context); return { type: 'photo', analysis, ...(await generate(config, `${prompt}\n现场照片分析：${analysis}`, { ...context, operation: 'photo-generation', stage: 'photo-image-generation' })), fallback: String(editError) }; }
}

function updateGenerationJob(job: GenerationJob, updates: Partial<GenerationJob>) {
  Object.assign(job, updates, { updatedAt: new Date().toISOString() });
}

function validateStyleReference(request: GenerateRequest) {
  const style = getWholeHomeStyle(request.style);
  if (style) {
    if (request.templateId !== undefined && request.templateId !== style.id) throw new Error('模板与当前风格不一致，请重新选择风格模板。');
    if (request.referenceAssetId !== undefined && request.referenceAssetId !== style.reference.id) throw new Error('参考图不属于当前全屋风格，请重新选择风格模板。');
  } else if (request.referenceAssetId || request.templateId?.startsWith('whole-home-')) {
    throw new Error('未找到该全屋风格模板，请重新选择。');
  }
  return style;
}

async function floorPlanFlow(config: GatewayConfig, request: GenerateRequest, job?: GenerationJob) {
  if (!request.floorPlan) throw new Error('请先上传户型图。');
  const context: AiCallContext = { requestId: job?.requestId, operation: 'whole-home-generation' };
  updateGenerationJobIfPresent(job, { stage: 'plan-analysis', message: '正在分析户型结构。' });
  const analysis = request.analysis || await analyze(config, request.floorPlan, request.source === 'cad' ? 'cad' : 'floorplan', context);
  const rooms: IdentifiedRoom[] = request.rooms?.length ? request.rooms.slice(0, 20) : roomsFrom(analysis);
  const selectedNames = request.selectedRooms?.length ? new Set(request.selectedRooms) : new Set(rooms.map((room) => room.name));
  const selectedRooms = rooms.filter((room) => selectedNames.has(room.name));
  if (selectedRooms.length === 0) throw new Error('请至少选择一个需要生成的空间。');
  if (selectedRooms.some((room) => /^(空间|房间|区域)\s*\d+$/.test(room.name.trim()))) throw new Error('当前方案包含无法对应到具体房间的编号空间，请先确认房间名称后再生成。');
  const stylePrompts: Record<string, string> = {
    modern: 'Contemporary Chinese modern minimalist interior, warm ivory and light greige palette, pale oak and restrained walnut veneer, clean geometric lines, concealed storage, airy circulation, soft daylight, integrated linear lighting, realistic premium materials. No clutter, ornate details or dramatic colors.',
    song: 'Contemporary Chinese interior inspired by Song dynasty aesthetics: refined restraint, deep walnut lattice screen, warm grey-beige textured walls, handmade ceramic vessels, subtle ink art, asymmetrical sparse styling, generous negative space, natural tactile materials, soft amber light. Livable modern home, not a historical set. No palace decor or clutter.',
    smallAmerican: 'Compact small American classic interior: creamy raised-panel cabinetry, warm ivory walls, olive green upholstery, dark walnut floor, discreet aged brass hardware, built-in storage, balanced classic trim and restrained vintage accessories, warm natural light. Keep furniture practical and scaled to a small home; no excessive ornament.',
  };
  const libraryStyle = validateStyleReference(request);
  const stylePrompt = libraryStyle ? wholeHomePrompt(libraryStyle) : stylePrompts[request.style] || stylePrompts.modern;
  const styleReference = libraryStyle ? new Blob([await readFile(resolve(process.cwd(), 'public', `.${libraryStyle.reference.image}`))], { type: 'image/jpeg' }) : undefined;
  const common = `第一张输入图是完整户型结构依据，只用于确认全屋外轮廓、房间位置、方向、邻接关系、墙体、门窗和固定设施。若存在第二张输入图，它是目标空间的原始裁剪图，只用于确认该空间的局部墙体、门窗、固定设施和比例。${styleReference ? '最后一张输入图是风格参考图，只提取材质、配色、家具轮廓与光线，绝不能使用其户型结构。' : ''}所有结构输入图都必须服从原始户型图；若文字摘要与图片冲突，以图片中可见结构为准。识别结构摘要：${analysis}\n基于同一套住宅户型，保持${request.style}风格并统一材质色彩。${stylePrompt}\n用户补充偏好：${request.prompt || '无'}。${libraryStyle ? libraryStyle.negativePrompt : ''}不得移动、增删或合并墙体、门窗和房间，不得改变空间比例及房间连接；家具只放在对应房间可用区域内，不遮挡门窗和主要动线；不确定结构不要擅自补造。这是室内设计效果图，不是施工图；画面真实、完整、适合方案沟通。不要文字、水印或人物。`;
  if (!job?.cover) updateGenerationJobIfPresent(job, { analysis, totalRooms: selectedRooms.length, stage: 'cover-generation', message: '正在生成全屋总览。' });
  const cover = job?.cover ? { imageUrl: job.cover } : await edit(config, request.floorPlan, `${common}基于第一张完整户型图生成一张严格对应原户型布局的全屋俯视轴测室内效果图。保持原图上下左右方位和各房间相对位置，完整呈现各房间分隔与连接，不要改成新的户型，不要裁掉边缘空间。`, { ...context, stage: 'cover-generation' }, styleReference);
  updateGenerationJobIfPresent(job, { cover: cover.imageUrl, stage: 'room-generation', message: `全屋总览已完成，正在生成空间效果图（${job?.completedRooms || 0}/${job?.totalRooms || selectedRooms.length}）。` });
  const failures: string[] = [];
  const generatedRooms = await mapConcurrent(selectedRooms, 2, async (room) => {
    updateGenerationJobIfPresent(job, { stage: 'room-generation', message: `正在生成${room.name}效果图（已完成 ${job?.completedRooms || 0}/${selectedRooms.length}）。` });
    const reference = request.roomReferenceImages?.find((item) => item.name === room.name)?.image;
    const roomImages = reference ? [request.floorPlan!, reference] : [request.floorPlan!];
    const evidence = [room.description, room.evidence?.map((item) => `${item.type}: ${item.detail}`).join('；'), room.adjacentTo?.length ? `相邻空间：${room.adjacentTo.join('、')}` : '', room.confidence !== null && room.confidence !== undefined ? `识别置信度：${Math.round(room.confidence * 100)}%` : ''].filter(Boolean).join('；');
    const roomPrompt = `${common}本张只生成“${room.name}”这一个明确空间${room.suggestedName ? `（识别候选为${room.suggestedName}，功能尚未确认，按可见布局保守表达）` : ''}。第一张图用于确认该空间在全屋中的位置、方向和相邻关系，第二张图（如有）用于确认该空间原始墙体、门窗、固定设施和空间比例。不得生成全屋图、户型图、拼图或其他房间。不得新增、删除、移动或合并墙体、门窗和房间；不得生成楼梯、夹层、台阶、挑空、错层或高差；不得出现第二个目标空间、第二张床位区域、额外门洞或额外窗户；不得改变房间长宽比例和门窗开口位置。家具只能放入目标房间可用区域，不得穿过墙体、门洞或窗户。房间证据包：${evidence}。镜头为人在房间内部的室内摄影视角，视线高度约 1.5 米，自然广角不过度变形；清楚表现目标房间的墙面、地面、门窗、固定设施及合适家具。不得把相邻客餐厅合并；客厅突出沙发与电视主墙，餐厅突出餐桌椅，卧室突出床及床头背景，厨房突出橱柜与操作台，卫生间突出洁具与淋浴区。不得臆造证据包没有支持的门窗和固定结构。`;
    try {
      const generated = await edit(config, roomImages, roomPrompt, { ...context, stage: 'room-image' }, styleReference);
      updateGenerationJobIfPresent(job, { stage: 'room-review', message: `正在复核${room.name}效果图。` });
      const review = await reviewRoomImage(config, generated.imageUrl, room, { floorPlan: request.floorPlan, roomCrop: reference }, { ...context, stage: 'room-review' });
      const result = { ...room, imageUrl: generated.imageUrl, review };
      if (job) {
        job.rooms.push(result);
        updateGenerationJob(job, { completedRooms: job.rooms.length, message: `已完成 ${job.rooms.length}/${selectedRooms.length} 个空间效果图。` });
      }
      return result;
    } catch (error) {
      failures.push(`${room.name}：${error instanceof Error ? error.message : '生成失败'}`);
      if (job) job.failedRooms = [...(job.failedRooms || []), room.name];
      return null;
    }
  });
  const successfulRooms = generatedRooms.filter((room): room is NonNullable<typeof room> => room !== null);
  if (job) updateGenerationJob(job, { status: failures.length ? 'partial' : 'completed', stage: failures.length ? 'partial' : 'completed', message: failures.length ? `已完成 ${job.rooms.length}/${job.totalRooms} 个空间，部分空间失败。` : '全屋方案已生成完成。', error: failures.length ? `部分空间未完成：${failures.join('；')}` : undefined });
  return { type: 'floorplan', analysis, cover: cover.imageUrl, rooms: successfulRooms, ...(failures.length ? { warnings: failures } : {}) };
}

function updateGenerationJobIfPresent(job: GenerationJob | undefined, updates: Partial<GenerationJob>) {
  if (job) updateGenerationJob(job, updates);
}

async function analyzeFloorPlanRequest(config: GatewayConfig, request: AnalyzeRequest, requestId?: string) {
  if (!request.floorPlan) throw new Error('请先上传户型图。');
  const analysis = await analyze(config, request.floorPlan, request.source === 'cad' ? 'cad' : 'floorplan', { requestId, operation: 'floorplan-analysis' });
  return { analysis, rooms: roomsFrom(analysis) };
}

export function createAiGatewayPlugin(env: Record<string, string>): Plugin {
  const { creditLedger, holdCredits, refundHold, resolveIdentity, settleHold } = databaseCredits(env);
  const owners = new WeakMap<GenerationJob, string>();
  const timeoutValue = (name: string, fallback: number) => {
    const parsed = Number(env[name]);
    return Number.isFinite(parsed) && parsed >= 10_000 && parsed <= 600_000 ? parsed : fallback;
  };
  const config: GatewayConfig = {
    baseUrl: env.AI_BASE_URL || 'https://codex2api.com', apiKey: env.CODEX2API_API_KEY || env.AI_API_KEY || '', imageApiKey: env.AI_IMAGE_API_KEY,
    visionModel: env.AI_VISION_MODEL || env.AI_MODEL || 'gpt-6.1-sol', imageModel: env.AI_IMAGE_MODEL || env.IMAGE_MODEL || 'gpt-image-1',
    visionFallbackModels: (env.AI_VISION_FALLBACK_MODELS || '').split(',').map(model => model.trim()).filter(Boolean),
    analysisTotalTimeoutMs: timeoutValue('AI_ANALYSIS_TOTAL_TIMEOUT_MS', 300_000),
    analysisTimeoutMs: timeoutValue('AI_ANALYSIS_TIMEOUT_MS', DEFAULT_ANALYSIS_TIMEOUT_MS),
    reviewTimeoutMs: timeoutValue('AI_REVIEW_TIMEOUT_MS', DEFAULT_REVIEW_TIMEOUT_MS),
    imageTimeoutMs: timeoutValue('AI_IMAGE_TIMEOUT_MS', DEFAULT_IMAGE_TIMEOUT_MS),
  };
  const jobs = new Map<string, GenerationJob>();
  // Inputs are retained only while a partial job can be retried. Never return them from a status endpoint.
  const retryInputs = new Map<string, GenerateRequest>();
  const cleanup = () => {
    for (const [existingId, existing] of jobs) {
      if (existing.status !== 'running' && Date.now() - Date.parse(existing.updatedAt) > 60 * 60 * 1000) { jobs.delete(existingId); retryInputs.delete(existingId); }
    }
  };
  const cleanupTimer = setInterval(cleanup, 5 * 60 * 1000);
  cleanupTimer.unref();
  const gatewayMiddleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.method !== 'POST') return next();
    if (!config.apiKey) return sendJson(res, 500, { error: '未检测到 CODEX2API_API_KEY 或 AI_API_KEY。' });
    const identity = await resolveIdentity(req);
    if (!identity) return sendJson(res, 401, { error: '请先登录后再使用 AI 生成功能。' });
    try {
      const request = await readBody(req);
      try { validateStyleReference(request); } catch (error) {
        return sendJson(res, 400, { error: error instanceof Error ? error.message : '风格参考无效。' });
      }
      if (request.mode === 'photo') {
        const hold = await holdCredits(identity, CREDIT_COSTS.coverImage, '单张效果图生成');
        if (!hold.ok) return insufficient(res, hold);
        try {
          const result = await photoFlow(config, request, { requestId: crypto.randomUUID(), operation: 'photo-generation' });
          await settleHold(hold.holdId, CREDIT_COSTS.coverImage, '单张效果图生成');
          return sendJson(res, 200, result);
        } catch (error) {
          await refundHold(hold.holdId);
          throw error;
        }
      }
      cleanup();
      if ([...jobs.values()].filter((job) => job.status === 'running').length >= 2) return sendJson(res, 429, { error: '当前生成任务较多，请稍后重试。' });
      if (jobs.size >= 8) {
        const oldest = [...jobs.values()].filter((job) => job.status !== 'running').sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))[0];
        if (oldest) { jobs.delete(oldest.id); retryInputs.delete(oldest.id); }
      }
      const requestId = crypto.randomUUID();
      const id = typeof request.taskId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.taskId) ? request.taskId : crypto.randomUUID();
      const job: GenerationJob = { id, requestId, status: 'queued', stage: 'queued', message: '请求已进入生成队列。', completedRooms: 0, totalRooms: request.selectedRooms?.length || request.rooms?.length || 0, rooms: [], updatedAt: new Date().toISOString() };
      const roomCost = job.totalRooms * CREDIT_COSTS.roomImage;
      const hold = await holdCredits(identity, CREDIT_COSTS.coverImage + roomCost, `全屋方案生成（封面+${job.totalRooms}个空间）`, id);
      if (!hold.ok) return insufficient(res, hold);
      owners.set(job, identity.userId);
      jobs.set(id, job);
      logAiEvent({ event: 'workflow_started', requestId, jobId: id, operation: 'whole-home-generation', stage: 'queued', model: config.imageModel, inputImageBytes: request.floorPlan ? imageByteLength(request.floorPlan) : 0, imageMeta: safeImageMeta(request.imageMeta), roomCount: job.totalRooms });
      sendJson(res, 202, { jobId: id, requestId });
      job.status = 'running';
      void floorPlanFlow(config, request, job).then(async () => {
        if (job.status !== 'partial') retryInputs.delete(id);
        else retryInputs.set(id, request);
        const consumed = (job.cover ? CREDIT_COSTS.coverImage : 0) + job.completedRooms * CREDIT_COSTS.roomImage;
        await settleHold(hold.holdId, consumed, '全屋方案生成结算');
        logAiEvent({ event: 'workflow_finished', requestId, jobId: id, operation: 'whole-home-generation', status: job.status, completedRooms: job.completedRooms, totalRooms: job.totalRooms });
      }).catch(async (error: unknown) => {
        const message = error instanceof Error ? error.message : 'AI 生成失败，请稍后重试。';
        const failedStage = job.stage;
        await refundHold(hold.holdId);
        updateGenerationJob(job, { status: 'failed', stage: 'failed', message: job.cover ? '生成中断，已保留全屋总览和已完成空间。' : '生成失败。', error: message });
        logAiEvent({ event: 'workflow_finished', requestId, jobId: id, operation: 'whole-home-generation', status: 'failed', failedStage, completedRooms: job.completedRooms, totalRooms: job.totalRooms });
      });
    } catch (error) {
      sendJson(res, 502, { error: error instanceof Error ? error.message : 'AI 生成失败，请稍后重试。' });
    }
  };
  const jobMiddleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.method !== 'GET' && req.method !== 'POST') return next();
    const path = (req.url || '').split('?')[0].replace(/^\/+/, '');
    const isRetry = path.endsWith('/retry');
    const id = isRetry ? path.slice(0, -'/retry'.length) : path;
    const job = jobs.get(id);
    if (!job) return sendJson(res, 404, { error: '生成任务不存在或已过期。' });
    const viewer = await resolveIdentity(req);
    if (!viewer || owners.get(job) !== viewer.userId) return sendJson(res, 404, { error: '任务不存在' });
    if (isRetry && req.method === 'POST') {
      const identity = viewer;
      if (!identity) return sendJson(res, 401, { error: '请先登录后再使用 AI 生成功能。' });
      const original = retryInputs.get(id);
      if (job.status !== 'partial' || !original || !job.failedRooms?.length) return sendJson(res, 409, { error: '该任务没有可重试的失败空间。' });
      const failedRooms = job.failedRooms;
      const hold = await holdCredits(identity, failedRooms.length * CREDIT_COSTS.roomImage, `重试 ${failedRooms.length} 个失败空间`, `${id}:retry:${crypto.randomUUID()}`);
      if (!hold.ok) return insufficient(res, hold);
      retryInputs.delete(id);
      updateGenerationJob(job, { status: 'running', stage: 'room-generation', message: `正在重试 ${failedRooms.length} 个失败空间。`, failedRooms: [], error: undefined });
      sendJson(res, 202, { jobId: id, requestId: job.requestId });
      void floorPlanFlow(config, { ...original, analysis: job.analysis, selectedRooms: failedRooms }, job).then(async () => {
        if (job.status === 'partial') retryInputs.set(id, original);
        const succeeded = failedRooms.length - (job.failedRooms?.length ?? 0);
        await settleHold(hold.holdId, succeeded * CREDIT_COSTS.roomImage, '空间重试结算');
        logAiEvent({ event: 'workflow_retry_finished', requestId: job.requestId, jobId: id, status: job.status, completedRooms: job.completedRooms, totalRooms: job.totalRooms });
      }).catch(async (error: unknown) => {
        retryInputs.set(id, original);
        await refundHold(hold.holdId);
        updateGenerationJob(job, { status: 'partial', stage: 'partial', message: '重试失败，已完成结果仍可查看。', failedRooms, error: error instanceof Error ? error.message : '重试失败' });
      });
      return;
    }
    if (req.method !== 'GET' || isRetry) return next();
    const query = new URL(req.url || '/', 'http://localhost').searchParams;
    if (query.get('summary') === '1') {
      const afterRooms = Math.max(0, Number(query.get('afterRooms')) || 0);
      const includeCover = query.get('includeCover') === '1';
      return sendJson(res, 200, {
        id: job.id, requestId: job.requestId, status: job.status, stage: job.stage, message: job.message,
        completedRooms: job.completedRooms, totalRooms: job.totalRooms, coverReady: Boolean(job.cover),
        completedRoomNames: job.rooms.map((room) => room.name), failedRooms: job.failedRooms, cover: includeCover ? job.cover : undefined,
        rooms: job.rooms.slice(afterRooms), error: job.error, updatedAt: job.updatedAt,
      });
    }
    sendJson(res, 200, job);
  };
  const roomEditMiddleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.method !== 'POST') return next();
    if (!config.apiKey) return sendJson(res, 500, { error: '未检测到 CODEX2API_API_KEY 或 AI_API_KEY。' });
    const identity = await resolveIdentity(req);
    if (!identity) return sendJson(res, 401, { error: '请先登录后再使用 AI 生成功能。' });
    const requestId = crypto.randomUUID();
    const hold = await holdCredits(identity, CREDIT_COSTS.roomEdit, '局部方案编辑');
    if (!hold.ok) return insufficient(res, hold);
    try { sendJson(res, 200, await editRoomImageRequest(config, await readBody(req) as RoomImageEditRequest, { requestId })); await settleHold(hold.holdId, CREDIT_COSTS.roomEdit, '局部方案编辑'); }
    catch (error) {
      await refundHold(hold.holdId);
      console.error('Room image edit request failed:', error instanceof Error ? error.message : error);
      sendJson(res, 502, { error: error instanceof Error ? error.message : '局部编辑失败，请稍后重试。' });
    }
  };
  const analyzeMiddleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.method !== 'POST') return next();
    if (!config.apiKey) return sendJson(res, 500, { error: '未检测到 CODEX2API_API_KEY 或 AI_API_KEY。' });
    const identity = await resolveIdentity(req);
    if (!identity) return sendJson(res, 401, { error: '请先登录后再使用 AI 生成功能。' });
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    const hold = await holdCredits(identity, CREDIT_COSTS.floorplanAnalysis, '户型图识别分析');
    if (!hold.ok) return insufficient(res, hold);
    try {
      const request = await readBody(req) as AnalyzeRequest;
      logAiEvent({ event: 'workflow_started', requestId, operation: 'floorplan-analysis', stage: 'plan-analysis', model: config.visionModel, inputImageBytes: request.floorPlan ? imageByteLength(request.floorPlan) : 0, imageMeta: safeImageMeta(request.imageMeta), source: request.source || 'floorplan' });
      const result = await analyzeFloorPlanRequest(config, request, requestId);
      await settleHold(hold.holdId, CREDIT_COSTS.floorplanAnalysis, '户型图识别分析');
      logAiEvent({ event: 'workflow_finished', requestId, operation: 'floorplan-analysis', status: 'completed', durationMs: Date.now() - startedAt, roomCount: result.rooms.length });
      sendJson(res, 200, result);
    } catch (error) {
      await refundHold(hold.holdId);
      logAiEvent({ event: 'workflow_finished', requestId, operation: 'floorplan-analysis', status: 'failed', durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : 'unknown' });
      sendJson(res, 502, { error: error instanceof Error ? error.message : '户型识别失败，请稍后重试。', requestId });
    }
  };
  // 发布门禁：免费审查，不消耗积分。未配置密钥时拒绝（宁缺勿滥）。
  const validateShowcaseMiddleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.method !== 'POST') return next();
    if (!config.apiKey) return sendJson(res, 503, { error: '内容审查服务未配置（缺少 CODEX2API_API_KEY），暂时无法发布方案。' });
    const identity = await resolveIdentity(req);
    if (!identity) return sendJson(res, 401, { error: '请先登录后再发布方案。' });
    const requestId = crypto.randomUUID();
    try {
      const body = await readBody<{ image?: string }>(req);
      if (!body.image || !body.image.startsWith('data:image/')) return sendJson(res, 400, { error: '缺少有效的方案图片。' });
      const review = await classifyShowcaseImage(config, body.image, { requestId });
      if (review.category === 'other') return sendJson(res, 422, { category: review.category, reason: review.reason, error: `图片未通过初审：${review.reason}。请上传家居实景图、装修效果图或户型图。` });
      sendJson(res, 200, review);
    } catch (error) {
      console.error('Showcase review failed:', error instanceof Error ? error.message : error);
      sendJson(res, 502, { error: error instanceof Error ? error.message : '图片审查失败，请稍后重试。', requestId });
    }
  };
  const creditsMiddleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = (req.url || '').split('?')[0].replace(/^\/+/, '');
    const identity = await resolveIdentity(req);
    if (!identity) return sendJson(res, 401, { error: '请先登录后查看积分信息。' });
    if (req.method === 'GET' && (path === 'summary' || path === 'ledger')) {
      const ledger = await creditLedger(identity);
      return sendJson(res, 200, path === 'summary' ? ledger.summary : ledger);
    }
    if (req.method === 'POST' && path === 'purchase') return sendJson(res, 409, { error: '尚未开通真实支付，不会扣款或发放积分。' });
    next();
  };
  const install = (server: { middlewares: { use: (path: string, handler: (...args: any[]) => void) => void } }) => {
    const safe = (fn: typeof gatewayMiddleware) => (req: IncomingMessage, res: ServerResponse, next: () => void) => { void fn(req, res, next).catch(() => { if (!res.headersSent) sendJson(res, 503, { error: '服务暂不可用，请稍后重试。' }); }); };
    server.middlewares.use('/api/ai/generate', safe(gatewayMiddleware));
    server.middlewares.use('/api/ai/generation-jobs', safe(jobMiddleware));
    server.middlewares.use('/api/ai/edit-room-image', safe(roomEditMiddleware));
    server.middlewares.use('/api/ai/analyze-floorplan', safe(analyzeMiddleware));
    server.middlewares.use('/api/ai/validate-showcase', safe(validateShowcaseMiddleware));
    server.middlewares.use('/api/credits', safe(creditsMiddleware));
  };
  return {
    name: 'ai-decoration-gateway',
    configureServer: install,
    configurePreviewServer: install,
  };
}
