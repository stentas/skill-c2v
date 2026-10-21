# Product video – user guide

This skill turns "we need a video that shows X" into a verified storyboard, a voice script and a rendered
MP4 (1920×1080, 30 fps by default). It runs inside Claude Code. It makes product demos and feature
documentation of an existing application, explainers, onboarding, release and tutorial videos, and campaign
and social clips. Product videos show real functionality only: every spoken claim is checked against the
code, and anything the product does not do is said, never simulated.

This file is for the person who orders a video and then wants to check, adjust and re-render it. The agent's
own instructions are in [SKILL.md](SKILL.md); the technical reference is [toolkit/README.md](toolkit/README.md).

## Getting started

**Install the skill.** Put the `skill-c2v` folder in `~/.claude/skills/` to use it in every project, or in
`<project>/.claude/skills/` to use it in one project only. Claude Code finds `SKILL.md` there and uses the
skill whenever you ask for a video, screencast, walkthrough, storyboard or voice script.

**What the machine needs:**

- Node 22 or newer, and pnpm.
- An installed Chromium-family browser: Edge, Chrome or Chromium. No browser is downloaded.
- Network the first time only: `pnpm install` downloads ffmpeg (about 45 MB), the first `pnpm tts` the Kokoro
  voice model (326 MB), and the first `pnpm align` a Whisper model (about 291 MB) that measures when each word
  is spoken. The models are cached outside the project, in `~/.cache/skill-c2v/`, and shared by every video.
  Rendering never needs the network.
- For narration in Norwegian or any other non-English language: an ElevenLabs account. Kokoro, the built-in
  offline voice, speaks English only.

**Prove the machine works before the first video.** Go to the skill's own `toolkit/` folder and run these:

1. `pnpm install` fetches the packages and ffmpeg.
2. `pnpm doctor` checks Node, ffmpeg, the browser and the fonts, one line each.
3. `pnpm example` renders a small example video end to end, to `toolkit/examples/example.mp4`.

## Ordering a video

Say what you can in the first message; the agent asks for the rest in one go. Useful details: goal and
audience, target length, tone, narration language, where the code lives, screenshots or a demo URL, the design
library the product uses (or how it should look), whether you want captions burned into the picture or only
a subtitle file, and whether a Remotion licence is available (it only matters when the agent proposes Remotion).
Have the product's source code ready, and screenshots or a running demo environment.

Example requests:

- "Make a two-minute demo video of the invoice approval flow in this app. Audience: new customers. Calm,
  professional tone. Narration in English."
- "Write a storyboard and voice script for a ninety-second onboarding video for the mobile app. Do not
  render anything yet."
- "Make a thirty-second social clip that explains what our product does. Graphics and title cards only,
  no real UI."
- "Make a release video for version 4.2 covering the three new features in CHANGELOG.md, narrated in
  Norwegian. I will generate the voice in ElevenLabs."
- "Use the voice files I put in video/audio and re-render scene 4."
- "Switch the theme to spotlight and render everything again."

| Step | What the agent does | What you do |
|---|---|---|
| 1 | Asks the intake questions above, in one message | Answer in prose |
| 2 | Product videos: maps the code and writes `<topic>.md` – what is supported, partly supported or missing | Read it; correct wrong assumptions |
| 3 | Writes `video-storyboard.md`: scenes, voice text per scene, timing, engine choice, "must fix before use" | **Approve.** This is the cheapest place to change anything |
| 4 | Voice: English is generated offline with Kokoro; other languages need files from you (ElevenLabs). `pnpm align` then measures when each word is spoken | Listen, or deliver the files |
| 5 | Locks the look: design tokens, overlay theme, a fifteen- to twenty-second prototype | **Approve the look.** After this, a style change means re-rendering every clip |
| 6 | Builds the project in `<project>/video/` and the scenes | Nothing |
| 7 | Renders all scenes, checks the cuts between them, assembles and normalises loudness | Watch the MP4 |
| 8 | Hands over: file path (the MP4 and a matching `.srt` subtitle file), duration, deviations from the storyboard, code fixes the video depends on, how to re-render one scene | – |

Typical length is two to five minutes for documentation. Data in the video is always fictional: invented
organisations, people and e-mail domains, never real customers or colleagues.

## The video project

The agent copies the toolkit into `<project>/video/` and builds the video there. What you will find:

- `scenes/` – one HTML file per scene, numbered in video order (`04-users.html` is scene 4).
- `audio/` – one voice file per narrated scene, the voice text (usually `voice-script.txt`, one paragraph per
  scene) and the measured word times (`.words.json` files).
- `clips/` – one rendered MP4 per scene (`04.mp4`).
- `stills/` – still pictures and contact sheets for checking.
- `shared/product.css` – the product's look: colours, fonts, component styling and the caption style.
- `video.config.json` – the settings of this video: format, theme, voice, scene list.
- The finished video (named by `output` in the config) with its `.srt` subtitle file next to it.

