-- Platform-only planning estimates based on the style templates in D:/开发/主流风格.
-- These are broad, modelled material ranges, not supplier quotes or transaction prices.
create table budget_style_references (
    style_code varchar(40) primary key,
    style_name varchar(80) not null,
    material_factor numeric(5,3) not null check (material_factor > 0),
    estimate_note varchar(500) not null
);

create table budget_style_material_references (
    id bigint generated always as identity primary key,
    style_code varchar(40) not null references budget_style_references(style_code) on delete cascade,
    category varchar(40) not null,
    material_name varchar(120) not null,
    specification varchar(200) not null,
    unit varchar(20) not null,
    price_low numeric(10,2) not null check (price_low > 0),
    price_high numeric(10,2) not null check (price_high >= price_low),
    estimate_note varchar(500) not null,
    sort_order integer not null default 0
);

create index budget_style_material_references_style_idx
    on budget_style_material_references(style_code, sort_order, id);

insert into budget_style_references(style_code, style_name, material_factor, estimate_note) values
('bauhaus', '包豪斯', 1.100, '按几何造型、彩色饰面与定制细节较多的中档材料组合估算。'),
('french-cream', '法式奶油风', 1.120, '按弧形线条、石膏装饰、暖白饰面与定制柜体组合估算。'),
('french-natural', '法式自然风', 1.100, '按自然木饰面、石材与适量法式线条组合估算。'),
('old-money', '老钱风', 1.280, '按天然木皮、石材、金属收边等较高材料档次估算。'),
('song', '宋式美学', 1.200, '按木作格栅、自然石材与手作质感饰面组合估算。'),
('modern', '现代风', 1.040, '按常规现代饰面、局部金属及中档定制组合估算。'),
('modern-minimal', '现代简约', 1.000, '按常规环保涂料、标准地面材料与基础定制组合估算。'),
('small-american', '小美风格', 1.140, '按线框柜门、复古五金与木地板等材料组合估算。'),
('italian-minimal', '意式极简', 1.260, '按大规格岩板、木皮饰面、隐形门及精细五金组合估算。'),
('wood-cream', '原木奶油风', 1.080, '按浅木饰面、哑光涂料与织物质感材料组合估算。'),
('mid-century', '中古风格', 1.220, '按胡桃木饰面、复古砖与特色灯具组合估算。'),
('chinese', '中式风格', 1.240, '按木作线条、石材与中式定制构件组合估算。');

-- Example material allowances per common purchase unit. Ranges vary by grade and local market;
-- use them only for early planning and replace them with current local supplier quotes before contracting.
insert into budget_style_material_references
    (style_code, category, material_name, specification, unit, price_low, price_high, estimate_note, sort_order) values
