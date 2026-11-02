import type { IncomingMessage, ServerResponse } from 'node:http';
import type { GatewayConfig } from './aiGateway.js';
import { analyze, generate, readBody, sendJson } from './aiGateway.js';

type CadAsset = { id: string; name: string; kind: 'cad-export' | 'reference' | 'style-reference'; mimeType: string; sizeLabel: string; dataUrl?: string };
type PlanModel = {
  schemaVersion: 1;
  source: { type: 'cad'; revision: string; unit: 'mm' | 'unknown'; scale: '1:1' | 'unknown'; fileIds: string[] };
  rooms: Array<{ id: string; name: string; description: string; confidence: number | null; status: 'confirmed' | 'identified' | 'unknown' }>;
  walls: Array<{ id: string; thicknessMm: number | null; confidence: number | null; status: 'confirmed' | 'identified' | 'unknown' }>;
  openings: Array<{ id: string; type: 'door' | 'window' | 'unknown'; roomFrom?: string; roomTo?: string; widthMm: number | null; heightMm: number | null; status: 'confirmed' | 'identified' | 'unknown' }>;
  connections: Array<{ from: string; to: string; type: 'open' | 'door' | 'unknown' }>;
  uncertainties: string[];
};
type StyleBrief = { id: string; name: string; referenceIds: string[]; palette: { primary: string[]; secondary: string[]; accent: string[] }; materials: Array<{ id: string; name: string; finish?: string; direction?: string; usage: string[] }>; furnitureRules: string[]; lighting: { colorTemperature?: string; scene?: string }; mustKeep: string[]; doNotUse: string[]; revision: string };
type QaCheck = { key: 'structure' | 'style' | 'pixel'; label: string; status: 'pending' | 'pass' | 'fail' | 'unverifiable'; note: string };
type BirdseyeRun = { id: string; createdAt: string; imageUrl: string; nativeWidth: 1024; nativeHeight: 1024; finalWidth: 1024; finalHeight: 1024; targetWidth: 3840; targetHeight: 2160; isNative4K: false; promptSummary: string };
type CadProject = { id: string; name: string; createdAt: string; updatedAt: string; stage: 'intake' | 'brief' | 'plan' | 'birdseye' | 'qa' | 'locked'; status: 'draft' | 'blocked' | 'ready' | 'locked'; sourceType: 'cad'; nativeCadParsing: false; revision: string; unit: 'mm' | 'unknown'; scale: '1:1' | 'unknown'; assets: CadAsset[]; missingItems: string[]; confirmations: string[]; planModel: PlanModel | null; styleBrief: StyleBrief | null; birdseye: BirdseyeRun | null; qa: QaCheck[]; gate: { birdseye: 'pending' | 'approved' | 'blocked' } };

