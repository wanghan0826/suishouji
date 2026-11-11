# 首页原创视觉与使用说明

本次只调整弹幕首页。保留真实帖子弹幕、随机循环、暂停控制、帖子展开与全屏阅读、主题和省流选项。首屏新增可关闭的游戏选择面板，下方提供四款游戏与三个社区分区的明确入口。弹幕轨道在布局时根据介绍区域高度留出空间，不在动画帧中读取该高度。

## 素材

制作方式：内置 image_gen，generate 模式，透明背景。未使用第三方图标素材或远程图片。

- `public/assets/home-play-scene-v1.webp`：1080px，119236字节，首页环境插画。
- `public/assets/home-play-scene-v1-small.webp`：480px，36430字节，手机环境插画。
- `public/assets/home-games-v1.webp`：1024px，146898字节，四款游戏的2×2插画精灵图。
- `public/assets/home-games-v1-small.webp`：512px，48462字节，手机精灵图。

WebP由生成的透明PNG缩放压缩，保留透明度。原始PNG已复制到工作区outputs目录，线上使用以上四个WebP。手机首屏选择小图；省流模式不请求新增图片，保留文字入口。原有背景图片轮播功能保留。

## 最终提示词

### 首页环境插画

Use case: stylized-concept. Asset type: original transparent decorative illustration for the homepage of Suishouji, a Chinese browser mini-game and live-bullet-comment community. Create one polished editorial 3D miniature scene: a shared green felt play table with a few ivory mahjong tiles and red/black playing cards, a small sketchbook and colored pencils, and two blank chat bubbles that connect the games to conversation. No people required. Style: sculpted paper and painted ceramic, precise silhouettes, subtle material texture and soft contact shadows, sophisticated and inviting rather than nursery-like. Sage green, deep teal, cream, restrained warm orange, small cobalt accents. Landscape 3:2 composition; keep objects clustered in the right half and lower centre, leave spacious transparent margins. Clearly readable at small sizes. No typography, no logos, no letters, no coins, no currency, no casino elements, no stock icon look. Genuine transparent background.

### 四款游戏插画精灵图

Use case: stylized-concept. Asset type: one square transparent 2-by-2 sprite sheet of four original miniature browser-game illustrations for a mature friendly social website. Four equal square quadrants with generous transparent padding, no grid lines. TOP LEFT: two blank rounded speech tiles linked by a small warm-orange bridge, representing two people guessing the same word. TOP RIGHT: an open sketchbook with one simple doodle, green pencil and coral paint brush. BOTTOM LEFT: a neat little group of ivory mahjong tiles with green bamboo and circle patterns, jade-green tile backs. BOTTOM RIGHT: three fanned cream playing cards with red heart and dark spade shapes, a restrained navy back. Consistent three-quarter isometric angle, sculpted paper/painted ceramic material, rich soft shadows, crisp detailed silhouette, sage green/deep teal/cream/coral palette with subtle cobalt. Each quadrant must contain only its one separate cluster, entirely within its own quadrant with empty transparent margins. No writing, no words, no numbers, no brands, no people, no coins, no casino decor, no borders or badges. Real transparent background, editorial craft illustration quality, not stock vector icons.

## 验证与发布

浏览器模拟常见手机竖屏、电脑与8种主题，检查首屏入口、菜单边界、菜单打开不暂停弹幕、帖子展开与全屏、发帖入口、省流模式和游戏链接。测试帖子仅在独立本地SQLite创建，未写入生产数据。按用户既有流程先提交GitHub，再由Actions部署到阿里云；线上仅进行读取和资源版本核对。

