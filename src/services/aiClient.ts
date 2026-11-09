import type {
  FloorPlanAnalysis,
  FloorPlanGeneration,
  GenerateDesignInput,
  GenerationJob,
  GenerationResult,
  PlanImageMeta,
  PlanSource,
  RoomGeneration,
} from './dataContracts';

export type {
  DesignMode,
  FloorPlanAnalysis,
  FloorPlanGeneration,
  GenerateDesignInput,
  GenerationJob,
  GenerationResult,
  IdentifiedRoom,
  PhotoGeneration,
  PlanImageMeta,
  PlanSource,
  RoomGeneration,
  RoomReview,
} from './dataContracts';

/** 局部重绘：在遮罩区域内按指令改图，返回新图与所用模型。 */
export async function editRoomImage(input: { image: string; mask: string; instruction: string; roomName: string; style: string }): Promise<{ imageUrl: string; model: string }> {
  const response = await fetch('/api/ai/edit-room-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  const payload = await response.json() as { imageUrl?: string; model?: string; error?: string };
  if (!response.ok || !payload.imageUrl) throw new Error(payload.error || '局部编辑失败，请稍后重试。');
  return { imageUrl: payload.imageUrl, model: payload.model || 'configured-image-model' };
}

/** 识别 CAD / 户型图，返回空间分析结果，供分房间生成使用。 */
export async function analyzeFloorPlan(floorPlan: string, source: PlanSource = 'floorplan', imageMeta?: PlanImageMeta): Promise<FloorPlanAnalysis> {
  const response = await fetch('/api/ai/analyze-floorplan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ floorPlan, source, imageMeta }) });
  const payload = await response.json() as FloorPlanAnalysis & { error?: string; requestId?: string };
  if (!response.ok) throw new Error([payload.error || '户型识别失败，请检查接口配置。', payload.requestId ? `请求编号：${payload.requestId}` : ''].filter(Boolean).join(' '));
  return payload;
}

/**
 * 提交全屋生成。
 * 后端现在返回 202 + jobId，真正的结果要通过 `pollGenerationJob` 轮询拿；
 * 若后端同步返回结果（未启用任务队列），则直接返回。
 */
export async function generateDesign(input: GenerateDesignInput, onProgress?: (job: GenerationJob) => void): Promise<FloorPlanGeneration & { warning?: string; jobId?: string }> {
  const response = await fetch('/api/ai/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  const payload = await response.json() as GenerationResult & { error?: string; jobId?: string };
  if (!response.ok) throw new Error(payload.error || 'AI 生成失败，请检查接口配置。');
  if (!payload.jobId) {
    if (payload.type !== 'floorplan') throw new Error('返回结果类型不正确。');
    return payload;
  }
  return pollGenerationJob(payload.jobId, (payload as { analysis?: string }).analysis || input.analysis || '', onProgress);
}

/** 对失败的空间发起重试，并在已有结果基础上增量合并。 */
export async function retryGenerationRooms(jobId: string, previous: FloorPlanGeneration, onProgress?: (job: GenerationJob) => void) {
  const response = await fetch(`/api/ai/generation-jobs/${encodeURIComponent(jobId)}/retry`, { method: 'POST' });
  const payload = await response.json() as { error?: string };
  if (!response.ok) throw new Error(payload.error || '空间重试暂不可用。');
  return pollGenerationJob(jobId, previous.analysis, onProgress, previous.rooms, previous.cover);
}

/**
 * 轮询生成任务直到终态。
 * 关键点：用 `afterRooms` 只取增量房间、`includeCover` 只取一次总览，
 * 否则每 2 秒会把整批 base64 图重传一遍。连续 4 次请求失败才判定为网络故障。
 */
async function pollGenerationJob(jobId: string, initialAnalysis: string, onProgress?: (job: GenerationJob) => void, previousRooms: RoomGeneration[] = [], previousCover = ''): Promise<FloorPlanGeneration & { warning?: string; jobId: string }> {
  const startedAt = Date.now();
  let consecutiveErrors = 0;
  let receivedRooms = previousRooms.length;
  let includeCover = !previousCover;
  let cover = previousCover;
  let analysis = initialAnalysis;
  const rooms: RoomGeneration[] = [...previousRooms];
  while (Date.now() - startedAt < 30 * 60 * 1000) {
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
    let job: GenerationJob;
    try {
      const query = new URLSearchParams({ summary: '1', afterRooms: String(receivedRooms), includeCover: includeCover ? '1' : '0' });
      const statusResponse = await fetch(`/api/ai/generation-jobs/${encodeURIComponent(jobId)}?${query}`, { cache: 'no-store' });
      if (!statusResponse.ok) throw new Error(statusResponse.status === 404 ? '生成任务已过期或服务已重启。' : '暂时无法获取生成进度。');
      job = await statusResponse.json() as GenerationJob;
      consecutiveErrors = 0;
    } catch (error) {
      if (++consecutiveErrors < 4) continue;
      throw error;
    }
    if (job.cover) { cover = job.cover; includeCover = false; }
    if (job.analysis) analysis = job.analysis;
    if (job.rooms?.length) { rooms.push(...job.rooms); receivedRooms += job.rooms.length; }
    onProgress?.({ ...job, cover: cover || undefined, analysis, rooms: [...rooms] });
    if (job.status === 'completed' || job.status === 'partial' || job.status === 'failed') {
      if (cover) return { type: 'floorplan', cover, analysis, rooms, jobId, warning: job.error ? `${job.error}（请求编号：${job.requestId}）` : undefined };
      throw new Error(`${job.error || '生成失败，请稍后重试。'}（任务编号：${job.requestId}）`);
    }
  }
  throw new Error(`生成任务等待超过 30 分钟，请记录任务编号 ${jobId} 并联系管理员排查。`);
}