const projects = new Map<string, CadProject>();
const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
const asString = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const asNumberOrNull = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const asStatus = (value: unknown): 'confirmed' | 'identified' | 'unknown' => value === 'confirmed' || value === 'unknown' ? value : 'identified';
function touch(project: CadProject) { project.updatedAt = now(); return project; }
function projectOrThrow(projectId: string) { const project = projects.get(projectId); if (!project) throw new Error('CAD 项目不存在或已失效。'); return project; }
function jsonFrom(text: string): Record<string, unknown> {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('CAD 识别模型未返回有效 JSON，已阻断后续流程。');
  try { return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>; }
  catch { throw new Error('CAD 识别模型返回的 JSON 无法解析，已阻断后续流程。'); }
}
function list(value: unknown) { return Array.isArray(value) ? value : []; }
function normalizePlan(text: string, project: CadProject, fileId: string): PlanModel {
  const parsed = jsonFrom(text);
  for (const key of ['rooms', 'walls', 'openings', 'connections', 'uncertainties']) if (!Array.isArray(parsed[key])) throw new Error(`CAD 识别结果缺少 ${key} 字段，已阻断后续流程。`);
  const rooms = list(parsed.rooms).slice(0, 20).map((raw, index) => { const item = asRecord(raw); return { id: asString(item.id, `room_${index + 1}`), name: asString(item.name, `空间 ${index + 1}`), description: asString(item.description, '未提供空间说明'), confidence: asNumberOrNull(item.confidence), status: asStatus(item.status) }; });
  if (rooms.length === 0) throw new Error('CAD 识别结果没有可确认的房间，已阻断后续流程。');
  const walls = list(parsed.walls).slice(0, 100).map((raw, index) => { const item = asRecord(raw); return { id: asString(item.id, `wall_${index + 1}`), thicknessMm: asNumberOrNull(item.thicknessMm), confidence: asNumberOrNull(item.confidence), status: asStatus(item.status) }; });
  const openings = list(parsed.openings).slice(0, 100).map((raw, index) => { const item = asRecord(raw); const type: 'door' | 'window' | 'unknown' = item.type === 'door' || item.type === 'window' ? item.type : 'unknown'; return { id: asString(item.id, `opening_${index + 1}`), type, roomFrom: asString(item.roomFrom) || undefined, roomTo: asString(item.roomTo) || undefined, widthMm: asNumberOrNull(item.widthMm), heightMm: asNumberOrNull(item.heightMm), status: asStatus(item.status) }; });
  const connections = list(parsed.connections).slice(0, 100).map((raw) => { const item = asRecord(raw); const type: 'open' | 'door' | 'unknown' = item.type === 'open' || item.type === 'door' ? item.type : 'unknown'; return { from: asString(item.from, 'unknown'), to: asString(item.to, 'unknown'), type }; });
  return { schemaVersion: 1, source: { type: 'cad', revision: project.revision, unit: project.unit, scale: project.scale, fileIds: [fileId] }, rooms, walls, openings, connections, uncertainties: list(parsed.uncertainties).map((item) => String(item)).filter(Boolean) };
}
function projectFromInput(input: Record<string, unknown>): CadProject {
  const createdAt = now();
  return { id: id('cad'), name: asString(input.name, '未命名 CAD 项目'), createdAt, updatedAt: createdAt, stage: 'intake', status: 'draft', sourceType: 'cad', nativeCadParsing: false, revision: asString(input.revision, 'R0'), unit: input.unit === 'mm' ? 'mm' : 'unknown', scale: input.scale === '1:1' ? '1:1' : 'unknown', assets: [], missingItems: ['CAD 导出图', '项目修订号确认', '单位与比例确认'], confirmations: [], planModel: null, styleBrief: null, birdseye: null, qa: [{ key: 'structure', label: '结构', status: 'pending', note: '待鸟瞰首件生成后核验墙体、门窗、房间邻接与固定设施。' }, { key: 'style', label: '风格', status: 'pending', note: '待鸟瞰首件生成后核验色调、材质、家具造型与照明。' }, { key: 'pixel', label: '像素', status: 'pending', note: '待输出后核验实际尺寸与原生尺寸说明。' }], gate: { birdseye: 'pending' } };
}
function routePath(req: IncomingMessage) { const value = (req.url || '').split('?')[0]; return value.startsWith('/api/cad') ? value.slice('/api/cad'.length) || '/' : value || '/'; }
function requireApiKey(config: GatewayConfig) { if (!config.apiKey) throw new Error('未检测到 CODEX2API_API_KEY 或 AI_API_KEY。'); }
function validateAsset(input: Record<string, unknown>): CadAsset { const mimeType = asString(input.mimeType); if (!mimeType.startsWith('image/')) throw new Error('第一阶段请上传 CAD 导出图片；暂不直接读取 DWG、DXF 或 PDF。'); return { id: id('asset'), name: asString(input.name, '未命名资料'), kind: input.kind === 'reference' || input.kind === 'style-reference' ? input.kind : 'cad-export', mimeType, sizeLabel: asString(input.sizeLabel, '未知大小'), dataUrl: asString(input.dataUrl) || undefined }; }

