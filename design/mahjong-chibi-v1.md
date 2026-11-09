# 麻将Q版人物与竹条牌面

制作日期：2026-11-09。头像通过内置 imagegen 工具分别生成，共九个原创角色；透明背景，不采用商业游戏角色。最终素材保存在 `public/assets/mahjong-chibi-v1-1.webp` 至 `mahjong-chibi-v1-9.webp`。每张384×384，保留透明通道，按需加载。

发布前裁去外围透明空白，统一缩放至352×352以内，并补足16px透明边距，使不同发型的角色在头像框中保持相近的视觉大小。

人物按公开的账号标识（练习机使用名称）稳定映射到九个角色，同一玩家刷新或换座位时保持一致。该图案是牌桌装饰，不代表用户本人上传的头像。样式仅应用于麻将。

竹条牌面使用原有 SVG 绘制流程，独立重画一到九条：每一个连续的竹条轮廓计一条，内部竹节不增加数量；一条采用单根竹条。五条中心、七条上排和九条中列用红色区分排列。手牌、碰杠和牌河共用同一个绘制函数。

## 最终生成提示词

共用提示词：

> Use case: stylized-concept. Asset type: a single original game avatar for a friendly mobile Mahjong table. Create ONE isolated chest-up character portrait, perfectly centered in a square canvas. Style: polished charming Q-version chibi 3D game illustration, oversized round head about 70 percent of portrait height, large expressive warm eyes, small nose and body, rounded stylized hair locks, exquisite soft clay-like materials, neat cel-shaded gradients, readable strong silhouette at 48 pixels. Clearly chibi rather than realistic adult proportions. Consistent front-facing three-quarter view turned slightly toward the viewer, shoulders visible, entire hair silhouette inside canvas with generous 6 percent padding, bust bottom near lower edge. Soft warm studio key light from upper left, gentle jade rim light, rich but restrained teal/coral/cream color harmony. Background: truly transparent. No background scene, no frame, no circle, no text, no logo, no watermark, no Mahjong tiles, no props, no hands. Do not imitate any existing franchise character. Character: 

第一张作为其余八张的画风参考。其余各张增加：

> The input image is a STYLE REFERENCE only, not a character identity to preserve. Generate a NEW distinct character matching its polished chibi rendering, facial proportions and lighting. Keep the entire hair inside the canvas with at least 6 percent empty transparent margin at top.

每个角色的 Character 段：

1. a cheerful young adult East Asian man with short fluffy black hair and a small upward hair tuft, jade-teal hoodie with ivory drawstrings, confident friendly closed-mouth smile.

2. a bright young adult East Asian woman with short chestnut bob hair and full bangs, small coral hair clip, peach-orange casual jacket over cream shirt, lively gentle smile.

3. a calm young adult East Asian man with wavy navy-black hair, round dark-rimmed glasses, ivory sweater over teal shirt collar, thoughtful friendly smile.

4. a cheerful young adult East Asian woman with high black ponytail, a few curved bangs, jade-green bomber jacket with cream trim, confident happy expression.

5. a kindly older East Asian gentleman with fluffy silver hair, short tidy silver beard and moustache, curved smiling eyes, navy cardigan over ivory shirt, warm grandfatherly smile.

6. a lively older East Asian lady with soft silver hair in a high neat bun, thin round gold glasses, muted plum cardigan and cream collar, rosy cheeks, warm delighted smile.

7. an energetic young adult East Asian man with fluffy auburn curly hair, rust-orange varsity jacket with cream sleeves over teal shirt, wide cheerful grin.

8. a gentle young adult East Asian woman with lavender-black shoulder-length wavy hair, cream hoodie with jade trim, tiny plum hairpin, soft welcoming smile.

9. a relaxed young adult East Asian man with smooth black hair tied in a small half-up bun, burgundy casual Mandarin-collar jacket with cream inner collar, playfully raised eyebrow and friendly smile.

第一张后续仅调整取景与边缘：保持人物身份、表情、服饰、色彩、Q版比例与渲染，留出至少8%顶部及侧面透明空间，显示完整发型，去除发型外的光雾与毛边；透明背景。

## 检查

- 检查一到九条分别包含一至九个独立竹条轮廓，14张手牌在手机横屏及旋转竖屏中保持完整。
- 检查九张图片可解码、透明通道保留，座位显示使用新图，刷新和不同浏览器中的同一玩家保持相同角色。
- 沿用本地独立数据库，检查选牌、打牌、文字与表情聊天、语音报牌、暗杠隐藏、自摸结算和下一局。生产站点验证只读。