`shared/voice.js` and `shared/voice.json` are generated by `pnpm voice-meta`. Never edit them by hand.

## Checking and re-rendering yourself

Run every command in the `video/` folder. The agent normally runs them; you need no new conversation.

- **Preview a scene:** open its HTML file in Edge or Chrome; it plays in a loop with the voice. Space pauses,
  the arrow keys step one second (one frame with Shift), Home returns to the start.
- **Check the timing of a scene:** `pnpm contact scenes/04-users.html` writes `stills/04-contact.png`, one
  labelled picture per narrated beat. It is the fastest way to see that every click lands on the right words.
- **Take stills:** `pnpm stills scenes/04-users.html` saves the first and last frame. For other moments use
  `pnpm render scenes/04-users.html --stills 0,3.5,end`.
- **Render one scene:** `pnpm render scenes/04-users.html` writes `clips/04.mp4`.
- **Render every scene:** `pnpm render:all --jobs 4`.
- **Check the cuts:** `pnpm check --clips` compares the last frame of each clip with the first frame of the next.
  Failing pairs are saved in `stills/` so you can see the difference.
- **Build the finished video:** `pnpm assemble` joins the clips, evens out the loudness and writes the `.srt`
  file next to the MP4. After re-rendering one scene, run `pnpm check --clips` and then `pnpm assemble`.

## The voice

### Writing or editing voice text

The voice text is the clock of the video: every click, zoom and highlight is timed to a phrase in it. If you
write or change it yourself, keep these rules so the synthesis and the timing work:

- Write it exactly as it should be spoken. Numbers as words ("twelve", not "12"), no abbreviations, no
  parentheses, no symbols.
- Name UI elements exactly as they appear on screen. The agent times actions to these phrases.
- One paragraph per scene, separated by a blank line. Roughly 140 spoken words per minute.
- End sentences with full stops. The pauses between sentences are what the timing anchors to.
- Keep the phrases a scene is timed to. If you remove one, rendering stops with `cue(): fant ikke` and the agent
  has to re-time that scene.

Example of one scene's paragraph:

```
Open Users from the left menu. Every user has a role, and the role decides what they are allowed to change.
Click Invite user to add a colleague. The invitation is sent at once, and the new user appears in the list
as pending until they accept.
```

From this the agent would move the cursor to the Users menu item on "Open Users", click on "Invite user",
and fade in the pending row on "appears in the list".

### Regenerating a scene after a text change

To give scene 4 new English narration after editing its paragraph, run these in order:

1. `pnpm tts --scene 4 --force` makes a new voice file for scene 4.
2. `pnpm align` measures the new word times.
3. `pnpm voice-meta` updates the voice data the scenes read.
4. `pnpm render scenes/04-users.html` renders the scene again.

`--force` only replaces the tool's own file. For a recording or an ElevenLabs file, replace it and start at step 2.

### Choosing the Kokoro voice or speed

Tell the agent ("use a British female voice", "slightly slower"), or set it in the config. To see the voices,
run `pnpm tts --list-voices`. The default is `af_heart`; British voices include `bf_emma` and `bm_george`.

```json
"tts": { "voice": "bf_emma", "speed": 0.95 }
```

Use one voice for the whole video. After changing it, regenerate every scene with `pnpm tts --force`, then run
`pnpm align`, `pnpm voice-meta`, `pnpm render:all --jobs 4` and `pnpm assemble`.

### Using your own recordings or ElevenLabs files

Put one file per scene in `audio/` and start each file name with the scene number: `03-intro.mp3` or
`3_Chapter_1.mp3` both belong to scene 3. Then run `pnpm align` and `pnpm voice-meta`, and render. Kokoro never
overwrites your files, and you can mix your files and Kokoro scenes in one video. If a scene has two matching
files, remove the one you do not want. To use a file with another name, such as a retake, name it on the scene:

```json
"scenes": [ { "id": 3, "slug": "intro", "audio": "03-intro-take2.mp3" } ]
```

A `scenes` list in the config replaces the automatic one, so it must name every scene in order. If the config
already has one, change the entry that is there. If the spoken words differ from the script, the audio wins:
update the voice text to match.

### Norwegian and other languages

Kokoro speaks English only, so generate the voice in ElevenLabs (see [tools/elevenlabs.md](tools/elevenlabs.md)
for model choice and licence) and deliver the files as above. The word measurement does not detect the
language by itself; for Norwegian set:

```json
"align": { "language": "no" }
```

### A silent scene

Ask the agent: a scene's animations are timed to its words, so a silent scene needs fixed times instead. In the
config the scene gets `silent` and a length in seconds, and its paragraph is deleted from the voice text (a
silent scene uses none, so the paragraph would otherwise move to the next scene):

```json
{ "id": 3, "slug": "overview", "silent": true, "duration": 4 }
```

### A scene with its own text

