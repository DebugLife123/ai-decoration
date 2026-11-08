import { useEffect, useRef, useState } from 'react';
import { businessDataAdapter } from '../services/businessData';
import './MaterialImagePicker.css';

interface MaterialImagePickerProps {
  imageIds?: string[];
  onChange(imageIds: string[]): void;
}

async function prepareImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法处理这张图片。');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error('图片压缩失败，请换一张图片重试。')), 'image/webp', 0.82);
    });
    const name = file.name.replace(/\.[^.]+$/, '') || 'material-image';
    return new File([blob], `${name}.webp`, { type: 'image/webp', lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

export default function MaterialImagePicker({ imageIds = [], onChange }: MaterialImagePickerProps) {
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [error, setError] = useState('');
  const objectUrls = useRef(new Set<string>());
  const currentIds = useRef(imageIds);
  currentIds.current = imageIds;

  useEffect(() => {
    let active = true;
    const missing = imageIds.filter((id) => !previews[id]);
    if (missing.length === 0) return;
    void Promise.all(missing.map(async (id) => {
      try {
        const blob = await businessDataAdapter.downloadAsset(id);
        return [id, URL.createObjectURL(blob)] as const;
      } catch {
        return null;
      }
    })).then((results) => {
      if (!active) {
        results.forEach((entry) => { if (entry) URL.revokeObjectURL(entry[1]); });
        return;
      }
      const next: Record<string, string> = {};
      results.forEach((entry) => {
        if (!entry) return;
        objectUrls.current.add(entry[1]);
        next[entry[0]] = entry[1];
      });
      setPreviews((current) => ({ ...current, ...next }));
    });
    return () => { active = false; };
  }, [imageIds, previews]);

  useEffect(() => () => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current.clear();
  }, []);

  const upload = async (files: File[]) => {
    if (!files.length) return;
    if (imageIds.length + files.length > 8) {
      setError('最多可上传 8 张材料图片。');
      return;
    }
    const invalid = files.find((file) => !file.type.startsWith('image/') || file.size > 15 * 1024 * 1024);
    if (invalid) {
      setError(!invalid.type.startsWith('image/') ? '请选择图片文件。' : `${invalid.name} 超过 15 MB。`);
      return;
    }
    setUploading(true);
    setError('');
    try {
      for (const [index, file] of files.entries()) {
        setUploadProgress(`正在处理图片 ${index + 1}/${files.length}`);
        const preparedFile = await prepareImage(file);
        setUploadProgress(`正在上传 ${index + 1}/${files.length}`);
        const asset = await businessDataAdapter.uploadAsset(preparedFile);
        const url = URL.createObjectURL(preparedFile);
        objectUrls.current.add(url);
        setPreviews((current) => ({ ...current, [asset.id]: url }));
        const nextIds = [...currentIds.current, asset.id];
        currentIds.current = nextIds;
        onChange(nextIds);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '图片上传失败。');
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  };

  const remove = (id: string) => {
    onChange(imageIds.filter((item) => item !== id));
    const url = previews[id];
    if (url) {
      URL.revokeObjectURL(url);
      objectUrls.current.delete(url);
      setPreviews((current) => { const next = { ...current }; delete next[id]; return next; });
    }
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= imageIds.length) return;
    const next = [...imageIds];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return <div className="material-image-picker">
    <label className="material-image-label">材料图片 <span>最多 8 张，每张不超过 15 MB；第一张作为封面</span></label>
    {imageIds.length > 0 && <div className="material-image-gallery">{imageIds.map((id, index) => <div className="material-image-tile" key={id}>
      {previews[id] ? <img src={previews[id]} alt={`材料图片 ${index + 1}`} /> : <div className="material-image-placeholder">图片加载中</div>}
      {index === 0 && <span className="material-image-cover-label">封面</span>}
      <div className="material-image-tile-actions">
        <button type="button" title="向前移动" aria-label={`第 ${index + 1} 张向前移动`} disabled={index === 0} onClick={() => move(index, -1)}>←</button>
        <button type="button" title="向后移动" aria-label={`第 ${index + 1} 张向后移动`} disabled={index === imageIds.length - 1} onClick={() => move(index, 1)}>→</button>
        <button type="button" title="移除图片" aria-label={`移除第 ${index + 1} 张图片`} onClick={() => remove(id)}>×</button>
      </div>
    </div>)}</div>}
    <div className="material-image-actions">
      <label className="material-image-upload">{uploading ? uploadProgress : '添加图片'}<input type="file" multiple accept="image/*" disabled={uploading || imageIds.length >= 8} onChange={(event) => { void upload(Array.from(event.target.files || [])); event.target.value = ''; }} /></label>
      <span className="material-image-count">{imageIds.length}/8</span>
      {error && <span className="form-error" role="alert">{error}</span>}
    </div>
  </div>;
}
