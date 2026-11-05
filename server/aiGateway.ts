import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

export type GatewayConfig = { baseUrl: string; apiKey: string; visionModel: string; imageModel: string };
type RoomBounds = { x: number; y: number; width: number; height: number };
type RoomEvidence = { type: string; detail: string };
type IdentifiedRoom = { id?: string; name: string; description: string; suggestedName?: string; confidence?: number | null; status?: 'confirmed' | 'identified' | 'unknown'; evidence?: RoomEvidence[]; adjacentTo?: string[]; bounds?: RoomBounds | null };
type GenerateRequest = { mode: 'photo' | 'floorplan'; style: string; prompt?: string; photo?: string; floorPlan?: string; photos?: string[]; source?: 'cad' | 'floorplan'; analysis?: string; rooms?: IdentifiedRoom[]; selectedRooms?: string[]; roomReferenceImages?: { name: string; image: string }[] };
type AnalyzeRequest = { floorPlan?: string; source?: 'cad' | 'floorplan' };
type ImageResult = { imageUrl: string };

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
const ANALYSIS_TIMEOUT_MS = 120_000;
const IMAGE_TIMEOUT_MS = 180_000;
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

export async function callApi(config: GatewayConfig, path: string, init: RequestInit) {
  const controller = new AbortController();
  const isImageRequest = path.startsWith('/images/');
  const timeoutMs = isImageRequest ? IMAGE_TIMEOUT_MS : ANALYSIS_TIMEOUT_MS;
  const startedAt = Date.now();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl(config.baseUrl)}/v1${path}`, {
      ...init,
      signal: controller.signal,
      headers: { Authorization: `Bearer ${config.apiKey}`, ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...init.headers },
    });
    const raw = await response.text();
    let payload: any;
    try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { raw }; }
    if (!response.ok) throw new Error(`上游接口返回 ${response.status}：${payload?.error?.message || payload?.message || raw || '未提供错误详情'}`);
    return payload;
  } catch (error) {
    console.error(`[AI gateway] ${path} failed after ${Date.now() - startedAt}ms:`, error instanceof Error ? error.message : error);
    if (error instanceof Error && error.name === 'AbortError') throw new Error(`${isImageRequest ? '图片生成' : 'AI 分析'}上游接口请求超时（${timeoutMs / 1000} 秒），请稍后重试。`);
    if (error instanceof Error && error.message.startsWith('上游接口返回')) throw error;
    throw new Error(`上游接口连接失败：${error instanceof Error ? error.message : '未知网络错误'}`);
  } finally {
    clearTimeout(timeout);
  }
}

export async function analyze(config: GatewayConfig, image: string, mode: 'photo' | 'floorplan' | 'cad') {
  const instruction = mode === 'photo'
    ? '分析这张现场毛坯空间照片。用简洁中文描述空间类型、现有结构、采光、主要墙面地面和不可移动元素，供室内效果图生成使用。不要虚构看不见的结构。'
    : mode === 'cad'
      ? '分析这张 CAD 导出的住宅平面图。识别可见墙体边界、门窗、标注、空间名称、固定设施及邻接关系，忽略图框，不得凭面积臆测功能。只输出严格 JSON，包含 rooms、walls、openings、connections、uncertainties。rooms 项包含 id、name、description、confidence、status、evidence、adjacentTo、bounds。evidence 是可见证据数组，每项为 {type:"label|fixture|adjacency|geometry",detail:"图上看到的具体依据"}；不确定的证据不得写成事实。bounds 是该房间在原图中的归一化矩形 {x,y,width,height}，左上为原点，值在 0 到 1，仅在边界可辨时返回，否则为 null；不要伪造坐标。主卧/次卧仅在房间标注或明确套卫/衣帽间关系支持时使用，否则 name 写“待确认房间（方位/特征）”，候选名称放入 suggestedName。卫生间需有洁具/排水设施或图面文字证据。confidence 为 0 到 1；status 只能 confirmed、identified、unknown；最多 20 个空间。walls、openings、connections 尽量按可见证据列出，不确定写入 uncertainties。'
      : '分析这张住宅户型图。严格依据图面识别全部可辨空间、墙体、门窗开口、固定设施、邻接和主要动线，不清晰内容列入 uncertainties，不得猜测尺寸或结构。只输出严格 JSON，包含 rooms、walls、openings、connections、circulation、uncertainties。rooms 项包含 id、name、description、confidence、status、evidence、adjacentTo、bounds。evidence 是可见证据数组，每项为 {type:"label|fixture|adjacency|geometry",detail:"图上看到的具体依据"}。bounds 是房间在原图中的归一化矩形 {x,y,width,height}，左上为原点、值在 0 到 1，只在边界清楚时给出，否则 null，禁止估算坐标。主卧/次卧仅在房间文字标注或明确套卫/衣帽间关系支持时使用，否则 name 写“待确认房间（方位/特征）”，候选名称放入 suggestedName；不得只凭面积/采光命名。卫生间需有洁具/排水设施或文字证据。房间名称不得使用编号占位；confidence 为 0 到 1，status 只能 confirmed、identified、unknown；最多 20 个空间。';
  const payload = await callApi(config, '/chat/completions', { method: 'POST', body: JSON.stringify({ model: config.visionModel, temperature: 0.2, messages: [{ role: 'user', content: [{ type: 'text', text: instruction }, { type: 'image_url', image_url: { url: image, detail: 'high' } }] }] }) });
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

export async function generate(config: GatewayConfig, prompt: string): Promise<ImageResult> {
  const payload = await callApi(config, '/images/generations', { method: 'POST', body: JSON.stringify({ model: config.imageModel, prompt, n: 1, size: '1024x1024', response_format: 'b64_json' }) });
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
async function edit(config: GatewayConfig, image: string, prompt: string): Promise<ImageResult> {
  const form = new FormData();
  const source = imageBlob(image);
  const extension = source.type === 'image/jpeg' ? 'jpg' : source.type === 'image/webp' ? 'webp' : 'png';
  form.append('model', config.imageModel); form.append('prompt', prompt); form.append('n', '1'); form.append('size', '1024x1024'); form.append('response_format', 'b64_json'); form.append('image', source, `floorplan.${extension}`);
  const payload = await callApi(config, '/images/edits', { method: 'POST', body: form });
  const imageUrl = imageFrom(payload);
  if (!imageUrl) throw new Error('图片编辑接口没有返回图片。');
  return { imageUrl };
}

async function reviewRoomImage(config: GatewayConfig, image: string, room: IdentifiedRoom) {
  try {
    const payload = await callApi(config, '/chat/completions', { method: 'POST', body: JSON.stringify({
      model: config.visionModel, temperature: 0, messages: [{ role: 'user', content: [
        { type: 'text', text: `核对这张生成的室内效果图是否与目标房间一致。目标空间：${room.name}${room.suggestedName ? `（候选：${room.suggestedName}）` : ''}。户型依据：${room.description}。可见证据：${(room.evidence || []).map((item) => item.detail).join('；') || '无结构化证据'}。只核对房间功能是否明显错配、画面是否出现多个房间/全屋俯视图；不评价审美，也不要推断被遮挡结构。严格输出 JSON：{"status":"pass|check","note":"简短中文说明"}。` },
        { type: 'image_url', image_url: { url: image, detail: 'low' } },
      ] }] }),
    });
    const text = textFrom(payload).replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const result = JSON.parse(text);
    return { status: result.status === 'pass' ? 'pass' as const : 'check' as const, note: String(result.note || '建议人工核对房间功能与户型依据。') };
  } catch {
    return { status: 'unverified' as const, note: '自动复核暂不可用，请人工对照户型图确认。' };
  }
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
  const analysis = request.analysis || await analyze(config, request.floorPlan, request.source === 'cad' ? 'cad' : 'floorplan');
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
  const cover = await edit(config, request.floorPlan, `${common}基于原图生成一张严格对应原户型布局的全屋俯视轴测室内效果图。保持原图上下左右方位和各房间相对位置，完整呈现各房间分隔与连接，不要改成新的户型，不要裁掉边缘空间。`);
  const generatedRooms = await mapConcurrent(selectedRooms, 2, async (room) => {
    const reference = request.roomReferenceImages?.find((item) => item.name === room.name)?.image || request.floorPlan!;
    const evidence = [room.description, room.evidence?.map((item) => `${item.type}: ${item.detail}`).join('；'), room.adjacentTo?.length ? `相邻空间：${room.adjacentTo.join('、')}` : '', room.confidence !== null && room.confidence !== undefined ? `识别置信度：${Math.round(room.confidence * 100)}%` : ''].filter(Boolean).join('；');
    const roomPrompt = `${common}本张只生成“${room.name}”这一个明确空间${room.suggestedName ? `（识别候选为${room.suggestedName}，功能尚未确认，按可见布局保守表达）` : ''}，不能生成全屋图、户型图、拼图或其他房间。房间证据包：${evidence}。如输入图为“全图+房间局部放大”的参考板，左侧用于确认户型方位和邻接，右侧用于读取目标空间边界与设施，二者都是参考而不是最终构图模板。镜头为人在房间内部的室内摄影视角，视线高度约 1.5 米，自然广角不过度变形；清楚表现目标房间的墙面、地面、门窗、固定设施及合适家具。不得把相邻客餐厅合并；客厅突出沙发与电视主墙，餐厅突出餐桌椅，卧室突出床及床头背景，厨房突出橱柜与操作台，卫生间突出洁具与淋浴区。不得臆造证据包没有支持的门窗和固定结构。`;
    const generated = await edit(config, reference, roomPrompt);
    const review = await reviewRoomImage(config, generated.imageUrl, room);
    return { ...room, imageUrl: generated.imageUrl, review };
  });
  return { type: 'floorplan', analysis, cover: cover.imageUrl, rooms: generatedRooms };
}

async function analyzeFloorPlanRequest(config: GatewayConfig, request: AnalyzeRequest) {
  if (!request.floorPlan) throw new Error('请先上传户型图。');
  const analysis = await analyze(config, request.floorPlan, request.source === 'cad' ? 'cad' : 'floorplan');
  return { analysis, rooms: roomsFrom(analysis) };
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
      server.middlewares.use('/api/ai/analyze-floorplan', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        if (!config.apiKey) return sendJson(res, 500, { error: '未检测到 CODEX2API_API_KEY 或 AI_API_KEY。' });
        try { sendJson(res, 200, await analyzeFloorPlanRequest(config, await readBody(req) as AnalyzeRequest)); }
        catch (error) {
          console.error('Floor-plan analysis request failed:', error instanceof Error ? error.message : error);
          sendJson(res, 502, { error: error instanceof Error ? error.message : '户型识别失败，请稍后重试。' });
        }
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/ai/generate', gatewayMiddleware);
      server.middlewares.use('/api/ai/analyze-floorplan', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        if (!config.apiKey) return sendJson(res, 500, { error: '未检测到 CODEX2API_API_KEY 或 AI_API_KEY。' });
        try { sendJson(res, 200, await analyzeFloorPlanRequest(config, await readBody(req) as AnalyzeRequest)); }
        catch (error) {
          console.error('Floor-plan analysis request failed:', error instanceof Error ? error.message : error);
          sendJson(res, 502, { error: error instanceof Error ? error.message : '户型识别失败，请稍后重试。' });
        }
      });
    },
  };
}