('bauhaus','地面','彩色通体砖/水磨石砖','常规规格，非艺术定制','元/㎡',120,280,'材料估算；不含铺贴人工、基层处理与损耗。',1),
('bauhaus','墙面','哑光乳胶漆及局部艺术涂料','环保中档，局部色块','元/㎡',35,110,'材料估算；特殊艺术漆按实际样板另询。',2),
('bauhaus','木作','彩色饰面板柜体','常规环保板材，含基础封边','元/延米',700,1500,'柜体材料参考，不含复杂五金及安装。',3),
('bauhaus','台面','石英石台面','常规厚度与基础加工','元/㎡',500,1200,'不含异形加工、挡水与安装。',4),
('french-cream','地面','哑光木纹砖/复合木地板','中档常规规格','元/㎡',100,260,'材料估算；不含铺贴人工与找平。',1),
('french-cream','墙面','环保乳胶漆/肌理涂料','暖白色系，中档','元/㎡',30,100,'石膏线、护墙板等造型材料另计。',2),
('french-cream','木作','线框柜门与柜体板材','环保板材，基础线框造型','元/延米',800,1700,'不含高端实木、复杂五金及安装。',3),
('french-cream','装饰','石膏线与装饰构件','常规成品线条','元/延米',25,100,'异形定制件价格差异较大。',4),
('french-natural','地面','橡木色复合地板/仿木砖','中档常规规格','元/㎡',120,320,'材料估算；不含铺装人工及基层。',1),
('french-natural','墙面','矿物涂料/环保乳胶漆','自然肌理，中档','元/㎡',35,130,'不含特殊手工艺术涂层施工费。',2),
('french-natural','木作','木皮饰面柜体','环保板材与木纹饰面','元/延米',800,1800,'不含实木升级及特殊收边安装。',3),
('french-natural','台面','天然石材/石英石','常用花色与厚度','元/㎡',600,1800,'石种、纹理和加工方式会显著影响价格。',4),
('old-money','地面','天然木地板/天然石材','中高档常规品级','元/㎡',260,900,'材料估算；珍稀木种和名贵石材不在范围内。',1),
('old-money','墙面','木皮/石材饰面','常规木皮与中档石材','元/㎡',180,700,'不含复杂基层、拼花和安装人工。',2),
('old-money','木作','木皮定制柜体','中高档板材、基础五金','元/延米',1300,2800,'实际按木皮品种、五金和深化图报价。',3),
('old-money','五金','金属收边与基础五金','不锈钢/黄铜色基础款','元/套',300,1500,'品牌及表面工艺影响较大。',4),
('song','地面','木地板/自然石材','中档木色及常用石材','元/㎡',180,650,'不含特殊拼花和铺装人工。',1),
('song','墙面','肌理涂料/艺术涂料','低饱和自然纹理','元/㎡',50,180,'手工工艺施工费另计。',2),
('song','木作','格栅与木饰面柜体','木纹饰面环保板材','元/延米',900,2200,'格栅密度、木皮等级及收口会影响实际价。',3),
('song','石材','天然石材/人造石','常用灰米色系','元/㎡',350,1300,'不含异形加工与安装。',4),
('modern','地面','瓷质砖/复合木地板','中档常规规格','元/㎡',80,240,'材料估算；不含铺装人工和辅料。',1),
('modern','墙面','环保乳胶漆','常规品牌中档品级','元/㎡',20,60,'不含基层修补及涂刷人工。',2),
('modern','木作','饰面板定制柜体','环保板材与基础五金','元/延米',650,1450,'不含高端五金及复杂造型。',3),
('modern','台面','石英石台面','常规厚度与加工','元/㎡',450,1100,'不含异形加工和安装。',4),
('modern-minimal','地面','瓷质砖/复合木地板','标准规格、中档基础品','元/㎡',70,200,'材料估算；不含铺贴人工与损耗。',1),
('modern-minimal','墙面','环保乳胶漆','常规白色系','元/㎡',18,50,'不含基层处理及涂刷人工。',2),
('modern-minimal','木作','标准饰面柜体','环保板材与基础五金','元/延米',550,1200,'按常规柜体深度估算，不含特殊内部配件。',3),
('modern-minimal','台面','石英石台面','常规花色与厚度','元/㎡',400,900,'不含异形加工与安装。',4),
('small-american','地面','复合木地板/仿古砖','复古色系常规规格','元/㎡',120,320,'不含铺装人工和特殊拼法。',1),
('small-american','墙面','环保乳胶漆','暖白/低饱和色系','元/㎡',20,65,'线框和护墙板材料需另计。',2),
('small-american','木作','线框柜门与柜体','环保板材、基础造型','元/延米',800,1750,'实木门板、复杂线框另询价。',3),
('small-american','五金','黄铜色基础五金','常规拉手及合页','元/套',150,800,'品牌与表面工艺影响较大。',4),
('italian-minimal','地面','大规格瓷砖/岩板','常规大规格，中高档','元/㎡',220,800,'不含铺贴、搬运及特殊加工。',1),
('italian-minimal','墙面','艺术涂料/木皮饰面','简洁连续面，中高档','元/㎡',60,320,'不含复杂基层与施工人工。',2),
('italian-minimal','木作','木皮隐形门及定制柜体','木纹饰面、基础隐形门五金','元/延米',1300,3000,'不含高端进口五金和异形定制。',3),
('italian-minimal','台面','岩板台面','常规品级与基础加工','元/㎡',700,2200,'品牌、厚度和加工损耗差异较大。',4),
('wood-cream','地面','浅橡木复合地板/木纹砖','常规中档规格','元/㎡',110,280,'不含铺装人工及基层找平。',1),
('wood-cream','墙面','环保乳胶漆/微肌理涂料','奶油白与浅色系','元/㎡',22,75,'不含基层和涂刷人工。',2),
('wood-cream','木作','浅木纹饰面柜体','环保板材与基础五金','元/延米',700,1550,'实木、木皮升级及特殊收口另计。',3),
('wood-cream','台面','石英石/浅色岩板','常规浅色品级','元/㎡',450,1600,'不含异形加工与安装。',4),
('mid-century','地面','复古花砖/木地板','局部拼花与常规木地板','元/㎡',150,450,'花砖铺贴人工及拼花损耗另计。',1),
('mid-century','墙面','乳胶漆/木皮点缀','复古低饱和色系','元/㎡',25,180,'特殊墙面饰材另询价。',2),
('mid-century','木作','胡桃木纹饰面柜体','环保板材与复古色饰面','元/延米',900,2100,'不含实木升级和特色五金。',3),
('mid-century','灯具','装饰灯具参考包','常规客餐厅及卧室基础灯具','元/套',1500,6500,'品牌、数量及智能控制会影响总价。',4),
('chinese','地面','木地板/石材/仿古砖','中档常规品级','元/㎡',140,500,'材料估算；不含铺装人工和特殊拼花。',1),
('chinese','墙面','肌理涂料/木饰面','中式低饱和基底','元/㎡',40,260,'不含复杂基层和现场施工。',2),
('chinese','木作','格栅及定制木作','环保板材与常规木纹饰面','元/延米',1000,2600,'实木、榫接和复杂纹样另计。',3),
('chinese','石材','天然石材/人造石','常见灰色与米色系','元/㎡',350,1500,'不含异形加工与安装。',4);
