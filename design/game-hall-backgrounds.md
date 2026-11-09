# Game hall backgrounds

Created using the built-in imagegen tool. Original PNGs remain in the Codex generated-images directory. The project ships responsive WebP copies made with Sharp, preserving the original composition.

## Landlord

- Desktop: `public/assets/landlord-hall-v1.webp` (1536 px wide; 111,094 bytes).
- Mobile: `public/assets/landlord-hall-v1-mobile.webp` (768 px wide; 24,578 bytes).
- Source: `exec-90e35ea1-8790-44a4-93ef-ce4c09db6e2d.png`.

Final prompt:

> Use case: stylized-concept. Asset type: original wide background illustration for a Chinese casual card game's lobby hero, landscape 16:9. A premium deep emerald green felt card table with a thin walnut wooden rim and delicate muted gold pinstripe details. Beautiful slightly stylized tactile material, warm directional evening light, refined rather than childish. On the RIGHT THIRD only, a small elegant fan of ivory playing cards with accurate simple red and black suit symbols, one ace and king visible, natural shadows and a few restrained golden floating dust specks. The LEFT TWO THIRDS is quiet dark green felt, low contrast, spacious and completely free of objects so live UI text can overlay it. Tabletop close-up, not an entire room. The playing cards must stay within generous image margins for responsive cropping. Editorial 3D illustration with crisp edges, polished believable depth. No people, no coins, no chips, no currency, no logos, no UI, no captions, no watermark, no large text.

## Drawing

- Desktop: `public/assets/draw-hall-v1.webp` (1536 px wide; 85,426 bytes).
- Mobile: `public/assets/draw-hall-v1-mobile.webp` (768 px wide; 20,594 bytes).
- Source: `exec-cfc8f83b-aed2-4f50-82f7-0c3132cca87d.png`.

Final prompt:

> Use case: stylized-concept. Asset type: original wide background illustration for a friendly multiplayer drawing game's lobby hero, landscape 16:9. Warm ivory sketchbook paper with subtle tactile grain, clean and light. On the RIGHT THIRD only, an artful small arrangement of colored pencils in coral orange, sunflower yellow and teal, a pencil shaving curl, two small hand-drawn looping doodles and a lively blue/teal brushstroke on the paper. Contemporary editorial 3D illustration with crisp edges and lovely soft realistic contact shadows, cheerful but refined rather than nursery style. The LEFT TWO THIRDS is quiet pale cream blank paper for readable live UI text. Objects and doodles stay inside generous safe margins for phone crops. A thin graph-paper trace and tiny coral marks near outer edges provide a subtle background. No people, no words, no letters, no numbers, no logos, no interface, no watermark. Wide banner composition, no mockup device.

## Integration

- Decorative images have empty alt text; game names and actions remain real accessible HTML.
- `game-halls.css` scopes presentation to the halls; card-table and live-canvas layouts keep their existing rules.
- Both halls use portrait scrolling on phones. Landlord room routes enable the existing landscape layout; returning to the hall restores portrait layout.
- Main actions precede recent rooms and collapsed rules. Drawing invitation input accepts the local drawing route or a 32-character room token, and always navigates to this site's room path.
