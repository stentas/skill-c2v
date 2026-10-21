# Voice

- Two sources, one file per voiced scene in `audio/`: **Kokoro** offline (English, the default for
  English videos; the main session runs `pnpm tts`) and **ElevenLabs** online (Norwegian and other
  languages; the user generates the files). Scenes may mix both. Either way Claude provides the text,
  one paragraph per scene, in `audio/voice-script.txt` (the `voiceText` file in `video.config.json`;
  paragraph N = voiced scene N).

ElevenLabs:

- The user generates the audio in the ElevenLabs web app from that text.
- Pick a voice whose native language is the target language (Voice Library filter). Generic
  multilingual voices often get a Swedish/Danish accent and wrong stress in Norwegian.
- Test the product name, long compound words and menu names first. If a word is mispronounced,
  spell it phonetically in the ElevenLabs text only (e.g. split a camel-case product name with a
  hyphen) – keep the storyboard text correct.
- Commercial use requires a paid plan.
- One file per scene. ElevenLabs' default names (`1_Chapter_1.mp3`, …) are fine; map them in
  `video.config.json`.

Both:

- After the files arrive (or after `pnpm tts`): `pnpm align`, then `pnpm voice-meta` measures durations and
  pauses; clip duration = lead 0.5 s + audio + tail 0.8 s. `cue("phrase")` returns when a phrase is spoken
  (measured word times when `pnpm align` has run, otherwise word-length weighted, pinned to measured pauses).
- If the spoken text differs from the storyboard, the audio text wins: update the storyboard and
  on-screen summaries to match what is said.
- Disclose synthetic voice where required (EU AI Act art. 50 transparency); a line in the video
  description is usually enough. No avatars for screen-based documentation – they take space and
  reduce credibility.

Measured word times and captions (2026-10-21):

- `pnpm align` runs Whisper offline (about 291 MB once, then no network; 84 s of audio in about 5 s) and writes
  `audio/<audio file>.words.json` per voice file – Kokoro, ElevenLabs or a human recording. `pnpm voice-meta` merges
  it into `shared/voice.js`, so `cue()`/`cueEnd()` and `S.words` use measured times (about 0.1 s). Without it the
  estimate still works: usually within 0.2 s in short paragraphs with clear pauses, but up to 2.5 s off in an
  84-second single paragraph.
- Order: `pnpm tts` (or the ElevenLabs files) → `pnpm align` → `pnpm voice-meta`. Re-run both `align` and `voice-meta`
  whenever an audio file or the voice text changes; a stale `.words.json` is ignored with a warning.
- Language: no auto-detection, default `"en"`. Norwegian or any other language needs
  `"align": { "language": "no" }` (Whisper language code) in `video.config.json`.
- Under 50 % of the script words recognised: the scene is rejected; 50–80 %: a warning – check that the voice text
  matches what is said, or try `--model onnx-community/whisper-small_timestamped`.
- Captions: `pnpm assemble` writes `<output>.srt` from the measured words (`pnpm captions` alone); burned-in
  captions are `captionTrack(S)` in a scene (`toolkit/ENGINE-API.md`). Ask in intake: burned in, SRT only, or none.

Tool details: `tools/kokoro.md` (offline, `pnpm tts`, voices, cache) and `tools/elevenlabs.md` (model
choice, licence, the optional API flow).
