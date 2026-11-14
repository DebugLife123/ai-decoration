// Source: codex/style-library-20261112 @ 4f7e39f. Whole-home styles only.
// Effective prompts include visualProfiles overrides; existing main styles are intentionally excluded.
export const wholeHomeStyles = [
  {
    "key": "bauhaus",
    "name": "包豪斯",
    "aliases": [
      "几何构成",
      "功能主义"
    ],
    "previewImage": "modern-kitchen",
    "palette": [
      "#ece8de",
      "#65705a",
      "#89684c"
    ],
    "note": "苔绿弧形沙发、木饰面、几何地毯",
    "materialTags": [
      "木饰面",
      "纹理石材",
      "绒面织物"
    ],
    "spaceTags": [
      "客厅",
      "餐厨",
      "工作区"
    ],
    "prompt": "依据所选参考图还原包豪斯多巴胺住宅的视觉语言：暖白细肌理墙顶，大面积中暖木饰面与木地板，苔绿色弧形低背沙发，深色异形石材茶几，细腿餐椅，雕塑感吊灯。局部蓝绿几何地毯与彩色画作形成点缀。保留通透采光、白纱帘与自然植物，材质反射克制，使用参考图的色彩占比和家具轮廓。真实住宅尺度，平直透视，柔和日光。",
    "negativePrompt": "不要把红黄蓝三原色铺满空间，不要工业裸管或展厅陈列，不要改变户型门窗，不要复制水印、文字或全景畸变。",
    "budgetFactor": 1.08,
    "compatibilityStyles": [
      "modern"
    ],
    "sourceFolder": "企业网盘/共享资源/案例文件/主流风格/包豪斯",
    "sourceStyleKey": "bauhaus",
    "id": "whole-home-bauhaus",
    "paletteNames": [
      "暖白",
      "苔绿",
      "中暖木色"
    ],
    "reference": {
      "id": "bauhaus-8e86be17c582",
      "image": "/style-assets/bauhaus-8e86be17c582.jpg",
      "thumbnail": "/style-assets/bauhaus-8e86be17c582-thumb.jpg",
      "source": "包豪斯/包豪斯多巴胺.zip/包豪斯多巴胺/包豪斯多巴胺1 (6).jpeg",
      "width": 1600,
      "height": 900,
      "sourceSha256": "8e86be17c582e2ad3baa14d6c7cc69a67ed4846bfbb10d095f92809a5331cabd",
      "sha256": "70def1e6d5959378b3d5b71d8902f064065d3575d972784b880bb8cab6ff24ab",
      "direction": "以本次所选参考图的实际颜色、家具轮廓、材质纹理和光线为准，不混用其他案例。"
    }
  },
  {
    "key": "frenchCream",
    "name": "法式奶油风",
    "aliases": [
      "奶油法式",
      "法式温柔风"
    ],
    "previewImage": "cream-compact",
    "palette": [
      "#eee8dc",
      "#99785a",
      "#3b3531"
    ],
    "note": "奶白线框、胡桃木、复古灯具",
    "materialTags": [
      "奶白护墙线框",
      "胡桃木",
      "黄铜灯具"
    ],
    "spaceTags": [
      "客厅",
      "卧室",
      "餐厅"
    ],
    "prompt": "依据所选参考图生成奶油法式与中古混搭住宅。奶白墙顶采用细线框和弧形门洞，木色地板与胡桃木餐桌柜体形成暖色层次，搭配棕色皮革或深色布艺沙发、复古黄铜玻璃灯具、细腿木椅和少量黑色轮廓。保留参考图中的壁炉、格框窗和局部花砖等可见装饰，不把不同案例的元素全部堆入同一空间。白纱帘过滤日光，真实室内摄影质感。",
    "negativePrompt": "避免全屋纯白无层次、过度粉色、厚重宫廷雕花、过曝和廉价亮面，不复制图中文字、水印或鱼眼变形。",
    "budgetFactor": 1.05,
    "compatibilityStyles": [
      "cream"
    ],
    "sourceFolder": "企业网盘/共享资源/案例文件/主流风格/法式奶油风",
    "sourceStyleKey": "frenchCream",
    "id": "whole-home-frenchCream",
    "paletteNames": [
      "奶白",
      "胡桃木",
      "深棕"
    ],
    "reference": {
      "id": "frenchCream-412fc5e9d595",
      "image": "/style-assets/frenchCream-412fc5e9d595.jpg",
      "thumbnail": "/style-assets/frenchCream-412fc5e9d595-thumb.jpg",
      "source": "法式奶油风/法式奶油中古(1).zip/法式奶油中古/客餐厅1.jpg",
      "width": 1600,
      "height": 762,
      "sourceSha256": "412fc5e9d5953a9ee19434298b73593a1fee8cf114f11cc962ad9ed478a414cb",
      "sha256": "50686e149481d4629a1e11c9d5a15c73fc485e5d27895701db881000de32c51f",
      "direction": "以本次所选参考图的实际颜色、家具轮廓、材质纹理和光线为准，不混用其他案例。"
    }
  },
  {
    "key": "frenchNatural",
    "name": "法式自然风",
    "aliases": [
      "自然法式",
      "松弛法式"
    ],
    "previewImage": "wabi-home",
    "palette": [
      "#ece7dc",
      "#343437",
      "#8c3f3d"
    ],
    "note": "白色线框、黑白拼花、复古红椅",
    "materialTags": [
      "白色石膏线",
      "木地板",
      "黑白几何花砖"
    ],
    "spaceTags": [
      "客厅",
      "卧室",
      "阳台"
    ],
    "prompt": "以所选法式自然风案例图为准，采用暖白墙面和细石膏线框、深色门框与柜体、自然木地板。玄关与厨卫局部使用黑白几何拼花，客厅使用白色圆润沙发、石材茶几、少量酒红或红色雕塑感单椅和复古金属灯。卧室延续浅米色织物和参考图中的花卉墙面。落地窗、纱帘和绿植提供自然光。尊重各空间原图差异，保持中古轻奢混搭，而非乡村藤编风。",
    "negativePrompt": "避免全屋藤编、侘寂粗糙微水泥、黑白花砖覆盖所有房间、过量红色或金色、拷贝画面文字和全景扭曲。",
    "budgetFactor": 1.03,
    "compatibilityStyles": [
      "wabi",
      "cream"
    ],
    "sourceFolder": "企业网盘/共享资源/案例文件/主流风格/法式自然风",
    "sourceStyleKey": "frenchNatural",
    "id": "whole-home-frenchNatural",
    "paletteNames": [
      "暖白",
      "炭黑",
      "酒红"
    ],
    "reference": {
      "id": "frenchNatural-d1eea7a226ad",
      "image": "/style-assets/frenchNatural-d1eea7a226ad.jpg",
      "thumbnail": "/style-assets/frenchNatural-d1eea7a226ad-thumb.jpg",
      "source": "法式自然风/6291法式中古轻奢大平层.zip/6291法式中古轻奢大平层/法式自然_Corona Camera002.0000.jpg",
      "width": 1600,
      "height": 727,
      "sourceSha256": "d1eea7a226ad3802801222c16fd830e48b53010c86e80cd50fb0e9f4adb597fe",
      "sha256": "20293447af9301a591d6f4f4c908d51563d30f3e5a38d9551db6ce0f22df8c63",
      "direction": "以本次所选参考图的实际颜色、家具轮廓、材质纹理和光线为准，不混用其他案例。"
    }
  },
  {
    "key": "oldMoney",
    "name": "老钱风",
    "aliases": [
      "经典英伦",
      "低调奢华"
    ],
    "previewImage": "chinese-home",
    "palette": [
      "#dad2c4",
      "#493b31",
      "#a48b54"
    ],
    "note": "深木、纹理石材、暖光陈列",
    "materialTags": [
      "深色木饰面",
      "纹理石材",
      "古铜金属"
    ],
    "spaceTags": [
      "客厅",
      "书房",
      "餐厅"
    ],
    "prompt": "参照原图生成沉稳的老钱风住宅。深棕木饰面、竖向格栅和暖光展示柜构成背景，米灰布艺沙发与棕色皮革单椅围合，深绿或深色纹理石材茶几与电视背景形成重点。圆形石材餐桌、古铜金属与雕塑灯具体现精致比例，暖色灯带结合大窗日光，保持参考图的明暗层次与丰富材质，不把住宅改成古典宫殿。",
    "negativePrompt": "避免满墙金箔、夸张雕花、暗到看不清材质、纯灰极简、复制水印或艺术品文字，不改动墙体门窗。",
    "budgetFactor": 1.18,
    "compatibilityStyles": [
      "european"
    ],
    "sourceFolder": "企业网盘/共享资源/案例文件/主流风格/老钱风",
    "sourceStyleKey": "oldMoney",
    "id": "whole-home-oldMoney",
    "paletteNames": [
      "米灰",
      "深棕",
      "古铜"
    ],
    "reference": {
      "id": "oldMoney-51c6e7f791b8",
      "image": "/style-assets/oldMoney-51c6e7f791b8.jpg",
      "thumbnail": "/style-assets/oldMoney-51c6e7f791b8-thumb.jpg",
      "source": "老钱风/微信图片_20261031154708_206_66.jpg",
      "width": 1600,
      "height": 925,
      "sourceSha256": "51c6e7f791b8e5b24fde5d4cef73923c617d198df123fdf4a3f4b19ed06023da",
      "sha256": "e405797670c9027f962a7dfe09e75b89123ac108c56e09a1386bba4ed5e159c2",
      "direction": "以本次所选参考图的实际颜色、家具轮廓、材质纹理和光线为准，不混用其他案例。"
    }
  },
  {
    "key": "modernContemporary",
    "name": "现代风",
    "aliases": [
      "现代轻居"
    ],
    "previewImage": "modern-living",
    "palette": [
      "#e9e4dc",
      "#a68a6d",
      "#424548"
    ],
    "note": "浅石材、木作、弧形灯光",
    "materialTags": [
      "浅色石材",
      "木饰面",
      "金属灯具"
    ],
    "spaceTags": [
      "全屋",
      "客厅",
      "餐厨"
    ],
    "prompt": "严格依据所选现代风参考图的明暗分组和配色。使用一体化柜体、浅色大板地面、石材背景和细节木饰面，低矮沙发、圆形或异形茶几，简洁灯带与局部弧形吊顶。浅色案例保持米白与木色的明亮层次；深色案例保留深灰柜体、深石材和黑色轮廓，不混成一套配色。家具比例、墙面分缝与灯具位置服从户型和所选原图，真实日光与适度间接照明。",
    "negativePrompt": "避免把深浅案例混拼、镜面泛滥、过曝、厚重欧式雕花、二维码、图中文字和全景鱼眼，不改变原有门窗与空间比例。",
    "budgetFactor": 1,
    "compatibilityStyles": [
      "modern"
    ],
    "sourceFolder": "企业网盘/共享资源/案例文件/主流风格/现代风",
    "sourceStyleKey": "modern",
    "id": "whole-home-modern",
    "paletteNames": [
      "米白",
      "木色",
      "深灰"
    ],
    "reference": {
      "id": "modern-f4d551d4d0f1",
      "image": "/style-assets/modern-f4d551d4d0f1.jpg",
      "thumbnail": "/style-assets/modern-f4d551d4d0f1-thumb.jpg",
      "source": "现代风/大图(5).rar/大图/5.jpg",
      "width": 1600,
      "height": 875,
      "sourceSha256": "f4d551d4d0f1c9379ee54264f6c30ea85dd4d47b2764f714ad2689e4f78de984",
      "sha256": "edd613a968c4ffd4ae6e3ee93739d3f6325158dfefcebef6a19c489a934881d2",
      "direction": "以本次所选参考图的实际颜色、家具轮廓、材质纹理和光线为准，不混用其他案例。"
    }
  },
  {
    "key": "italianMinimal",
    "name": "意式极简",
    "aliases": [
      "意式现代",
      "极简奢华"
    ],
    "previewImage": "modern-living",
    "palette": [
      "#dedbd3",
      "#67564b",
      "#34383b"
    ],
    "note": "深木与灰石、低矮家具、层次光",
    "materialTags": [
      "木饰面",
      "灰色石材",
      "金属玻璃"
    ],
    "spaceTags": [
      "客厅",
      "餐厅",
      "主卧"
    ],
    "prompt": "参照意式极简原图，用灰石材、深棕木饰面、金属玻璃展示柜和连续收纳构成建筑感背景。采用低矮浅色模块沙发、石材圆茶几、简洁餐桌及少量棕色或红色单椅，强调材质拼接和清晰分缝。深色案例保留深灰光泽地面和黑色边框；浅色案例维持浅石材与柔和日光。灯带、筒灯和环形吊灯保持参考图的层次，不无依据复制电竞房装饰到客厅。",
    "negativePrompt": "避免过度冷蓝、家具漂浮、满屋亮金、商业展厅或全屋电竞灯光，不复制图片标识，不改变墙体门窗。",
    "budgetFactor": 1.16,
    "compatibilityStyles": [
      "modern",
      "european"
    ],
    "sourceFolder": "企业网盘/共享资源/案例文件/主流风格/意式极简",
    "sourceStyleKey": "italianMinimal",
    "id": "whole-home-italianMinimal",
    "paletteNames": [
      "暖灰",
      "深木色",
      "炭灰"
    ],
    "reference": {
      "id": "italianMinimal-71b02657eee3",
      "image": "/style-assets/italianMinimal-71b02657eee3.jpg",
      "thumbnail": "/style-assets/italianMinimal-71b02657eee3-thumb.jpg",
      "source": "意式极简/微信图片_20261031155800_258_66.jpg",
      "width": 1600,
      "height": 928,
      "sourceSha256": "71b02657eee37965a2f4f153694bac01eed45561f53cc9b3b52f4cd1af7a52c8",
      "sha256": "69c3248e726ea51345350946ffae6177afb3e989588625122f2049394de58344",
      "direction": "以本次所选参考图的实际颜色、家具轮廓、材质纹理和光线为准，不混用其他案例。"
    }
  },
  {
    "key": "woodCream",
    "name": "原木奶油风",
    "aliases": [
      "奶油原木",
      "原木温柔风"
    ],
    "previewImage": "nordic-bedroom",
    "palette": [
      "#eee8db",
      "#bb966f",
      "#65715a"
    ],
    "note": "浅木柜体、奶白墙面、柔软曲线",
    "materialTags": [
      "浅色木作",
      "奶白涂料",
      "棉麻织物"
    ],
    "spaceTags": [
      "卧室",
      "客厅",
      "小户型"
    ],
    "prompt": "依据原木奶油风所选原图，使用奶白墙顶、浅暖木色地板与柜体，连续收纳和轻巧木质餐桌椅。浅色布艺沙发、圆润茶几、柔软地毯、纸质或玻璃灯具与窗边绿植营造柔和生活感。若所选案例带法式元素，保留细石膏线、弧形门洞、较深木色与绿色沙发；其他案例保持浅木简洁比例。采用自然侧光与柔和灯带，不将不同案例的特色全部混入。",
    "negativePrompt": "避免全屋深木、统一纯白丢失木色、强烈冷光、过度曲面、复制画面文字或全景畸变，不更改户型结构。",
    "budgetFactor": 1.02,
    "compatibilityStyles": [
      "minimal"
    ],
    "sourceFolder": "企业网盘/共享资源/案例文件/主流风格/原木奶油风",
    "sourceStyleKey": "woodCream",
    "id": "whole-home-woodCream",
    "paletteNames": [
      "奶白",
      "浅暖木色",
      "绿灰"
    ],
    "reference": {
      "id": "woodCream-e0dfb5bfbaad",
      "image": "/style-assets/woodCream-e0dfb5bfbaad.jpg",
      "thumbnail": "/style-assets/woodCream-e0dfb5bfbaad-thumb.jpg",
      "source": "原木奶油风/6333现代奶油原木风(1).zip/6333现代奶油原木风/12.jpg",
      "width": 1600,
      "height": 955,
      "sourceSha256": "e0dfb5bfbaad2d3f748069120850c8061ad0dcd5481266099de7f6bd76adfe48",
      "sha256": "720b1cc8bee6d96fab1dd54c784d67eaf65183b0a49a5a3d1f2fdbd3fa54b6d5",
      "direction": "以本次所选参考图的实际颜色、家具轮廓、材质纹理和光线为准，不混用其他案例。"
    }
  },
  {
    "key": "vintage",
    "name": "中古风格",
    "aliases": [
      "中古现代",
      "复古混搭"
    ],
    "previewImage": "wabi-home",
    "palette": [
      "#e9dfca",
      "#9d724c",
      "#53463a"
    ],
    "note": "暖木、奶白、复古家具与灯光",
    "materialTags": [
      "暖色木作",
      "棉麻织物",
      "浅色石材"
    ],
    "spaceTags": [
      "客厅",
      "餐厅",
      "工作区"
    ],
    "prompt": "依据中古风格方案 PDF 中所选参考图，采用奶白与浅暖木基调，低矮木质家具、棉麻沙发、圆形或异形深木茶几、复古灯具、陶瓷与绿植。客餐厅保持生活化组合，卧室延续浅木柜体、木作边框与柔软床品，窗边自然光配合暖色灯带。忠于该案例的明亮温润质感，不把中古等同于昏暗棕色堆砌。生成完整空间效果图，不生成汇报页或施工图。",
    "negativePrompt": "避免老旧杂乱、满屋古董、过暗滤镜、复制 PDF 页边框与标题、图纸线稿和画面文字，不改动户型结构。",
    "budgetFactor": 1.1,
    "compatibilityStyles": [
      "european",
      "wabi"
    ],
    "sourceFolder": "企业网盘/共享资源/案例文件/主流风格/中古风格",
    "sourceStyleKey": "vintage",
    "id": "whole-home-vintage",
    "paletteNames": [
      "奶白",
      "暖木色",
      "深棕"
    ],
    "reference": {
      "id": "vintage-98465ce76ebc",
      "image": "/style-assets/vintage-98465ce76ebc.jpg",
      "thumbnail": "/style-assets/vintage-98465ce76ebc-thumb.jpg",
      "source": "中古风格/（已压缩）花漾蔚蓝(1).pdf#page=1",
      "width": 1200,
      "height": 1600,
      "sourceSha256": "98465ce76ebc3c84172256c6c0e1155590a928d62caecd3f5b47b2d3494a78c5",
      "sha256": "ad9f41a8afa0c745e5d4361a3501d21129f44d85259268951a158b4b94f9d38d",
      "direction": "以本次所选参考图的实际颜色、家具轮廓、材质纹理和光线为准，不混用其他案例。"
    }
  }
] as const;

export type WholeHomeStyle = typeof wholeHomeStyles[number];
export function getWholeHomeStyle(key: string) {
  return wholeHomeStyles.find(style => style.key === key);
}
export function wholeHomePrompt(style: WholeHomeStyle) {
  return [style.prompt, style.reference.direction, '全屋统一风格，按各房间功能组织家具与材质；所选效果图仅作为色彩、材质、家具和光线参考。户型结构以用户上传的图纸为准，保持墙体、门窗、空间比例及房间连接，不照搬参考图的户型。', '反向约束：' + style.negativePrompt].join(' ');
}
