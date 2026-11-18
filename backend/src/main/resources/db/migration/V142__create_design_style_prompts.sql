create table design_style_prompts (
    style_key varchar(40) primary key,
    style_name varchar(80) not null,
    prompt text not null,
    updated_at timestamptz not null default now(),
    updated_by uuid references auth_users(id)
);

insert into design_style_prompts(style_key, style_name, prompt) values
('modern', '现代简约', 'Contemporary Chinese modern minimalist interior, warm ivory and light greige palette, pale oak and restrained walnut veneer, clean geometric lines, concealed storage, airy circulation, soft daylight, integrated linear lighting, realistic premium materials. No clutter, ornate details or dramatic colors.'),
('song', '宋式美学', 'Contemporary Chinese interior inspired by Song dynasty aesthetics: refined restraint, deep walnut lattice screen, warm grey-beige textured walls, handmade ceramic vessels, subtle ink art, asymmetrical sparse styling, generous negative space, natural tactile materials, soft amber light. Livable modern home, not a historical set. No palace decor or clutter.'),
('smallAmerican', '小美风格', 'Compact small American classic interior: creamy raised-panel cabinetry, warm ivory walls, olive green upholstery, dark walnut floor, discreet aged brass hardware, built-in storage, balanced classic trim and restrained vintage accessories, warm natural light. Keep furniture practical and scaled to a small home; no excessive ornament.'),
('minimal', '北欧原木', 'Nordic natural wood interior: white oak, linen textiles, soft white and pale grey palette, simple practical furniture, uncluttered surfaces, generous natural daylight, light and airy circulation, matte finishes and restrained decoration. Avoid ornate details, heavy contrast and glossy luxury styling.'),
('wabi', '自然侘寂', 'Natural wabi-sabi interior: low-saturation greige, clay and walnut tones, troweled microcement, handmade terracotta tile, raw wood and rattan, irregular tactile surfaces, quiet asymmetrical composition, soft diffuse light and generous emptiness. Preserve honest material texture; avoid polished luxury and excessive decoration.'),
('cream', '奶油法式', 'Soft cream French interior: warm cream and pale apricot walls, gentle arches, restrained plaster mouldings, rounded furniture, matte wood, linen and boucle textiles, quiet layered warm lighting. Keep the mood relaxed and refined; avoid overly ornate classical decoration or sugary pink styling.'),
('chinese', '新中式', 'Contemporary Chinese interior: dark walnut lines and screens, ink-white and blue-grey palette, textured walls, natural stone, restrained grid and lattice details, spacious negative space, calm warm lighting and sparse ceramic accents. Modern livable home, not a palace or historical set; avoid red-lacquer ornament and clutter.'),
('european', '轻奢欧式', 'Restrained European light-luxury interior: stone slab, deep grey and champagne accents, dark wood veneer, brushed brass and black metal details, clean wall mouldings, controlled material contrast, elegant warm lighting. Keep the design understated and residential; avoid excessive shine, ornate palace styling and visual clutter.');
