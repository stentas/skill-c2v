---
name: clip-contract
description: Format every clip in clips/ must meet so assemble.mjs can join clips from any engine (toolkit, Remotion, Motion Canvas, ffmpeg).
metadata:
  tags: clips, assemble, ffmpeg, h264, audio, boundaries, remotion
---
# Clip contract

`assemble.mjs` joins `clips/*.mp4` with hard cuts, in the order of `video.config.json` → `scenes`, and
re-encodes once. It does not care which engine made a clip, as long as the clip meets this contract.
The toolkit's `render.mjs` produces conforming clips; other engines must target the same format.

## File

- `clips/<key>.mp4`, where key = the scene id zero-padded to 2 (`4` → `04`; string ids as is), or the
  scene entry's `clip` name (relative to `dirs.clips`). A missing clip is skipped with a warning.
- One clip per scene entry. A clip that is not in the scene list is ignored.

## Video

| Property | Value |
|---|---|
| Container / codec | MP4, H.264 (libx264), `+faststart` recommended |
| Size | exactly config `width` × `height` (default 1920×1080), square pixels |
| Frame rate | exactly config `fps` (default 30), constant |
| Frame count | `round(duration × fps)`; duration = `lead + voice + tail` for voiced scenes |
| Pixel format | `yuv420p` |
| Colour | BT.709 primaries, transfer and matrix, tv (limited) range, tagged in the stream |

assemble forces `fps`, scales to `width:height` and converts to yuv420p, so a wrong clip still joins –
but frames are dropped or duplicated, the aspect ratio is stretched, and untagged or full-range colour
shifts at the cut. Match the format instead of relying on that.

## Audio

Either:

- **AAC, 48 kHz, stereo** (192 kbit/s like the toolkit): the voice starts at `lead` seconds and the track
  is padded with silence to exactly the clip length; or
- **no audio stream at all**: assemble inserts silence of the clip's duration.

A track shorter or longer than the video shifts the audio of every later clip. Do not loudness-normalise
per clip: assemble measures the joined audio and normalises it once (two-pass loudnorm to
`assemble.lufs`, `truePeak`, `lra`; default −16 LUFS, −1.5 dBTP, LRA 11).

## Boundaries

Cuts are hard. The first frame of clip N+1 must match the last frame of clip N (page state, open
dialogs, camera, cursor) per the project's boundary table. Check with `pnpm check --clips`: a cut passes
when at most 0.001 % of the pixels differ by more than 24 in any channel. Avoid motion on the first and
last frame of a clip.

## Encoding

Encode with high quality (toolkit: CRF 14, preset slow). assemble re-encodes everything once with
`assemble.crf` / `assemble.preset` (default CRF 16, slow), AAC `audioBitrate`, so small codec differences
between engines (profile, GOP, bitrate) do not matter.

## Converting other material

PNG sequence + voice file → conforming clip (scene 05, 30 fps, 450 frames = 15 s, voice after a 0.5 s lead):

```bash
ffmpeg -y -framerate 30 -i frames/%05d.png -i audio/05-chart.mp3 \
  -filter_complex "[0:v]scale=1920:1080:out_range=tv:out_color_matrix=bt709,format=yuv420p[v];\
[1:a]aresample=48000,aformat=channel_layouts=stereo,adelay=500:all=1,apad[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -preset slow -crf 14 -r 30 \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv \
  -c:a aac -b:a 192k -ar 48000 -ac 2 -t 15.0000 -movflags +faststart clips/05.mp4
```

Any MP4 (other frame rate, size or colour) → conforming video-only clip (letterboxed, no audio stream):

```bash
ffmpeg -y -i input.mp4 \
  -vf "fps=30,scale=1920:1080:force_original_aspect_ratio=decrease:out_range=tv:out_color_matrix=bt709,\
pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=white,format=yuv420p" \
  -c:v libx264 -preset slow -crf 14 -an \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv \
  -frames:v 450 -movflags +faststart clips/05.mp4
```

Verify a clip (from the `video/` folder; `pnpm ffmpeg` runs the ffmpeg that `pnpm install` fetched):

```bash
pnpm ffmpeg -i clips/05.mp4                                  # stream lines: codec, pix_fmt + colour, size, fps; audio
pnpm ffmpeg -i clips/05.mp4 -map 0:v -c copy -f null -      # frame count = the last "frame=" number
```

The first command exits with code 1 (no output file given); that is expected. The commands above that start
with plain `ffmpeg` run the same way as `pnpm ffmpeg …` when ffmpeg is not on `PATH`.

## Remotion

A Remotion composition targets the same contract: composition `width`/`height`/`fps` from
`video.config.json`, `durationInFrames = Math.round(duration * fps)`, voice placed at `lead`, rendered
with `--codec h264` straight to `clips/NN.mp4`, then `pnpm assemble`. Pixel format, colour space and
audio settings: see `../tools/remotion.md`. Check the result with the `pnpm ffmpeg` commands above.
