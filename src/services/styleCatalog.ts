import type { DesignStyle } from './dataContracts';

export interface StyleReportDetail {
  subtitle: string;
  principles: { title: string; body: string }[];
  notes: string[];
}

export interface StyleCatalogEntry {
  key: DesignStyle;
  name: string;
  /** 短标签，用 · 分隔，汇报页会拆成标签展示 */
  note: string;
  palette: string[];
  materials: string[];
  analysis: string;
  details: StyleReportDetail;
}

/**
 * 工作台可选风格的唯一来源。
 * 必须与 styleRecommendation.ts 的 fallbackStyleProfiles 覆盖同一组 key，
 * 否则预算页推荐出的风格在工作台里无法落到具体 chip 上。
 */
export const styleCatalog: StyleCatalogEntry[] = [
  {
    key: 'modern',
    name: '现代简约',
    note: '暖白 · 浅木 · 隐藏收纳',
    palette: ['暖白', '浅灰', '浅木色'],
    materials: ['白橡木饰面', '哑光涂料', '浅色石材'],
    analysis: '以暖白、浅灰和浅木色建立明亮基底，隐藏式收纳与简洁几何线条降低视觉干扰，保留通透动线和自然采光。',
    details: {
      subtitle: '明亮、克制且适合日常居住的现代空间',
      principles: [
        { title: '统一基底', body: '以暖白墙面与浅木色建立连续、明亮的空间感。' },
        { title: '收纳隐形', body: '整合柜体与简洁线条，减少视觉干扰并保持动线通畅。' },
        { title: '自然采光', body: '优先保留窗边采光，让灯光作为柔和补充。' },
      ],
      notes: ['效果图用于方案沟通，实际尺寸以现场测量为准。', '柜体、门窗及固定设施位置请在施工前复核。'],
    },
  },
  {
    key: 'song',
    name: '宋式美学',
    note: '深木 · 陶器 · 东方留白',
    palette: ['米灰', '深胡桃木', '陶土褐'],
    materials: ['胡桃木格栅', '手工陶器', '肌理涂料'],
    analysis: '以深木格栅、陶器与书画形成含蓄的东方气韵，墙面保留肌理和留白，用暖色漫射光呈现安静、克制的当代宋式空间。',
    details: {
      subtitle: '以木、陶与留白表达安静含蓄的东方居住气质',
      principles: [
        { title: '疏朗留白', body: '控制装饰密度，以非对称陈设保留空间呼吸感。' },
        { title: '自然材质', body: '结合深木、肌理墙面、石材与手作陶器，呈现温润层次。' },
        { title: '当代宋韵', body: '提取宋式审美的克制气质，保持现代住宅的实用尺度。' },
      ],
      notes: ['木作颜色与墙面肌理会受现场光线和材料批次影响。', '效果图不替代施工图，尺寸与结构需由专业人员复核。'],
    },
  },
  {
    key: 'smallAmerican',
    name: '小美风格',
    note: '奶油线框 · 橄榄绿 · 复古细节',
    palette: ['奶油白', '橄榄绿', '深木色'],
    materials: ['线框烤漆柜门', '深色木地板', '黄铜五金'],
    analysis: '以奶油色线框柜门和暖白墙面打底，橄榄绿布艺、深木地板及黄铜小五金带出轻复古气质，尺度温和而适合日常居住。',
    details: {
      subtitle: '温柔奶油色与复古线条结合的轻松居家方案',
      principles: [
        { title: '经典线条', body: '以简洁线框门板和适度装饰线条建立复古基调。' },
        { title: '温暖配色', body: '奶油白搭配橄榄绿、深木色与少量黄铜细节。' },
        { title: '小户型友好', body: '优先考虑轻巧家具、整合收纳与清晰活动空间。' },
      ],
      notes: ['复古线条与五金细节可按预算和现货情况调整。', '家具尺度、收纳容量与过道宽度请结合现场尺寸确认。'],
    },
  },
  {
    key: 'minimal',
    name: '北欧原木',
    note: '原木 · 亚麻 · 自然光',
    palette: ['白橡', '亚麻白', '浅灰'],
    materials: ['白橡木饰面', '亚麻织物', '哑光乳胶漆'],
    analysis: '以白橡木、亚麻织物和浅色墙面建立自然的北欧基底，弱化造型与装饰，用自然采光和简洁家具保持空间的轻盈与通透。',
    details: {
      subtitle: '以原木与自然光构成的轻盈北欧日常',
      principles: [
        { title: '自然基底', body: '用浅木色与织物建立温和、低对比的整体底色。' },
        { title: '收纳克制', body: '柜体尽量贴合墙面，避免打断连续的地面与采光。' },
        { title: '光与留白', body: '保留完整开窗面与空白墙面，让自然光成为主要装饰。' },
      ],
      notes: ['浅木饰面对材料批次和光照较敏感，建议先看样板。', '效果图不替代施工图，门窗与柜体尺寸需现场复核。'],
    },
  },
  {
    key: 'chinese',
    name: '新中式',
    note: '木色 · 留白 · 东方线条',
    palette: ['墨木', '宣白', '青灰'],
    materials: ['胡桃木线条', '肌理墙面', '青灰石材'],
    analysis: '以胡桃木线条勾勒东方骨架，用大面积留白与青灰石材形成层次，通过格栅、屏风等现代转译手法表达克制的中式气韵。',
    details: {
      subtitle: '以木色线条与留白收束的当代东方空间',
      principles: [
        { title: '线条骨架', body: '用格栅与木线条勾勒比例，避免堆叠传统符号。' },
        { title: '留白呼吸', body: '墙面与顶面保持安静，把视觉重心留给关键陈设。' },
        { title: '器物点睛', body: '以少量陶、石、织物收口，控制装饰密度。' },
      ],
      notes: ['木作线条需与门洞、柜体模数对齐，建议先出节点图。', '效果图不替代施工图，结构改动需专业人员确认。'],
    },
  },
  {
    key: 'cream',
    name: '奶油法式',
    note: '柔和 · 温润 · 松弛',
    palette: ['奶油白', '浅杏', '雾灰'],
    materials: ['弧形石膏线', '奶油色乳胶漆', '亚光木饰面'],
    analysis: '以奶油白与浅杏色打底，用弧形垭口、石膏线和柔软布艺建立温和的层次，家具尺度放松，形成柔软而不甜腻的日常氛围。',
    details: {
      subtitle: '柔和弧线与暖奶油色包裹的松弛居所',
      principles: [
        { title: '柔和曲线', body: '用弧形垭口和圆角家具弱化空间的硬边。' },
        { title: '暖色层次', body: '奶油白、浅杏与雾灰形成同色系但不单调的层次。' },
        { title: '柔软材质', body: '布艺、绒面与亚光木饰面承担主要的触感表达。' },
      ],
      notes: ['墙面石膏线造型会增加人工成本，建议按房间分优先级。', '浅色墙面更依赖施工平整度，验收标准需提前约定。'],
    },
  },
  {
    key: 'european',
    name: '轻奢欧式',
    note: '石材 · 金属 · 克制质感',
    palette: ['香槟', '深灰石', '哑黑'],
    materials: ['岩板', '哑光黄铜', '深色木饰面'],
    analysis: '以岩板、黄铜和深色木饰面建立克制的轻奢质感，弱化繁复线脚，用材质对比与局部金属收边表达精致度。',
    details: {
      subtitle: '以石材与金属细节建立的克制轻奢',
      principles: [
        { title: '材质对比', body: '用岩板、木饰面与金属形成明暗与冷暖的对比。' },
        { title: '收边精致', body: '把预算集中在收口、踢脚与五金等近距离接触面。' },
        { title: '色彩克制', body: '以香槟与深灰为主，避免大面积高反光材料。' },
      ],
      notes: ['岩板与金属收边对加工与安装精度要求较高。', '效果图不替代材料封样，主材需现场确认色差。'],
    },
  },
  {
    key: 'wabi',
    name: '自然侘寂',
    note: '肌理 · 安静 · 自然',
    palette: ['灰米', '陶土', '浅胡桃'],
    materials: ['微水泥', '手工陶土砖', '原木与藤编'],
    analysis: '以微水泥、陶土砖和原木藤编呈现不均匀的手工肌理，通过低饱和色调与粗粝细节营造安静、有时间感的居住氛围。',
    details: {
      subtitle: '在手工肌理与低饱和色调里安静下来',
      principles: [
        { title: '肌理表达', body: '用微水泥与手工砖的不均匀感替代装饰线条。' },
        { title: '低饱和基调', body: '灰米与陶土色统一墙地与软装，减少色彩冲突。' },
        { title: '手工痕迹', body: '保留材料本身的接缝与颗粒，避免过度抛光。' },
      ],
      notes: ['微水泥施工对基层和工艺要求高，需选择有案例的施工方。', '手工砖有色差与尺寸偏差，属正常范围。'],
    },
  },
];

export const styleCatalogByKey = new Map(styleCatalog.map((entry) => [entry.key, entry]));
