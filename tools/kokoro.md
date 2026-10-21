---
name: kokoro
description: Kokoro-82M text-to-speech via kokoro-js – offline English narration on the CPU; `pnpm tts` writes one WAV per voiced scene, measured by voice-meta and synced through cue().
metadata:
  tags: voice, narration, tts, kokoro, offline, onnx, english
  licence: Kokoro-82M weights Apache-2.0; kokoro-js Apache-2.0; @huggingface/transformers Apache-2.0; onnxruntime MIT
---
# Kokoro (offline TTS)

Day-to-day voice workflow: [`../references/voice.md`](../references/voice.md). This file covers the
offline engine: what it can say, where the model lives, and the `pnpm tts` command.

## Best suited for
- English narration (American or British) without an account, API key or per-character cost.
- Drafts and timing passes: real speech with real pauses long before the final voice exists.
- Machines without network after setup, and repeatable output: the same text, voice, speed and
  dtype give a byte-identical WAV (checked twice with fp32).

## Choose it when
- The video is narrated in English and a synthetic voice is acceptable.
- The narration changes often and each retake should take seconds, not a round trip to a web app.

## Do not use it when
- The narration is Norwegian or any other Scandinavian language: Kokoro has none. Use ElevenLabs
  ([`elevenlabs.md`](elevenlabs.md)).
- The language is one of Kokoro's other languages (Japanese, Mandarin, Spanish, French, Hindi,
  Italian, Brazilian Portuguese): the model has voices for them, but kokoro-js 1.2.1 accepts only the
  28 English voices and phonemizes English only. Use ElevenLabs or the Python `kokoro` package.
- The client wants a human voice, or a specific branded voice.

Always: EU AI Act art. 50 transparency – disclose the synthetic voice; a line in the video
description usually suffices.

## Combine with
- Toolkit: `pnpm voice-meta` measures the WAVs like any other audio; `sceneInfo(n)` and `cue()` work
  unchanged ([`html-css-svg.md`](html-css-svg.md)).
- ElevenLabs: mix freely per scene. Drop an ElevenLabs file for scene 3 in `audio/` (e.g.
  `3_Chapter_1.mp3`); `pnpm tts` sees a file for scene 3 and skips it.
- ffmpeg: `pnpm assemble` normalises loudness across Kokoro and ElevenLabs scenes
  ([`ffmpeg.md`](ffmpeg.md)).

## Deterministic use

### Model, voices and cache

Kokoro-82M is an 82-million-parameter TTS model. The full model has 54 voices in 9 languages
(American and British English, Japanese, Mandarin, Spanish, French, Hindi, Italian, Brazilian
Portuguese). kokoro-js runs the ONNX export (`onnx-community/Kokoro-82M-v1.0-ONNX`) on the CPU in Node
through Transformers.js and onnxruntime-node. The voice files ship inside the npm package. Only the
model is downloaded, once, from Hugging Face.

- Cache: `KOKORO_CACHE_DIR`, else `~/.cache/skill-c2v/kokoro`, shared by every project on the
  machine. Layout: `<cache>/onnx-community/Kokoro-82M-v1.0-ONNX/onnx/model.onnx` (fp32), plus
  `model_fp16.onnx` / `model_quantized.onnx` (q8). No network after that file exists.
- Voices: `pnpm tts --list-voices`. Default `af_heart` (grade A). British: `bf_emma`, `bm_george`.
  The grades come from the model card ([VOICES.md](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md)).
- Output: mono WAV, 24 kHz, 32-bit float. ffmpeg, voice-meta and assemble read it as is.
- Long paragraphs are split into sentences (Kokoro reads at most about 510 phonemes per call) and
  joined into one file. A single sentence over that limit is cut, and the command prints a warning.

### Variants (dtype)

Measured 2026-10-14 on an Apple Silicon Mac (CPU, Node 26, kokoro-js 1.2.1) with
`node tools/tts.mjs --text examples/audio/about-the-skill.txt --out … --dtype …` (226 words → 84.4 s of audio):

| Variant | Download | Generation time | RTF | Result |
|---|---|---|---|---|
| fp32 | 326 MB | 18.3 s | 0.22 | clean; **default** |
| fp16 | 163 MB | 18.9 s | 0.22 | **broken**: 208 200 NaN samples (8.7 s) and 139 515 zeros in the file – `pnpm tts` refuses to write it |
| q8 | 92 MB | 42.1 s | 0.50 | clean samples, but audibly more room tone (a slight reverb) than fp32; speech still clear; 2.3× slower than fp32 (the CPU path has no fast int8 kernels) |

RTF = generation seconds ÷ audio seconds (below 1 = faster than real time). fp32 is the default
because it is the fastest and the only variant without a defect here; q8 is the choice when 234 MB of
disk matters more than speed and a touch of reverb is acceptable (listening test 2026-10-14). `q4` and `q4f16` are accepted but untested. `tts.mjs` checks every
output for non-finite samples and stops with `Modellen ga N ugyldige sampler` instead of writing a
broken file. Keep one dtype for all scenes of a video. The three WAVs stay in `examples/audio/` after a
benchmark run (ignored by git) so you can listen to the difference yourself.

### Config (`video.config.json`)

```json
"tts": { "voice": "af_heart", "dtype": "fp32", "speed": 1 }
```

Flags override per run: `--voice`, `--dtype`, `--speed`.

### Workflow

1. Claude writes the voice script (`voiceText`, default `audio/voice-script.txt`): one paragraph
   per voiced scene, in scene order, with numbers as words, no abbreviations and UI names as on screen.
   `scene.text` and `scene.paragraph` work as for voice-meta.
2. `pnpm tts` writes `audio/<key>-<slug>.wav` (`02-voiced.wav`) for every voiced scene without an
   audio file. Existing files are never overwritten. Scenes with `"audio": "none"` or no text are
   skipped with a reason.
3. `pnpm align` measures the word times (`audio/<file>.words.json`), then `pnpm voice-meta` measures the files
   (`audioPattern: "auto"` maps `02-…` to scene 2); then build scenes.
4. Retake one scene after a text change: `pnpm tts --scene 3 --force`, then `pnpm align` and `pnpm voice-meta`.
   `--force` only regenerates the tool's own `03-<slug>.wav`. If another file for scene 3 exists
   (an ElevenLabs mp3), it skips and asks you to remove that file first.

Free-standing (no config), e.g. to audition a voice or benchmark a dtype:
`node tools/tts.mjs --text script.txt --out take.wav --voice bf_emma --dtype q8` prints the
generation time, audio seconds and RTF.

### Rules

```text
// 👍 one voice, speed and dtype for the whole video; set them in video.config.json, not per run
// 👍 pnpm tts → pnpm align → pnpm voice-meta → scenes; after any retake run align and voice-meta again and re-check stills
// 👍 pronunciation fixes go in the voice text only (respelling), never on screen
// 👍 ElevenLabs for Norwegian and other non-English narration; Kokoro for English
// 👎 Norwegian text through Kokoro – it is read with English phonemes
// 👎 dtype fp16 – NaN output on the CPU with kokoro-js 1.2.1; fp32 is as fast and half a minute more to download
// 👎 deleting a user's audio file to make room for a Kokoro take
// 👎 sentences longer than about 60 words – they hit the phoneme limit and are cut
```

## References
- https://huggingface.co/hexgrad/Kokoro-82M
- https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md
- https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX
- https://github.com/hexgrad/kokoro/tree/main/kokoro.js
- https://www.npmjs.com/package/kokoro-js
