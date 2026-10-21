---
name: elevenlabs
description: ElevenLabs text-to-speech – online narration for Norwegian and other languages (Kokoro covers offline English); one audio file per scene, measured by voice-meta and synced through cue().
metadata:
  tags: voice, narration, tts, elevenlabs, timestamps, scribe, cue
  licence: ElevenLabs Terms – commercial use of generated audio requires a paid plan; the free plan requires attribution; the JS SDK `@elevenlabs/elevenlabs-js` is MIT
---
# ElevenLabs

Day-to-day voice workflow: [`../references/voice.md`](../references/voice.md). This file adds model
choice, licence limits and the optional API flow.

## Best suited for
- Narration in the target language with a native-sounding voice.
- One file per scene, regenerated per scene when a sentence changes.
- The same voice across many renders and revisions.

## Choose it when
- The video is narrated and no human narrator is planned.

## Do not use it when
- The client wants a human voice (record it; get word times with Scribe, see below).
- Only the free plan is available and the video is commercial. The free plan has no commercial
  licence and requires "elevenlabs.io" or "11.ai" in the title; paid plans include a commercial
  licence except for content made with Beta Services – check the chosen model's status.
- The content must not be synthesised (policy, contract, a real person's voice without consent).

Always: EU AI Act art. 50 transparency – disclose the synthetic voice; a line in the video
description usually suffices.

## Combine with
- Toolkit: `sceneInfo(n)` reads `shared/voice.js`; every beat comes from `cue()` / `cueEnd()`
  ([`html-css-svg.md`](html-css-svg.md)).
- Remotion: durations from the same voice metadata in `calculateMetadata` ([`remotion.md`](remotion.md)).
- ffmpeg: `pnpm assemble` runs two-pass loudness normalisation (`assemble.lufs` in
  `video.config.json`). Fix level differences between scene files there, not by regenerating audio.
- Kokoro: offline English narration with `pnpm tts` ([`kokoro.md`](kokoro.md)); scenes can mix both –
  `pnpm tts` skips any scene that already has an ElevenLabs file.

## Deterministic use

### Model and voice

Checked 2026-10-14 on https://elevenlabs.io/docs/overview/models – re-check before a production.

| Model id | Norwegian (`no`) | Use |
|---|---|---|
| `eleven_v4` | yes | default for narration (quality) |
| `eleven_v4_turbo` | yes | low latency; fine for drafts |
| `eleven_v3` | yes | alternative voice character |
| `eleven_flash_v2_5` | yes | real-time; lower quality |
| `eleven_multilingual_v2` | **no** | not for Norwegian |
| `eleven_flash_v2` | **no** (English only) | – |
| `eleven_turbo_v2_5`, `eleven_turbo_v2` | – | deprecated |

- The API's default `model_id` is `eleven_multilingual_v2`, and many third-party guides (Remotion's
  voiceover guide included) use it too. Wrong for Norwegian: always set the model explicitly.
- Voice: filter the Voice Library by the target language and pick a native voice; generic
  multilingual voices drift into Swedish/Danish accent and stress.
- Test product names, compound words and menu names first. Phonetic respelling goes in the text
  sent to ElevenLabs only – never in the storyboard or on screen.
- Keep voice, model and settings identical for every scene of one video.

### Workflow A – manual (default)

1. Claude writes the voice script (`voiceText` in `video.config.json`, default
   `audio/voice-script.txt`): one paragraph per voiced scene, in scene order. Rules from
   [`../references/storyboard-template.md`](../references/storyboard-template.md): numbers as words,
   no abbreviations or parentheses, UI names exactly as on screen.
2. The user generates one file per scene in the ElevenLabs web app and drops them in `audio/`.
3. Mapping: `audioPattern: "auto"` takes the file whose name starts with the scene id
   (`1_Chapter_1.mp3`, `01-intro.mp3`); or a pattern (`"{nn}-{slug}.mp3"`, `{i}` = position among
   voiced scenes); or `"audio": "03-edit-v2.mp3"` on one scene for a retake.
