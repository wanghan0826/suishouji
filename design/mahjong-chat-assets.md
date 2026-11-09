# Mahjong chat assets and voice messages

## AI sticker atlas

- Built-in `image_gen` (imagegen skill), transparent generation, 2026-11-09.
- Project asset: `public/assets/mahjong-chat-stickers-v1.webp`, 1024×1024 RGBA WebP, 416,748 bytes. One four-column/four-row atlas; CSS selects each cell without 16 separate downloads. Original PNG is retained in the Codex generated-images folder.
- Cell order: 打招呼、大笑、鼓掌、想一想、好牌、再来一局、比心、得意、震惊、哭哭、拜托、生气、困了、快出牌、打得好、害羞。
- The existing nine Mahjong avatars remain independent. Stickers appear in a collapsible picker and in private table chat.

Final generation prompt:

> Use case: stylized-concept. Create ONE production sprite atlas image for a Chinese Mahjong game's chat stickers, a precise 4 by 4 grid with exactly 16 equally sized square cells. Transparent background. Every cell has one standalone cute polished chibi 3D character bust, the SAME original warm friendly young Mahjong club mascot: round face, short dark chestnut hair, teal casual jacket with small gold trim, big expressive eyes, soft toy-like 3D render matching premium chibi game avatars. Keep identical scale, centered alignment, generous transparent margins inside EVERY cell, no overlap across grid cells. No drawn cell borders, no text, no numbers, no watermarks. Each face and hands occupy the central 70 percent of its cell. Row 1 left to right: 1 joyful waving hello; 2 laughing hard with closed eyes; 3 clapping hands in applause; 4 thinking with hand on chin. Row 2: 5 amazed sparkling eyes holding one lovely blank Mahjong tile; 6 inviting another round with energetic fist pump; 7 smiling heart hands; 8 smug proud raised eyebrow. Row 3: 9 shocked open mouth and wide eyes; 10 crying big cartoon tears; 11 pleading puppy eyes with palms together; 12 mildly angry puffed cheeks and folded arms. Row 4: 13 sleepy yawn with a hand covering mouth; 14 impatient wristwatch tap asking to play faster; 15 laughing thumbs up saying great play without any written text; 16 shy embarrassed face with a sweat drop. Clear distinct readable silhouettes and expressions at small 56 pixel chat size. This is a single UI sprite sheet, not a poster or screenshot. Uniform four-column four-row geometry is critical.

## Female pong call

`public/assets/mahjong-female-pong-185d458e.wav` appends a Mandarin female “碰！” to the existing 34 tile names. Voice: `zh-CN-XiaoxiaoNeural`, rate `+8%`, generated with `edge-tts`. The new cue is sample offset 459718, length 9101, at 24 kHz. Total 937,682 bytes. Rebuild using `node scripts/build-mahjong-pong.mjs pong.mp3 [ffmpeg-executable]`.

The server adds bounded `sounds` events only when a discard commits or a pong wins claim resolution. A pong that loses to hu, a button click or a retried request produces no call. Old saved rooms fall back to their existing discard stream. Humans and bots use the same event path; reconnects do not replay events. Tile/call announcements temporarily lower chat voice volume.

## Recorded table messages

- Browser `getUserMedia` and `MediaRecorder`; hold to record, release to send, slide up to cancel (coordinates account for a CSS-rotated phone table). Microphone authorization is required; recordings automatically stop at 30 seconds and clips shorter than 0.5 seconds are rejected. A recording stops on hiding the page, losing focus, closing chat or leaving the room.
- WebM/Opus, Ogg/Opus and MP4/AAC are negotiated with `MediaRecorder.isTypeSupported`. Requested audio rate is 64 kbps. The server accepts at most 512 KiB per clip, validates the allowed container signature, duration bounds and canonical Base64, and stores audio as a private SQLite BLOB. It limits new voice messages to six per minute per account; unchanged operation IDs retry without inserting a duplicate.
- Only currently seated, authenticated players can fetch `/api/mahjong/:token/voice/:id`; expired/closed rooms and departed/disabled accounts cannot. Audio responses have `no-store`, `nosniff` and bounded single byte ranges. SSE includes message metadata and a private URL, never the audio BLOB. Audio rotates out with the latest 48 chat messages and is removed during expired-room cleanup.
- Recipients automatically play fresh incoming messages after a user gesture enables audio. A sender does not automatically hear their own recording. Playback is sequential, can be replayed or stopped, and has a persisted auto-play toggle. Loading another voice cancels the previous fetch; room/account changes invalidate pending decoding. Reloaded history is not auto-played. Unsupported/denied microphone access shows a retryable explanation.
- Browser background/autoplay policies still apply. Primary references: [MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder), [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

## Validation

The integration tests use isolated SQLite databases. Browser QA uses Edge's synthetic microphone with the actual MediaRecorder encode, server upload, authenticated download and AudioContext decode/playback pipeline; it does not claim real-device acoustic testing. Three accounts verified auto-play, no own-message auto-play, sequential messages, initial gesture gating, mute preference, slide cancellation, permission failure, 30-second stopping, replay, rapid playback switching, lost-response deduplication and no history replay. The full table regression covers private kongs, score settlement, next hand, reconnect and logout. Dense layout fixtures include all four meld groups for every opponent and 17 discards per player, across 320–420 portrait and 568–1280 landscape viewports.
