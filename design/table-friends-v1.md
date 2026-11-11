# 移动牌桌原创头像

生成方式：内置 imagegen 工具，透明背景。供激战麻将与经典斗地主展示座位使用，不代表用户本人头像。

素材：`public/assets/table-friends-v1.webp`，1440×480，RGBA，约248KB。由工具输出的原图等比缩小并转换为 WebP，保留透明通道；每个角色占横向四分之一。界面由 CSS 选取对应区域。

最终提示词：

> Use case: stylized-concept. Asset type: original portrait sprite sheet for a mobile Mahjong and Chinese card game. Create one wide horizontal strip with EXACTLY FOUR equal square cells, four separate adult friends from the shoulders up, each bust fully contained in its own cell with generous transparent spacing. Left to right: a confident young man with short dark hair in an ivory jacket and teal shirt; a bright young woman with a dark bob haircut and rust orange casual jacket; a relaxed older man with silver hair, thin round glasses and a navy cardigan; a cheerful young woman with a tied-up ponytail in a jade green hoodie. Polished stylized 3D game character portrait illustration with sculpted soft lighting, expressive friendly faces, believable adult proportions, detailed cloth, tasteful warm highlights and refined sharp silhouettes. All face roughly forward, varied subtle expressions, inviting friendly tabletop game mood. Transparent background, no backdrop, no frames, no circles, no cards, no tiles, no typography, no letters, no UI, no logos, no watermarks. Four same-size individual portraits aligned on the exact same baseline, each takes the same height. Output landscape 4:1 sprite sheet if possible.

实际输出原图为2172×724（3:1），四个角色各占一个3:4区域。牌面、文字、按钮以及桌面均为独立的界面元素，不包含在生成图中。
