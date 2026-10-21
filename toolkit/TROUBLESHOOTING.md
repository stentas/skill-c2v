# Troubleshooting

Messages printed by `render.mjs`, `assemble.mjs`, voice-meta, `pnpm tts` and `pnpm align`, with cause and fix. Lint and boundary output is explained in [README.md](README.md) › Rendering internals; the engine functions named below are in [ENGINE-API.md](ENGINE-API.md).

| Symptom | Cause and fix |
|---|---|
| `window.DEMO mangler etter 10 s` | `createDemo` did not run within the 10 s wait: a script error before it (see `sidefeil:` above it) – a missing script, a wrong path, a redeclared engine global (`const FPS`, `const $`) – or asynchronous loading that never finished |
| `fonter ble ikke lastet – mangler @font-face for X` | `fonts.css` not linked, or a family in `fonts` without local files |
| `… ikke synlig ved t=…, målt ved t=…` | target hidden when it is used; set `at` to a time it is visible, or fix the timing |
| `… fant ikke elementet på noe tidspunkt` | wrong selector, or the element is `display: none` all the time |
| `Fant ikke <sel>` / `Elementet er skjult` | `live` target / `stagePoint` on a missing or hidden element |
| cursor or camera jumps to a corner | measured while hidden; use cached targets (default) instead of `live` |
| crossfaded layer not measurable | `display: none` removes the box; use `crossfade`/`setVisible` or `{ keepLayout: true }` |
| hover flickers on the cursor path | hover reacts to everything under the cursor; bow the move (`bow`) around buttons or `hover: false` |
| `cue(): fant ikke «…»` | phrase not in the voice text (voice text drift); copy words from the audio text |
| `Scene n har ingen speakertekst` | `cue` called in a silent scene; use fixed times |
| `Advarsel: N bilder i klippet, forventet M` | encoder or concat problem; re-render the scene |
| `Kunne ikke starte nettleseren. Prøvde: …` | no Chromium-family browser could be launched (the message lists each candidate and per-OS install hints). macOS: `brew install --cask google-chrome` (or `microsoft-edge`); Debian/Ubuntu: `sudo apt install chromium` or Google's Chrome .deb; Windows: Edge is pre-installed. Or `CHROME_PATH=/path/to/binary`. `pnpm doctor` shows the same check without rendering |
| `lydnormalisering hoppet over` (assemble) | every clip is silent or the loudness could not be measured; the output is still written with a silent track. Expected for videos without voice |
| `Fant ikke ffmpeg (…)` | `pnpm install` did not fetch ffmpeg-static (build script not approved – check `pnpm-workspace.yaml` – or no network: use `FFMPEG_BIN`), or `FFMPEG_PATH` points to a missing file |
| lint `… er midt i en animasjon` at first/last frame | a fade/move overlaps the cut; end it a frame before |
| boundary `AVVIK` | end state of N ≠ start state of N+1 (page state, modal, camera, cursor); compare with the boundary table |
| audio not found (`Fant ikke lydfilen`) | `audioSrc` resolves against the scene file; for http(s) scenes against the scenes folder, then by file name in `dirs.audio` (the message lists the paths tried). `Lydfilen må være en lokal fil`: an http(s) `audioSrc` – use a relative path |
| `Kunne ikke laste Kokoro-modellen` (tts) | first run without network, or Hugging Face unreachable. Retry with network, or copy the cache folder (`~/.cache/skill-c2v/kokoro`) from a machine that has it and point `KOKORO_CACHE_DIR` there if it is elsewhere |
| `flere lydfiler passer` (voice-meta) after `pnpm tts` | scene has both a Kokoro `NN-slug.wav` and another file (e.g. an ElevenLabs mp3) starting with its id; remove the one you do not want (or set `"audio"` on the scene) |
| `Fant ikke stemmen «…»` (tts) | voice id not known to kokoro-js; `pnpm tts --list-voices` (English voices only – Norwegian needs ElevenLabs) |
| `Modellen ga N ugyldige sampler` (tts) | the model variant produced NaN audio (seen with `fp16` on the CPU); nothing was written – use `dtype: "fp32"` |
| `Kunne ikke laste Whisper-modellen` (align) | first run without network, Hugging Face unreachable, or a model id without ONNX files for that `dtype`. Retry with network, or copy the cache folder (`~/.cache/skill-c2v/whisper`) from a machine that has it and point `WHISPER_CACHE_DIR` there if it is elsewhere. Word times need an `onnx-community/whisper-*_timestamped` model |
| `Feil: ord N/M (x %) … skrev ikke <file>.words.json` (align) | under 50 % of the voice words were recognised: the voice text does not match the audio (another take, edited script, a synthetic stand-in like the example's tone bursts) or the wrong language (default `"en"`, no auto-detection) – Norwegian audio needs `"align": { "language": "no" }` – or try `--model onnx-community/whisper-small_timestamped`. Exit code 1; voice-meta keeps the estimate for that scene |
| `Advarsel: … lav treffrate` (align) | 50–80 % matched: the sidecar is written, unmatched words are spread between their matched neighbours. Same fixes as above if key cues land wrong |
| `Advarsel: scene N: <file>.words.json er utdatert – kjør pnpm align` (voice-meta) | the audio file (size/mtime) or the voice text changed after `pnpm align`; run `pnpm align` (it re-measures only stale scenes), then `pnpm voice-meta`. Until then cues use the estimate |
| `cue(): voice.words har X ord, teksten Y – bruker estimat` | `words` in voice.js does not fit the voice text (hand-edited voice.js or text); run `pnpm align` and `pnpm voice-meta` |
| `Fant ikke …/voice.json – kjør pnpm voice-meta først` (captions) | `pnpm captions` needs `shared/voice.json` (next to `voiceOut`); run `pnpm voice-meta`. assemble skips the SRT silently without it |
| caption visible in the last frame (lint / boundary `AVVIK` at the bottom) | `captionTrack` `until` is later than the voice (or past the clip); leave it at the default `S.lead + S.audioDuration` or set it before the last frame |
| wrong clip length | `duration` not from `sceneInfo` (voice changed: run `pnpm voice-meta`), or `lead`/`tail` not passed |