Normally each narrated scene takes the next paragraph of the voice text. To give a scene its own text, set
`text` on it (`"paragraph": 5` picks a paragraph by number instead). Then regenerate that scene's voice as above.

```json
{ "id": 6, "slug": "summary", "text": "That is all it takes. Your team is ready to approve invoices." }
```

## The look

- **Theme** (the overlay look: highlight, cursor, click ripple, motion): `frame`, `calm`, `spotlight`,
  `energetic` or `minimal`. [references/themes.md](references/themes.md) describes each one. Tell the agent, or
  set `"theme": "calm"` in the config, then run `pnpm voice-meta` and `pnpm render:all --jobs 4`.
- **Product look** (colours, fonts, component styling): `shared/product.css`, made from the product's own
  design library or from the look-and-feel questions in
  [references/look-and-feel.md](references/look-and-feel.md). After a change, render all scenes again.
- **Captions:** burned into the picture sentence by sentence, or word by word (needs measured word times from
  `pnpm align`); or only the `.srt` file. `pnpm assemble` writes the `.srt` for every narrated video, so "no
  captions" means none burned in. Ask the agent for the kind you want. The caption look (font, size, colours,
  background) is set in `shared/product.css`; the variable names are in
  [toolkit/ENGINE-API.md](toolkit/ENGINE-API.md). To write only the subtitle file, run `pnpm captions`.
- **Exploded 3D view:** ask for it to show how a screen is built: the page tilts back and its parts lift out as
  floating labelled cards.
- **Format:** 1920×1080 at 30 fps by default. Set another in the config (`"fps": 25, "width": 1280, "height": 720`),
  then run `pnpm voice-meta` and render everything again. Decide this before the scenes are built, as their
  layout is made for one size.

## Commands you can run yourself

Run them in the project's `video/` folder. Every flag is in [toolkit/README.md](toolkit/README.md) › Commands.

| Command | Does |
|---|---|
| `pnpm doctor` | checks Node, ffmpeg, browser and fonts – one line each |
| `pnpm tts` | generates the English voice for every scene that has none yet |
| `pnpm tts --scene 4 --force` | generates scene 4's English voice again |
| `pnpm align` | measures when each word is spoken (offline); run after any voice file or voice text change, before `pnpm voice-meta` |
| `pnpm voice-meta` | measures the audio and writes the voice data; run after any voice, voice text or config change |
| `pnpm render scenes/04-users.html` | renders one scene to `clips/04.mp4` |
| `pnpm stills scenes/04-users.html` | saves the first and last frame of a scene in `stills/` |
| `pnpm contact scenes/04-users.html` | contact sheet: one still per narrated beat, the fastest way to check timing |
| `pnpm render:all --jobs 4` | renders every scene |
| `pnpm check` | checks the cuts from the scene files, before rendering |
| `pnpm check --clips` | checks the cuts in the rendered clips |
| `pnpm captions` | writes only the subtitle file (`.srt`) |
| `pnpm assemble` | joins the clips into the final MP4 with even loudness, and writes the `.srt` next to it |
| `pnpm example` | renders the bundled example project end to end – proves a machine is set up |

## When something fails

Run `pnpm doctor` first; it shows whether Node, ffmpeg, the browser or the fonts are the problem. Most error
messages are printed in Norwegian. [toolkit/TROUBLESHOOTING.md](toolkit/TROUBLESHOOTING.md) lists each one with
cause and fix: browser or ffmpeg not found, fonts not loaded, a scene script that fails, a phrase missing from
the voice text, a model that could not be downloaded, word times that do not match the audio (often the wrong
language), two audio files for one scene, and motion or a mismatch at a cut.

Settings for unusual machines go before the command, as in `CHROME_PATH=/path/to/chromium pnpm render:all`:

- `CHROME_PATH` – the browser to use when Edge, Chrome or Chromium is not found, or to pick another Chromium.
- `FFMPEG_PATH` – another ffmpeg to use instead of the downloaded one, for example a Homebrew build.
- `FFMPEG_BIN` – at `pnpm install` only: a local ffmpeg to use instead of downloading it.
- `KOKORO_CACHE_DIR` – where the Kokoro voice model is kept, when not in `~/.cache/skill-c2v/kokoro`.
- `WHISPER_CACHE_DIR` – where the word-measurement model is kept, when not in `~/.cache/skill-c2v/whisper`.

A machine without network: copy the two model folders from a machine that has them (and set the variables above).

## Where things are

- [SKILL.md](SKILL.md) – the agent's router: principles, workflow, which tool for which job.
- `references/` – the agent's workflow documents (engine choice, storyboard template, themes, voice, status).
- `tools/` – one file per technology (toolkit engine, Remotion, GSAP, Three.js, ElevenLabs, Kokoro, ffmpeg).
- `toolkit/` – the rendering engine. It is copied into each project as `video/`.
- Licences and what has been verified: [references/status.md](references/status.md).
