import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

export type GatewayConfig = { baseUrl: string; apiKey: string; visionModel: string; imageModel: string; analysisTimeoutMs?: number; reviewTimeoutMs?: number; imageTimeoutMs?: number };
type RoomBounds = { x: number; y: number; width: number; height: number };
type RoomEvidence = { type: string; detail: string };
type IdentifiedRoom = { id?: string; name: string; description: string; suggestedName?: string; confidence?: number | null; status?: 'confirmed' | 'identified' | 'unknown'; evidence?: RoomEvidence[]; adjacentTo?: string[]; bounds?: RoomBounds | null };
type PlanImageMeta = { sourceWidth: number; sourceHeight: number; sentWidth: number; sentHeight: number; sourceBytes: number };
type GenerateRequest = { mode: 'photo' | 'floorplan'; style: string; prompt?: string; photo?: string; floorPlan?: string; imageMeta?: PlanImageMeta; photos?: string[]; source?: 'cad' | 'floorplan'; analysis?: string; rooms?: IdentifiedRoom[]; selectedRooms?: string[]; roomReferenceImages?: { name: string; image: string }[]; taskId?: string };
type AnalyzeRequest = { floorPlan?: string; imageMeta?: PlanImageMeta; source?: 'cad' | 'floorplan' };
type RoomImageEditRequest = { image?: string; mask?: string; instruction?: string; roomName?: string; style?: string };
type ImageResult = { imageUrl: string };
type AiCallContext = { requestId?: string; operation?: string; stage?: string; model?: string; inputImageBytes?: number };
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
const DEFAULT_ANALYSIS_TIMEOUT_MS = 90_000;
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
  if (typeof item?.url === 'string') return item.url;
  if (typeof item?.b64_json === 'string') {
    const mime = item.b64_json.startsWith('/9j/')
      ? 'image/jpeg'
      : item.b64_json.startsWith('iVBORw0KGgo')
        ? 'image/png'
        : item.b64_json.startsWith('UklGR')
          ? 'image/webp'
          : 'image/png';
    return `data:${mime};base64,${item.b64_json}`;
  }
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
  const maxAttempts = !isImageRequest ? 2 : 1;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptStartedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let status: number | undefined;
    let upstreamRequestId: string | undefined;
    try {
      const response = await fetch(`${baseUrl(config.baseUrl)}/v1${path}`, {
        ...init,
        signal: controller.signal,
        headers: { Authorization: `Bearer ${config.apiKey}`, ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...init.headers },
      });
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
      const retryableStatus = error instanceof UpstreamError && [408, 429, 502, 503, 504, 524].includes(error.status);
      const retryableNetwork = !(error instanceof UpstreamError) && !(error instanceof Error && error.name === 'AbortError');
      if (attempt < maxAttempts && (retryableStatus || retryableNetwork)) {
        logAiEvent({ event: 'upstream_retry', requestId, operation: context.operation || 'unspecified', stage: context.stage || path, path, model: context.model, inputImageBytes, attempt, status, upstreamRequestId, attemptDurationMs: Date.now() - attemptStartedAt, durationMs: Date.now() - startedAt, reason: retryableStatus ? `http_${error instanceof UpstreamError ? error.status : 'error'}` : 'network_error' });
        await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
        continue;
      }
      logAiEvent({ event: 'upstream_request', requestId, operation: context.operation || 'unspecified', stage: context.stage || path, path, model: context.model, inputImageBytes, attempt, status, upstreamRequestId, attemptDurationMs: Date.now() - attemptStartedAt, durationMs: Date.now() - startedAt, outcome: error instanceof Error && error.name === 'AbortError' ? 'local_timeout' : 'failure' });
      if (error instanceof Error && error.name === 'AbortError') throw new Error(`${context.stage === 'room-review' ? '效果图复核' : isImageRequest ? '图片生成' : 'AI 分析'}请求超过 ${timeoutMs / 1000} 秒，本次步骤未完成。`);
      if (error instanceof UpstreamError) throw error;
      throw new Error(`上游接口连接失败：${error instanceof Error ? error.message : '未知网络错误'}`);
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
  const payload = await callApi(config, '/chat/completions', { method: 'POST', body: JSON.stringify({ model: config.visionModel, temperature: 0.2, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: image, detail: 'high' } }] }] }) }, { ...context, operation: context.operation || 'analysis', stage, model: config.visionModel, inputImageBytes: imageByteLength(image) });
  return textFrom(payload);
}

