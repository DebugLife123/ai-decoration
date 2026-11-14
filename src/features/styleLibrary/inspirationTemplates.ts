import type { DesignStyle } from '../../stores/appStore';
import modernImage from '../../assets/generated/template-modern-minimal.png';
import songImage from '../../assets/generated/template-song-aesthetic.png';
import americanImage from '../../assets/generated/template-small-american.png';
import { wholeHomeStyles, wholeHomePrompt } from './wholeHomeStyles';

export type InspirationTemplate = {
  id: string; title: string; category: string; style: string; styleKey: DesignStyle; tags: string[];
  image: string; analysis: string; ruleItems: { label: string; value: string }[];
  palette: string[]; materials: string[]; prompt: string;
  paletteColors?: string[]; referenceAssetId?: string; negativePrompt?: string; thumbnail?: string;
};

export const existingTemplates: InspirationTemplate[] = [
  { id: 'modern-minimal', title: '克制留白里的日常秩序', category: '全屋', style: '现代简约', styleKey: 'modern', tags: ['现代简约'], image: modernImage, analysis: '以暖白、浅灰和浅木色建立明亮基底，隐藏式收纳与简洁几何线条降低视觉干扰，保留通透动线和自然采光。', ruleItems: [{ label: '空间策略', value: '优先保证采光面与客餐厅之间的连续动线，柜体尽量整合入墙。' }, { label: '材质规范', value: '以哑光墙面、浅木饰面和浅色石材为主，黑色金属仅作细节点缀。' }], palette: ['暖白', '浅灰', '浅木色'], materials: ['白橡木饰面', '哑光涂料', '浅色石材'], prompt: 'Photorealistic contemporary Chinese apartment interior, modern minimalist design, warm ivory and light greige palette, pale oak and restrained walnut veneer, clean geometric lines, concealed full-height storage, uncluttered surfaces, airy open circulation, large soft daylight, subtle integrated linear lighting, premium realistic materials, editorial interior photography. Preserve the supplied floor plan walls, openings, proportions and room connections. No people, text, watermark, excessive decor, ornate classic details or dramatic colors.' },
  { id: 'song-aesthetic', title: '宋式雅居 · 木与留白', category: '全屋', style: '宋式美学', styleKey: 'song', tags: ['宋式美学'], image: songImage, analysis: '以深木格栅、陶器与书画形成含蓄的东方气韵，墙面保留肌理和留白，用暖色漫射光呈现安静、克制的当代宋式空间。', ruleItems: [{ label: '构图规范', value: '采用疏朗、非对称的陈设关系，留出完整呼吸面，避免符号堆叠。' }, { label: '材质规范', value: '深胡桃木、陶土、石材与手工肌理墙面形成有层次的自然触感。' }], palette: ['米灰', '深胡桃木', '陶土褐'], materials: ['胡桃木格栅', '手工陶器', '肌理涂料'], prompt: 'Photorealistic contemporary Chinese home inspired by Song dynasty aesthetics, refined Song-style restraint, deep walnut wood lattice screen and crafted timber furniture, warm grey-beige textured walls, handmade ceramic vessels, subtle ink art, asymmetrical sparse styling, generous negative space, natural stone and tactile materials, soft amber indirect lighting, quiet scholarly atmosphere, realistic high-end interior photography. Preserve supplied floor plan walls, openings, proportions and circulation. Contemporary livable home, not a historical set. No people, text, watermark, red-lacquer palace decor or clutter.' },
  { id: 'small-american', title: '复古线条与温柔奶油色', category: '全屋', style: '小美风格', styleKey: 'smallAmerican', tags: ['小美风格'], image: americanImage, analysis: '以奶油色线框柜门和暖白墙面打底，橄榄绿布艺、深木地板及黄铜小五金带出轻复古气质，尺度温和而适合日常居住。', ruleItems: [{ label: '空间策略', value: '用成套柜体和书桌提升小户型收纳效率，保持家具尺度轻巧。' }, { label: '细节规范', value: '线框门板、黄铜五金、少量复古装饰彼此呼应，避免繁复堆叠。' }], palette: ['奶油白', '橄榄绿', '深木色'], materials: ['线框烤漆柜门', '深色木地板', '黄铜五金'], prompt: 'Photorealistic compact American-style home interior, small American classic style, creamy white raised-panel cabinetry and warm ivory walls, olive green upholstered accents, dark walnut wood floor, discreet aged brass hardware, built-in storage and practical desk, balanced classic trim, restrained vintage accessories, warm natural daylight and gentle ambient lighting, comfortable realistic proportions, polished interior editorial photography. Preserve supplied floor plan walls, openings, proportions and circulation. No people, text, watermark, oversized furniture, ornate palace detailing or excessive decor.' },
];
export const templates: InspirationTemplate[] = [
  ...existingTemplates,
  ...wholeHomeStyles.map((style): InspirationTemplate => ({
    id: style.id, title: `${style.name} · 全屋方案`, category: '全屋', style: style.name,
    styleKey: style.key, tags: [style.name, ...style.aliases, ...style.materialTags],
    image: style.reference.image, thumbnail: style.reference.thumbnail,
    analysis: style.prompt,
    ruleItems: [
      { label: '空间策略', value: '全屋延续统一风格，按房间功能布置家具；严格保留上传户型的墙体、门窗、比例与空间连接。' },
      { label: '参考规范', value: style.reference.direction },
      { label: '反向约束', value: style.negativePrompt },
    ],
    palette: [...style.paletteNames], paletteColors: [...style.palette], materials: [...style.materialTags],
    prompt: wholeHomePrompt(style), negativePrompt: style.negativePrompt, referenceAssetId: style.reference.id,
  })),
];