4. `pnpm align` measures word times from the files offline (see Workflow B), then `pnpm voice-meta` (uses the ffmpeg from `pnpm install`) writes `shared/voice.js` and `shared/voice.json`: duration, speech start/end and
   internal pauses (silencedetect) plus the text. Clip = lead + audio + tail.
5. `cue("phrase")` uses the measured word times from `pnpm align` (about 0.1 s); without them it estimates
   from character counts, anchored to measured pauses: usually within 0.2 s in short paragraphs, up to 2.5 s
   off in a long single paragraph. Before audio exists, a scene with text and `duration` but no file
   is a dummy voice (cues spread evenly); rerun voice-meta when the file arrives.
6. If the spoken text differs from the script, the audio wins: update storyboard and on-screen text.

### Workflow B – API with timestamps (optional, P2, not built)

Not needed for exact cues since 2026-10-21: `pnpm align` measures word times offline from any ElevenLabs file
(or a human recording) with Whisper, so the API alignment route below is optional. For Norwegian set
`"align": { "language": "no" }` in `video.config.json` (default `"en"`, no auto-detection).

`POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps`, header `xi-api-key`,
JSON body `text`, `model_id` (+ optional `voice_settings`, `seed`, `previous_text`/`next_text` for
continuity between scene files). Response: `audio_base64` and `alignment` { `characters`,
`character_start_times_seconds`, `character_end_times_seconds` } → exact word times → exact cues.
SDK: `client.textToSpeech.convertWithTimestamps(voiceId, { text, modelId, ... })` – verify against
the installed SDK version (response field casing included). Key in `ELEVENLABS_API_KEY`, never in a file.

```js
// UNTESTED sketch: node tts.mjs <voiceId> <sceneId> <textFile>
import { readFileSync, writeFileSync } from "node:fs";
const [voiceId, id, textFile] = process.argv.slice(2);
const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`;
const res = await fetch(url, {
  method: "POST",
  headers: { "xi-api-key": key, "Content-Type": "application/json" },
  body: JSON.stringify({ text: readFileSync(textFile, "utf8").trim(), model_id: "eleven_v4" }),
});
if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
const { audio_base64, alignment } = await res.json();
writeFileSync(`audio/${id}-scene.mp3`, Buffer.from(audio_base64, "base64"));
writeFileSync(`audio/${id}-scene.alignment.json`, JSON.stringify(alignment));
// then: pnpm voice-meta as usual (cue() does not read the alignment yet – that is P2)
```

Human narrator: `POST https://api.elevenlabs.io/v1/speech-to-text` (multipart, `file`,
`model_id=scribe_v2`, `timestamps_granularity=word`) returns `words[]` with `text`, `type`, `start`,
`end` (seconds) – keep `type === "word"` for the same exact cues.

### Rules

```text
// 👍 one file per scene, measured once by voice-meta; every visual beat from cue()/cueEnd()
// 👍 audio final (or dummy durations agreed) before scenes are timed; re-run align and voice-meta after any file change
// 👍 model_id set explicitly; same voice/model/settings for all scenes
// 👎 one long file for the whole video – scene boundaries drift and one fix re-times everything
// 👎 regenerating audio after the scenes are built – every cue shifts; re-check all stills
// 👎 hard-coded seconds or durations estimated from word counts in final scenes
// 👎 phonetic spellings copied into the storyboard or on-screen text
```

## References
- https://elevenlabs.io/docs/overview/models
- https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps
- https://elevenlabs.io/docs/api-reference/speech-to-text/convert
- https://elevenlabs.io/docs/api-reference/authentication
- https://elevenlabs.io/docs/help-center/legal/can-i-publish-the-content-i-generate-on-the-platform
- https://github.com/elevenlabs/elevenlabs-js
