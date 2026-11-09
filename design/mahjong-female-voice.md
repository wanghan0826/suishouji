# Mahjong female announcements

The 34 tile names use the Mandarin female voice `zh-CN-XiaoxiaoNeural`, generated with Microsoft Edge's online speech service using `edge-tts` at rate `+8%`. Source tool: https://github.com/rany2/edge-tts . No service credentials are required by the deployed application; it plays a static audio sprite.

Tile order: 一万–九万, 一筒–九筒, 一条–九条, 东风, 南风, 西风, 北风, 红中, 发财, 白板. Generate these as `00.mp3` through `33.mp3`. Example for the first clip:

```sh
edge-tts --voice zh-CN-XiaoxiaoNeural --rate=+8% --text '一万' --write-media clips/00.mp3
node scripts/build-mahjong-voice.mjs clips
```

The build script requires FFmpeg on PATH (or its executable as the second argument). It decodes to mono 24 kHz PCM, trims leading/trailing silence with 15/60 ms padding, normalizes peaks and applies a 6 ms boundary fade. Its JSON output supplies the asset path, sample rate and sample-accurate `[offset, length]` cues in `public/mahjong.js`. Asset: `public/assets/mahjong-female-2b1ac661.wav` (919,480 bytes).

The browser preloads/decodes on entering a room and unlocks audio from a user gesture. Announcements use confirmed server discard IDs, play once, never overlap, and drop stale events after 1.8 seconds. Muting and hiding the document cancel playback. No browser-dependent speech synthesis is used, so the selected voice is consistent across devices.