async function analyzePlan(config: GatewayConfig, project: CadProject, asset: CadAsset) {
  requireApiKey(config);
  if (!asset.dataUrl) throw new Error('CAD 导出图缺少可识别的图片数据。');
  const raw = await analyze(config, asset.dataUrl, 'cad');
  const plan = normalizePlan(raw, project, asset.id);
  return plan;
}
function stylePrompt(brief: StyleBrief) { return [`风格：${brief.name}`, `色彩：${brief.palette.primary.join('、')}；${brief.palette.secondary.join('、')}；点缀 ${brief.palette.accent.join('、')}`, `材质：${brief.materials.map((item) => `${item.name}${item.finish ? `（${item.finish}）` : ''}`).join('、')}`, `家具规则：${brief.furnitureRules.join('；')}`, `灯光：${brief.lighting.colorTemperature || '自然'}，${brief.lighting.scene || '柔和均匀'}`, `必须保留：${brief.mustKeep.join('；')}`, `禁止使用：${brief.doNotUse.join('；')}`].join('\n'); }

export function createCadWorkflowMiddleware(config: GatewayConfig) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = routePath(req);
    if (!path.startsWith('/projects')) return next();
    try {
      const body = req.method === 'GET' ? {} : await readBody<Record<string, unknown>>(req);
      const segments = path.split('/').filter(Boolean);
      const projectId = segments[1];
      if (req.method === 'POST' && segments.length === 1) { const project = projectFromInput(body); projects.set(project.id, project); return sendJson(res, 201, project); }
      if (!projectId) return sendJson(res, 400, { error: '缺少 CAD 项目 ID。' });
      const project = projectOrThrow(projectId);
      if (req.method === 'GET' && segments.length === 2) return sendJson(res, 200, project);
      if (req.method === 'PATCH' && segments.length === 2) { if (typeof body.name === 'string') project.name = body.name; if (typeof body.revision === 'string') project.revision = body.revision; if (body.unit === 'mm' || body.unit === 'unknown') project.unit = body.unit; if (body.scale === '1:1' || body.scale === 'unknown') project.scale = body.scale; if (Array.isArray(body.missingItems)) project.missingItems = body.missingItems.map(String); if (Array.isArray(body.confirmations)) project.confirmations = body.confirmations.map(String); touch(project); return sendJson(res, 200, project); }
      if (req.method === 'POST' && segments[2] === 'assets') { const asset = validateAsset(body); project.assets.push(asset); project.missingItems = project.missingItems.filter((item) => item !== 'CAD 导出图' || asset.kind !== 'cad-export'); touch(project); return sendJson(res, 201, project); }
      if (req.method === 'POST' && segments[2] === 'snapshot') { if (typeof body.revision === 'string') project.revision = body.revision; if (body.unit === 'mm' || body.unit === 'unknown') project.unit = body.unit; if (body.scale === '1:1' || body.scale === 'unknown') project.scale = body.scale; if (Array.isArray(body.confirmations)) project.confirmations = body.confirmations.map(String); touch(project); return sendJson(res, 200, project); }
      if (req.method === 'POST' && segments[2] === 'plan' && segments[3] === 'analyze') { const asset = project.assets.find((item) => item.id === asString(body.assetId) && item.kind === 'cad-export'); if (!asset) throw new Error('请先上传 CAD 导出图。'); const planModel = await analyzePlan(config, project, asset); project.planModel = planModel; project.stage = 'plan'; project.status = 'ready'; touch(project); return sendJson(res, 200, { project, planModel }); }
      if (req.method === 'GET' && segments[2] === 'plan') return sendJson(res, 200, project.planModel || { error: 'PlanModel 尚未生成。' });
      if (req.method === 'PATCH' && segments[2] === 'plan') { if (!body.planModel || typeof body.planModel !== 'object') throw new Error('PlanModel 数据无效。'); project.planModel = body.planModel as PlanModel; project.stage = 'plan'; touch(project); return sendJson(res, 200, project); }
      if (req.method === 'PATCH' && segments[2] === 'style-brief') { if (!body.styleBrief || typeof body.styleBrief !== 'object') throw new Error('StyleBrief 数据无效。'); project.styleBrief = body.styleBrief as StyleBrief; project.stage = 'brief'; touch(project); return sendJson(res, 200, project); }
      if (req.method === 'POST' && segments[2] === 'runs' && segments[3] === 'birdseye') { requireApiKey(config); if (!project.planModel) throw new Error('请先完成 PlanModel 识别。'); if (!project.styleBrief) throw new Error('请先保存风格简报。'); const cadAsset = project.assets.find((item) => item.kind === 'cad-export'); if (!cadAsset) throw new Error('请先上传 CAD 导出图。'); const prompt = `生成 CAD 全屋渲染工作流第一阶段的鸟瞰概念首件。当前仅基于 CAD 导出图视觉识别，不代表原生 DWG/DXF 几何还原。严格保持墙体、门窗、房间邻接、固定设施与比例关系，不得新增或删除结构。${stylePrompt(project.styleBrief)}\nPlanModel：${JSON.stringify(project.planModel)}\n输出真实室内设计鸟瞰渲染图，不要文字、水印、人物和施工图标注。目标输出规格 3840x2160，但当前模型按 1024x1024 原生输出，禁止拉伸冒充原生 4K。`; const image = await generate(config, prompt); const run: BirdseyeRun = { id: id('run'), createdAt: now(), imageUrl: image.imageUrl, nativeWidth: 1024, nativeHeight: 1024, finalWidth: 1024, finalHeight: 1024, targetWidth: 3840, targetHeight: 2160, isNative4K: false, promptSummary: `${project.styleBrief.name} / CAD 鸟瞰概念首件` }; project.birdseye = run; project.stage = 'qa'; project.qa = project.qa.map((item) => ({ ...item, status: 'pending', note: item.key === 'pixel' ? '当前模型原生输出为 1024×1024，未达到目标 3840×2160。' : '待人工核验。' })); touch(project); return sendJson(res, 201, { project, run }); }
      if (req.method === 'POST' && segments[2] === 'qa') { const checks = Array.isArray(body.checks) ? body.checks : []; if (checks.length !== 3) throw new Error('QA 必须提交结构、风格、像素三项检查。'); project.qa = checks as QaCheck[]; project.stage = 'qa'; project.status = project.qa.every((item) => item.status === 'pass') ? 'ready' : 'blocked'; touch(project); return sendJson(res, 200, project); }
      if (req.method === 'POST' && segments[2] === 'gates' && segments[3] === 'birdseye' && segments[4] === 'approve') { if (!project.birdseye) throw new Error('尚未生成鸟瞰首件。'); if (project.qa.length !== 3 || project.qa.some((item) => item.status !== 'pass')) throw new Error('结构、风格、像素三项 QA 必须全部通过后才能锁定。'); project.gate.birdseye = 'approved'; project.stage = 'locked'; project.status = 'locked'; touch(project); return sendJson(res, 200, project); }
      if (req.method === 'POST' && segments[2] === 'gates' && segments[3] === 'birdseye' && segments[4] === 'block') { project.gate.birdseye = 'blocked'; project.status = 'blocked'; touch(project); return sendJson(res, 200, project); }
      if (req.method === 'GET' && segments[2] === 'handoff') return sendJson(res, 200, { projectId: project.id, stage: project.stage, gate: project.gate, planModel: project.planModel, styleBrief: project.styleBrief, birdseye: project.birdseye, qa: project.qa, limitations: ['当前 CAD 模式使用 CAD 导出图片进行视觉识别，尚未完成原生 DWG/DXF 几何解析。', '鸟瞰首件当前为模型原生 1024×1024 概念输出，不是原生 4K。'] });
      return next();
    } catch (error) { const message = error instanceof Error ? error.message : 'CAD 工作流请求失败。'; const status = message.includes('不存在') ? 404 : message.includes('API_KEY') || message.includes('上游') ? 502 : 400; return sendJson(res, status, { error: message }); }
  };
}