function roomsFrom(text: string): IdentifiedRoom[] {
  let parsed: any;
  try {
    parsed = JSON.parse(text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim());
  } catch { /* Fall through to an explicit model-output error. */ }
  if (Array.isArray(parsed?.rooms) && parsed.rooms.length > 0) {
    const rooms: IdentifiedRoom[] = parsed.rooms.slice(0, 20).map((room: any, index: number) => {
      const candidate = String(room?.name || '').trim();
      const evidence: RoomEvidence[] = Array.isArray(room?.evidence) ? room.evidence.slice(0, 12).map((item: any) => ({ type: String(item?.type || 'geometry'), detail: String(item?.detail || '').trim() })).filter((item: RoomEvidence) => item.detail) : [];
      const labelEvidence = evidence.some((item) => item.type === 'label');
      const suiteEvidence = evidence.some((item) => item.type === 'adjacency' && /(套卫|主卫|衣帽间|套间)/.test(item.detail));
      const unsupportedBedroomRank = /^(主卧|次卧|主人房|主卧室|次卧室)$/.test(candidate) && !labelEvidence && !suiteEvidence;
      const unsupportedBathroom = /^(卫生间|主卫|次卫|公卫)$/.test(candidate) && !labelEvidence && !evidence.some((item) => item.type === 'fixture' && /(洁具|马桶|坐便|洗手盆|淋浴|地漏|排水)/.test(item.detail));
      const uncertain = unsupportedBedroomRank || unsupportedBathroom || !candidate || /^(空间|房间|区域)\s*\d+$/.test(candidate);
      const rawBounds = room?.bounds;
      const bounds = rawBounds && ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(rawBounds[key])) && rawBounds.x >= 0 && rawBounds.y >= 0 && rawBounds.width > 0 && rawBounds.height > 0 && rawBounds.x + rawBounds.width <= 1.001 && rawBounds.y + rawBounds.height <= 1.001
        ? { x: rawBounds.x, y: rawBounds.y, width: rawBounds.width, height: rawBounds.height }
        : null;
      const location = evidence.find((item) => item.type === 'geometry')?.detail || '位置待核对';
      return {
        id: String(room?.id || `room_${index + 1}`),
        name: uncertain ? `待确认房间（${location}）` : candidate,
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
async function edit(config: GatewayConfig, image: string, prompt: string, context: AiCallContext = {}): Promise<ImageResult> {
  const form = new FormData();
  const source = imageBlob(image);
  const extension = source.type === 'image/jpeg' ? 'jpg' : source.type === 'image/webp' ? 'webp' : 'png';
  form.append('model', config.imageModel); form.append('prompt', prompt); form.append('n', '1'); form.append('size', '1024x1024'); form.append('response_format', 'b64_json'); form.append('image', source, `floorplan.${extension}`);
  const payload = await callApi(config, '/images/edits', { method: 'POST', body: form }, { ...context, model: config.imageModel, inputImageBytes: imageByteLength(image) });
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

async function reviewRoomImage(config: GatewayConfig, image: string, room: IdentifiedRoom, context: AiCallContext = {}) {
  try {
    const payload = await callApi(config, '/chat/completions', { method: 'POST', body: JSON.stringify({
      model: config.visionModel, temperature: 0, messages: [{ role: 'user', content: [
        { type: 'text', text: `核对这张生成的室内效果图是否与目标房间一致。目标空间：${room.name}${room.suggestedName ? `（候选：${room.suggestedName}）` : ''}。户型依据：${room.description}。可见证据：${(room.evidence || []).map((item) => item.detail).join('；') || '无结构化证据'}。只核对房间功能是否明显错配、画面是否出现多个房间/全屋俯视图；不评价审美，也不要推断被遮挡结构。严格输出 JSON：{"status":"pass|check","note":"简短中文说明"}。` },
        { type: 'image_url', image_url: { url: image, detail: 'low' } },
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
  const stylePrompt = stylePrompts[request.style] || stylePrompts.modern;
  const common = `以下附带的原始户型图是本次生成的首要几何参考，必须以图像中可见的外轮廓、墙体走向、房间位置与邻接、门窗开口、阳台和固定设施为准。识别结构摘要：${analysis}\n基于同一套住宅户型，保持${request.style}风格并统一材质色彩。${stylePrompt}\n用户补充偏好：${request.prompt || '无'}。不得移动、增删或合并墙体、门窗和房间，不得改变空间比例及房间连接；家具只放在对应房间可用区域内，不遮挡门窗和主要动线。若文字摘要与原图冲突，以原图可见结构为准；不确定结构不要擅自补造。这是室内设计效果图，不是施工图；画面真实、完整、适合方案沟通。不要文字、水印或人物。`;
  if (!job?.cover) updateGenerationJobIfPresent(job, { analysis, totalRooms: selectedRooms.length, stage: 'cover-generation', message: '正在生成全屋总览。' });
  const cover = job?.cover ? { imageUrl: job.cover } : await edit(config, request.floorPlan, `${common}基于原图生成一张严格对应原户型布局的全屋俯视轴测室内效果图。保持原图上下左右方位和各房间相对位置，完整呈现各房间分隔与连接，不要改成新的户型，不要裁掉边缘空间。`, { ...context, stage: 'cover-generation' });
  updateGenerationJobIfPresent(job, { cover: cover.imageUrl, stage: 'room-generation', message: `全屋总览已完成，正在生成空间效果图（${job?.completedRooms || 0}/${job?.totalRooms || selectedRooms.length}）。` });
  const failures: string[] = [];
  const generatedRooms = await mapConcurrent(selectedRooms, 2, async (room) => {
    updateGenerationJobIfPresent(job, { stage: 'room-generation', message: `正在生成${room.name}效果图（已完成 ${job?.completedRooms || 0}/${selectedRooms.length}）。` });
    const reference = request.roomReferenceImages?.find((item) => item.name === room.name)?.image || request.floorPlan!;
    const evidence = [room.description, room.evidence?.map((item) => `${item.type}: ${item.detail}`).join('；'), room.adjacentTo?.length ? `相邻空间：${room.adjacentTo.join('、')}` : '', room.confidence !== null && room.confidence !== undefined ? `识别置信度：${Math.round(room.confidence * 100)}%` : ''].filter(Boolean).join('；');
    const roomPrompt = `${common}本张只生成“${room.name}”这一个明确空间${room.suggestedName ? `（识别候选为${room.suggestedName}，功能尚未确认，按可见布局保守表达）` : ''}，不能生成全屋图、户型图、拼图或其他房间。房间证据包：${evidence}。如输入图为“全图+房间局部放大”的参考板，左侧用于确认户型方位和邻接，右侧用于读取目标空间边界与设施，二者都是参考而不是最终构图模板。镜头为人在房间内部的室内摄影视角，视线高度约 1.5 米，自然广角不过度变形；清楚表现目标房间的墙面、地面、门窗、固定设施及合适家具。不得把相邻客餐厅合并；客厅突出沙发与电视主墙，餐厅突出餐桌椅，卧室突出床及床头背景，厨房突出橱柜与操作台，卫生间突出洁具与淋浴区。不得臆造证据包没有支持的门窗和固定结构。`;
    try {
      const generated = await edit(config, reference, roomPrompt, { ...context, stage: 'room-image' });
      updateGenerationJobIfPresent(job, { stage: 'room-review', message: `正在复核${room.name}效果图。` });
      const review = await reviewRoomImage(config, generated.imageUrl, room, { ...context, stage: 'room-review' });
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
  const timeoutValue = (name: string, fallback: number) => {
    const parsed = Number(env[name]);
    return Number.isFinite(parsed) && parsed >= 10_000 && parsed <= 600_000 ? parsed : fallback;
  };
  const config: GatewayConfig = {
    baseUrl: env.AI_BASE_URL || 'https://codex2api.com', apiKey: env.CODEX2API_API_KEY || env.AI_API_KEY || '',
    visionModel: env.AI_VISION_MODEL || env.AI_MODEL || 'gpt-6.1-sol', imageModel: env.AI_IMAGE_MODEL || env.IMAGE_MODEL || 'gpt-image-1',
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
    try {
      const request = await readBody(req);
      if (request.mode === 'photo') return sendJson(res, 200, await photoFlow(config, request, { requestId: crypto.randomUUID(), operation: 'photo-generation' }));
      cleanup();
      if ([...jobs.values()].filter((job) => job.status === 'running').length >= 2) return sendJson(res, 429, { error: '当前生成任务较多，请稍后重试。' });
      if (jobs.size >= 8) {
        const oldest = [...jobs.values()].filter((job) => job.status !== 'running').sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))[0];
        if (oldest) { jobs.delete(oldest.id); retryInputs.delete(oldest.id); }
      }
      const requestId = crypto.randomUUID();
      const id = typeof request.taskId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.taskId) ? request.taskId : crypto.randomUUID();
      const job: GenerationJob = { id, requestId, status: 'queued', stage: 'queued', message: '请求已进入生成队列。', completedRooms: 0, totalRooms: request.selectedRooms?.length || request.rooms?.length || 0, rooms: [], updatedAt: new Date().toISOString() };
      jobs.set(id, job);
      logAiEvent({ event: 'workflow_started', requestId, jobId: id, operation: 'whole-home-generation', stage: 'queued', model: config.imageModel, inputImageBytes: request.floorPlan ? imageByteLength(request.floorPlan) : 0, imageMeta: safeImageMeta(request.imageMeta), roomCount: job.totalRooms });
      sendJson(res, 202, { jobId: id, requestId });
      job.status = 'running';
      void floorPlanFlow(config, request, job).then(() => {
        if (job.status !== 'partial') retryInputs.delete(id);
        else retryInputs.set(id, request);
        logAiEvent({ event: 'workflow_finished', requestId, jobId: id, operation: 'whole-home-generation', status: job.status, completedRooms: job.completedRooms, totalRooms: job.totalRooms });
      }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'AI 生成失败，请稍后重试。';
        const failedStage = job.stage;
        updateGenerationJob(job, { status: 'failed', stage: 'failed', message: job.cover ? '生成中断，已保留全屋总览和已完成空间。' : '生成失败。', error: message });
        logAiEvent({ event: 'workflow_finished', requestId, jobId: id, operation: 'whole-home-generation', status: 'failed', failedStage, completedRooms: job.completedRooms, totalRooms: job.totalRooms });
      });
    } catch (error) {
      sendJson(res, 502, { error: error instanceof Error ? error.message : 'AI 生成失败，请稍后重试。' });
    }
  };
  const jobMiddleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.method !== 'GET' && req.method !== 'POST') return next();
    const path = (req.url || '').split('?')[0].replace(/^\/+/, '');
    const isRetry = path.endsWith('/retry');
    const id = isRetry ? path.slice(0, -'/retry'.length) : path;
    const job = jobs.get(id);
    if (!job) return sendJson(res, 404, { error: '生成任务不存在或已过期。' });
    if (isRetry && req.method === 'POST') {
      const original = retryInputs.get(id);
      if (job.status !== 'partial' || !original || !job.failedRooms?.length) return sendJson(res, 409, { error: '该任务没有可重试的失败空间。' });
      const failedRooms = job.failedRooms;
      retryInputs.delete(id);
      updateGenerationJob(job, { status: 'running', stage: 'room-generation', message: `正在重试 ${failedRooms.length} 个失败空间。`, failedRooms: [], error: undefined });
      sendJson(res, 202, { jobId: id, requestId: job.requestId });
      void floorPlanFlow(config, { ...original, analysis: job.analysis, selectedRooms: failedRooms }, job).then(() => {
        if (job.status === 'partial') retryInputs.set(id, original);
        logAiEvent({ event: 'workflow_retry_finished', requestId: job.requestId, jobId: id, status: job.status, completedRooms: job.completedRooms, totalRooms: job.totalRooms });
      }).catch((error: unknown) => {
        retryInputs.set(id, original);
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
    const requestId = crypto.randomUUID();
    try { sendJson(res, 200, await editRoomImageRequest(config, await readBody(req) as RoomImageEditRequest, { requestId })); }
    catch (error) {
      console.error('Room image edit request failed:', error instanceof Error ? error.message : error);
      sendJson(res, 502, { error: error instanceof Error ? error.message : '局部编辑失败，请稍后重试。' });
    }
  };
  const analyzeMiddleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.method !== 'POST') return next();
    if (!config.apiKey) return sendJson(res, 500, { error: '未检测到 CODEX2API_API_KEY 或 AI_API_KEY。' });
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    try {
      const request = await readBody(req) as AnalyzeRequest;
      logAiEvent({ event: 'workflow_started', requestId, operation: 'floorplan-analysis', stage: 'plan-analysis', model: config.visionModel, inputImageBytes: request.floorPlan ? imageByteLength(request.floorPlan) : 0, imageMeta: safeImageMeta(request.imageMeta), source: request.source || 'floorplan' });
      const result = await analyzeFloorPlanRequest(config, request, requestId);
      logAiEvent({ event: 'workflow_finished', requestId, operation: 'floorplan-analysis', status: 'completed', durationMs: Date.now() - startedAt, roomCount: result.rooms.length });
      sendJson(res, 200, result);
    } catch (error) {
      logAiEvent({ event: 'workflow_finished', requestId, operation: 'floorplan-analysis', status: 'failed', durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : 'unknown' });
      sendJson(res, 502, { error: error instanceof Error ? error.message : '户型识别失败，请稍后重试。', requestId });
    }
  };
  const install = (server: { middlewares: { use: (path: string, handler: (...args: any[]) => void) => void } }) => {
    server.middlewares.use('/api/ai/generate', gatewayMiddleware);
    server.middlewares.use('/api/ai/generation-jobs', jobMiddleware);
    server.middlewares.use('/api/ai/edit-room-image', roomEditMiddleware);
    server.middlewares.use('/api/ai/analyze-floorplan', analyzeMiddleware);
  };
  return {
    name: 'ai-decoration-gateway',
    configureServer: install,
    configurePreviewServer: install,
  };
}
