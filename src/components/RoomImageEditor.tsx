import { useEffect, useRef, useState, type PointerEvent } from 'react';
import './RoomImageEditor.css';

export type RoomImageVersion = { id: string; parentVersionId: string | null; imageUrl: string; instruction: string; createdAt: string; model: string };
type Stroke = { points: { x: number; y: number }[]; mode: 'paint' | 'erase'; size: number };
type Props = {
  roomName: string;
  imageUrl: string;
  versions: RoomImageVersion[];
  currentVersionId: string;
  onClose: () => void;
  onGenerate: (mask: string, instruction: string) => Promise<{ imageUrl: string; model: string }>;
  onAdopt: (version: RoomImageVersion) => Promise<void>;
  onRestore: (version: RoomImageVersion) => Promise<void>;
};

export default function RoomImageEditor({ roomName, imageUrl, versions, currentVersionId, onClose, onGenerate, onAdopt, onRestore }: Props) {
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeStroke = useRef<Stroke | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redo, setRedo] = useState<Stroke[]>([]);
  const [brushSize, setBrushSize] = useState(38);
  const [tool, setTool] = useState<'paint' | 'erase'>('paint');
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [candidate, setCandidate] = useState<RoomImageVersion | null>(null);
  const [comparison, setComparison] = useState(50);
  const [saving, setSaving] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const target = canvasRef.current;
    const source = imageRef.current;
    if (!target || !source || !source.naturalWidth) return;
    target.width = source.naturalWidth;
    target.height = source.naturalHeight;
    const context = target.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, target.width, target.height);
    for (const stroke of strokes) {
      if (!stroke.points.length) continue;
      context.save();
      context.globalCompositeOperation = stroke.mode === 'erase' ? 'destination-out' : 'source-over';
      context.strokeStyle = 'rgba(196, 83, 54, .42)';
      context.fillStyle = 'rgba(196, 83, 54, .42)';
      context.lineWidth = stroke.size * source.naturalWidth / target.getBoundingClientRect().width;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      if (stroke.points.length === 1) {
        context.beginPath();
        context.arc(stroke.points[0].x, stroke.points[0].y, context.lineWidth / 2, 0, Math.PI * 2);
        context.fill();
      } else {
        context.beginPath();
        context.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (const point of stroke.points.slice(1)) context.lineTo(point.x, point.y);
        context.stroke();
      }
      context.restore();
    }
  }, [strokes]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) setStrokes((current) => { if (!redo.length) return current; setRedo((items) => items.slice(1)); return [...current, redo[0]]; });
        else setStrokes((current) => { if (!current.length) return current; setRedo((items) => [current[current.length - 1], ...items]); return current.slice(0, -1); });
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [busy, onClose, redo]);

  const pointFromEvent = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * event.currentTarget.width / rect.width, y: (event.clientY - rect.top) * event.currentTarget.height / rect.height };
  };
  const startStroke = (event: PointerEvent<HTMLCanvasElement>) => {
    if (busy || candidate) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    activeStroke.current = { points: [pointFromEvent(event)], mode: tool, size: brushSize };
    setStrokes((current) => [...current, activeStroke.current!]);
    setRedo([]);
  };
  const moveStroke = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!activeStroke.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const next = { ...activeStroke.current, points: [...activeStroke.current.points, pointFromEvent(event)] };
    activeStroke.current = next;
    setStrokes((current) => [...current.slice(0, -1), next]);
  };
  const stopStroke = () => { activeStroke.current = null; };

  const createMask = () => {
    const source = imageRef.current;
    const drawingCanvas = canvasRef.current;
    if (!source?.naturalWidth || !drawingCanvas) throw new Error('图片还未加载完成。');
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = source.naturalWidth;
    maskCanvas.height = source.naturalHeight;
    const context = maskCanvas.getContext('2d');
    if (!context) throw new Error('无法创建选区遮罩。');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    for (const stroke of strokes) {
      if (!stroke.points.length) continue;
      context.save();
      context.globalCompositeOperation = stroke.mode === 'paint' ? 'destination-out' : 'source-over';
      context.strokeStyle = '#fff';
      context.fillStyle = '#fff';
      context.lineWidth = stroke.size * source.naturalWidth / drawingCanvas.getBoundingClientRect().width;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      if (stroke.points.length === 1) {
        context.beginPath();
        context.arc(stroke.points[0].x, stroke.points[0].y, context.lineWidth / 2, 0, Math.PI * 2);
        context.fill();
      } else {
        context.beginPath();
        context.moveTo(stroke.points[0].x, stroke.points[0].y);
        stroke.points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
        context.stroke();
      }
      context.restore();
    }
    return maskCanvas.toDataURL('image/png');
  };

  const generate = async () => {
    if (!strokes.some((stroke) => stroke.mode === 'paint') || !instruction.trim()) { setError('请先涂抹要修改的区域，并填写修改要求。'); return; }
    setBusy(true); setError(''); setCandidate(null);
    try {
      const result = await onGenerate(createMask(), instruction.trim());
      setCandidate({ id: crypto.randomUUID(), parentVersionId: currentVersionId, imageUrl: result.imageUrl, instruction: instruction.trim(), createdAt: new Date().toISOString(), model: result.model });
      setComparison(50);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '局部编辑失败，请保留原图后重试。'); }
    finally { setBusy(false); }
  };

  const handleAdopt = async () => {
    if (!candidate) return;
    setSaving(true); setError('');
    try { await onAdopt(candidate); setCandidate(null); setStrokes([]); setInstruction(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '保存版本失败，当前图片未更改。'); }
    finally { setSaving(false); }
  };

  return <div className="room-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="room-editor" role="dialog" aria-modal="true" aria-labelledby="room-editor-title">
      <header className="room-editor-header"><div><span className="room-editor-eyebrow">空间图像编辑</span><h2 id="room-editor-title">{roomName}</h2></div><div className="room-editor-header-actions"><span>结果需确认后才会替换当前方案</span><button type="button" className="room-editor-close" aria-label="关闭编辑器" onClick={onClose} disabled={busy}>×</button></div></header>
      <div className="room-editor-layout">
        <div className="room-editor-workspace">
          <div className={`room-editor-canvas ${candidate ? 'has-candidate' : ''}`}>
            <div className="room-editor-image-stack" style={{ aspectRatio: imageSize.width && imageSize.height ? `${imageSize.width} / ${imageSize.height}` : '4 / 3' }}>
              <img ref={imageRef} src={candidate?.imageUrl || imageUrl} alt={`${roomName}编辑画布`} onLoad={() => { const target = canvasRef.current; const source = imageRef.current; if (target && source) { target.width = source.naturalWidth; target.height = source.naturalHeight; setImageSize({ width: source.naturalWidth, height: source.naturalHeight }); } }} />
              {candidate && <div className="room-editor-original" style={{ clipPath: `inset(0 ${100 - comparison}% 0 0)` }}><img src={imageUrl} alt="编辑前原图" /></div>}
              {!candidate && <canvas ref={canvasRef} onPointerDown={startStroke} onPointerMove={moveStroke} onPointerUp={stopStroke} onPointerCancel={stopStroke} aria-label="涂抹需要修改的区域" />}
              {candidate && <div className="room-editor-compare-divider" style={{ left: `${comparison}%` }}><span /></div>}
            </div>
            <span className="room-editor-canvas-label">{candidate ? '拖动下方滑块比较前后' : '涂抹需要修改的区域'}</span>
          </div>
          {candidate && <label className="room-editor-compare"><span>原图</span><input type="range" min="0" max="100" value={comparison} onChange={(event) => setComparison(Number(event.target.value))} aria-label="调整前后对比位置" /><span>候选</span></label>}
          {!candidate && <div className="room-editor-tools"><div className="room-editor-tool-group"><button type="button" className={tool === 'paint' ? 'active' : ''} onClick={() => setTool('paint')} title="画笔">画笔</button><button type="button" className={tool === 'erase' ? 'active' : ''} onClick={() => setTool('erase')} title="橡皮擦">擦除</button></div><label>笔刷 <input type="range" min="12" max="96" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} /><output>{brushSize}px</output></label><div className="room-editor-tool-group"><button type="button" onClick={() => { if (strokes.length) { setRedo((items) => [strokes[strokes.length - 1], ...items]); setStrokes((current) => current.slice(0, -1)); } }} disabled={!strokes.length} title="撤销">撤销</button><button type="button" onClick={() => { if (redo.length) { setStrokes((items) => [...items, redo[0]]); setRedo((items) => items.slice(1)); } }} disabled={!redo.length} title="重做">重做</button><button type="button" onClick={() => { setStrokes([]); setRedo([]); }} disabled={!strokes.length}>清空</button></div></div>}
        </div>
        <aside className="room-editor-side">
          {!candidate ? <><label className="room-editor-prompt" htmlFor="room-edit-instruction"><span>修改要求</span><textarea id="room-edit-instruction" value={instruction} onChange={(event) => setInstruction(event.target.value)} maxLength={600} placeholder="例如：仅将圈选墙面改为低饱和雾霾蓝乳胶漆，保留家具、灯光和拍摄视角。" /></label><small className="room-editor-guidance">仅编辑涂抹选区；模型可能对边缘与光照做少量融合，生成结果请对比确认。</small><button type="button" className="room-editor-generate" onClick={() => void generate()} disabled={busy || !instruction.trim()}>{busy ? <><i />正在生成候选…</> : '生成编辑候选'}</button></> : <><div className="room-editor-candidate-heading"><span>候选结果</span><strong>{candidate.instruction}</strong></div><div className="room-editor-candidate-actions"><button type="button" onClick={() => { setCandidate(null); setError(''); }} disabled={saving}>继续修改</button><button type="button" className="primary" onClick={() => void handleAdopt()} disabled={saving}>{saving ? '正在保存…' : '采用此版本'}</button></div></>}
          {error && <p className="room-editor-error" role="alert">{error}</p>}
          {versions.length > 0 && <div className="room-editor-history"><h3>版本记录 <span>{versions.length}</span></h3>{[...versions].reverse().map((version) => { const isCurrent = version.id === currentVersionId; return <article key={version.id}><div><strong>{isCurrent ? '当前采用版本' : '历史版本'}</strong><small>{new Date(version.createdAt).toLocaleString('zh-CN')}</small>{version.instruction && <p>{version.instruction}</p>}</div>{!isCurrent && <button type="button" onClick={() => { setSaving(true); setError(''); void onRestore(version).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : '恢复版本失败。')).finally(() => setSaving(false)); }} disabled={saving || busy}>恢复</button>}</article>; })}</div>}
        </aside>
      </div>
    </section>
  </div>;
}
