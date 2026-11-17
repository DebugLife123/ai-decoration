// 灵感广场作品服务：存储逻辑见 showcaseStore.ts，本文件保留浏览器图像处理与初审。
import { gatewayIdentityHeaders } from './credits';

const MAX_IMAGE_EDGE = 1080;

export type { UserShowcase } from './showcaseStore';
export { loadUserShowcases, saveUserShowcase, deleteUserShowcase, MAX_USER_SHOWCASES } from './showcaseStore';

// 压缩到长边 1080px 的 JPEG，控制 localStorage 占用。
export function compressImageFile(file: File, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('请选择图片文件。')); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext('2d');
        if (!context) { reject(new Error('图片处理失败，请重试。')); return; }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      image.onerror = () => reject(new Error('图片读取失败，请换一张试试。'));
      image.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('图片读取失败，请换一张试试。'));
    signal?.addEventListener('abort', () => reject(new Error('已取消')), { once: true });
    reader.readAsDataURL(file);
  });
}

// 发布门禁：调用网关视觉模型判断图片是否为家居/户型内容。
export type ShowcaseReview = { category: 'interior' | 'floorplan' | 'other'; reason: string };

export async function reviewShowcaseImage(imageDataUrl: string): Promise<ShowcaseReview> {
  const response = await fetch('/api/ai/validate-showcase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...gatewayIdentityHeaders() },
    body: JSON.stringify({ image: imageDataUrl }),
  });
  const payload = await response.json().catch(() => ({})) as Partial<ShowcaseReview> & { error?: string };
  if (!response.ok) throw new Error(payload.error || '图片审查失败，请稍后重试。');
  if (payload.category !== 'interior' && payload.category !== 'floorplan') throw new Error(payload.error || '图片未通过初审。');
  return payload as ShowcaseReview;
}
