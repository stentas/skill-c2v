---
name: ffmpeg
description: Command-line media encoder/muxer; the skill's integration layer that encodes rendered frames, muxes voice, measures audio and joins all clips into the final video.
metadata:
  tags: ffmpeg, ffmpeg-static, h264, aac, loudnorm, concat, silencedetect, encoding, clip contract
  licence: LGPL-2.1-or-later (GPL when built with libx264) – we run the binary as a separate process and do not distribute it, so no obligations on our code (not legal advice).
---
# ffmpeg

Install: nothing by hand. The toolkit depends on `ffmpeg-static` (pinned in `package.json`); `pnpm install`
in `video/` downloads its ffmpeg binary once (~45 MB, from the package's GitHub releases) – `pnpm-workspace.yaml`
approves that install script. `toolkit/tools/ffbin.mjs` resolves the binary for `render`, `assemble` and `voice-meta`:
`FFMPEG_PATH=/path/to/ffmpeg` (e.g. a Homebrew build) wins, else the bundled binary, else `ffmpeg` on `PATH`.
No ffprobe is needed – duration, streams and frame counts are read with ffmpeg itself.
Run the bundled binary by hand with `pnpm ffmpeg …` from `video/`.

Licence: the bundled build is GPL (it includes libx264). We run it as a separate process; it is never linked
into or redistributed with the project (each machine downloads it). Containers need nothing extra as long as
`pnpm install` can reach GitHub releases; offline, point its install script at a local binary with
`FFMPEG_BIN=/path/to/ffmpeg pnpm install`. Do not rely on the Playwright Docker image's ffmpeg (recording only).

## Best suited for

What this pipeline uses it for (real flags from the toolkit):

1. **Frame encoding** – `render.mjs` `encoder()`: frames piped as `-f image2pipe -c:v mjpeg|png -framerate <fps> -i -`
   (`encode.capture`), `-vf scale=out_range=tv:out_color_matrix=bt709,format=yuv420p`, `-c:v libx264
   -preset <encode.preset, slow> -crf <encode.crf, 14>`, tags `-color_primaries bt709 -color_trc bt709
   -colorspace bt709 -color_range tv`, `-r <fps> -an`. One encoder per parallel frame range.
2. **Join ranges + voice mux** – `render.mjs` `finalize()`: concat demuxer `-f concat -safe 0 -i list.txt`,
   `-c:v copy` (no re-encode); voice filtered `aresample=48000,aformat=channel_layouts=stereo,adelay=<lead ms>:all=1,apad`
   (silent scene: `-f lavfi -i anullsrc=r=48000:cl=stereo`), `-c:a aac -b:a 192k -ar 48000 -ac 2`,
   `-t <frames/fps>`, `-movflags +faststart`. Afterwards `-map 0:v -c copy -f null -` counts the frames (last `frame=` line).
3. **Final assembly** – `assemble.mjs`: one concat filter over all `clips/NN.mp4` (each normalised with
   `fps=<fps>,scale=<W>:<H>,setsar=1,format=yuv420p`; clips without audio get `anullsrc` of the same
   length); two-pass `loudnorm` – pass 1 `I=-16:TP=-1.5:LRA=11:print_format=json` to `-f null -`, pass 2 with
   `measured_I/TP/LRA/thresh`, `offset` and `linear=true`; `libx264 -crf 16` (`assemble.crf`), BT.709 tags,
   AAC 192k 48 kHz stereo, `+faststart`.
4. **Voice measurement** – `toolkit/tools/voice-meta.mjs`: one run of `-af silencedetect=noise=-35dB:d=0.1 -f null -`
   → duration (from the `Duration:` input line), speech start/end and pauses.
5. **Boundary check** – `render.mjs --check-boundaries --clips`: decodes to `-f rawvideo -pix_fmt rgb24`;
   last frame via `-sseof -1`; compared by PSNR.

## Choose it when

- Working on finished files: concatenation, loudness, re-muxing, trimming audio, extracting a frame.
- Converting a foreign clip (Remotion, Motion Canvas, screen capture, stock) to the clip contract
  (`references/clip-contract.md`).
- Turning a video that must play *inside* a scene (a phone mock-up, an embedded player) into a PNG
  frame sequence the engine can show deterministically (`html-css-svg.md` › Video inside a scene).
- Probing anything: duration, streams, frame count, colour tags.

## Do not use it when

- The work belongs inside the browser (in-browser editing/decoding – Mediabunny, via Remotion).
- It would replace per-frame rendering logic: motion, timing and overlays live in the scene engine,
  not in filter graphs.
- An engine already writes a conforming clip – do not re-encode it again before `assemble`.

## Combine with

Every engine (toolkit, `tools/remotion.md`, `tools/motion-canvas.md`) delivers `clips/NN.mp4`; ffmpeg is the
integration layer that joins them. Optional, not built (P2): cross-dissolves between clips with `xfade`
(video) + `acrossfade` (audio) inside `assemble.mjs` – today only hard cuts.

## Deterministic use

Exact frame counts and sync come from explicit parameters, never from ffmpeg's guesses.

```bash
# 👍 fixed input/output rate, explicit pixel format and colour, length from the frame count
ffmpeg -framerate 30 -i frames/%06d.png -vf "scale=out_range=tv:out_color_matrix=bt709,format=yuv420p" \
  -c:v libx264 -crf 14 -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv \
  -r 30 -t 12.3000 clip.mp4                      # 369 frames / 30 fps
# 👎 variable frame rate source, guessed colour range/matrix, -shortest as the sync mechanism
ffmpeg -i screen-capture-vfr.mov -i voice.mp3 -shortest clip.mp4
```

`assemble.mjs` passes `-shortest` in pass 2 only as a guard; sync is guaranteed upstream (every clip's
audio is padded and cut to `-t`, silent clips get silence of the probed length).

Useful one-liners (run from `video/`; without ffmpeg on `PATH`, write the plain `ffmpeg …` lines as `pnpm ffmpeg …`):

```bash
# Streams and duration (exits with code 1 because no output is given – expected)
pnpm ffmpeg -i clips/03.mp4
# Count frames (as render.mjs does: the last "frame=" number, no decoding)
pnpm ffmpeg -i clips/03.mp4 -map 0:v -c copy -f null -
# Extract frame 90 (0-based) as PNG
ffmpeg -v error -i clips/03.mp4 -vf "select=eq(n\,90)" -frames:v 1 stills/03-f90.png
# Conforming clip from a PNG sequence + voice (lead 0.5 s, 369 frames at 30 fps)
ffmpeg -y -framerate 30 -i output/%06d.png -i audio/03-edit-v2.mp3 -filter_complex \
  "[0:v]scale=out_range=tv:out_color_matrix=bt709,format=yuv420p[v];[1:a]aresample=48000,aformat=channel_layouts=stereo,adelay=500:all=1,apad[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -preset slow -crf 14 \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv -r 30 \
  -c:a aac -b:a 192k -ar 48000 -ac 2 -t 12.3000 -movflags +faststart clips/03.mp4
# Conforming clip from an arbitrary MP4 (letterbox to 1920×1080, 30 fps, yuv420p BT.709, AAC 48 kHz stereo)
ffmpeg -y -i in.mp4 -vf "fps=30,scale=1920:1080:force_original_aspect_ratio=decrease:out_color_matrix=bt709:out_range=tv,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p" \
  -c:v libx264 -preset slow -crf 14 -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv \
  -c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart clips/05.mp4
# Frame sequence for a video shown inside a scene: render fps, scaled to its on-screen width (×max zoom),
# trimmed to the seconds the scene needs (see html-css-svg.md › Video inside a scene)
ffmpeg -y -ss 0 -t 5 -i in.mp4 -vf "fps=30,scale=390:-2" assets/clip/%06d.png
# Trim a voice file (then re-run pnpm voice-meta)
ffmpeg -y -i audio/03.mp3 -af "atrim=start=0.20:end=5.80,asetpts=PTS-STARTPTS" -ar 48000 audio/03-trim.wav
# Measure integrated loudness / true peak (JSON on stderr)
ffmpeg -hide_banner -i product-demo.mp4 -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null -
```

Adjust the PNG pattern (`%06d`) to the exporter's file names. If a foreign source is untagged, set
`in_color_matrix=` in `scale` to its real matrix instead of letting ffmpeg assume one.

## References

- https://ffmpeg.org/ffmpeg.html – CLI options (`-r`, `-t`, `-map`, `-shortest`, `-filter_complex`)
- https://ffmpeg.org/ffmpeg-formats.html#concat – concat demuxer, list file syntax, `-safe 0`
- https://ffmpeg.org/ffmpeg-filters.html#concat – concat filter
- https://ffmpeg.org/ffmpeg-filters.html#loudnorm – EBU R128 loudness normalisation, two-pass values
- https://ffmpeg.org/ffmpeg-filters.html#silencedetect – silence detection used by voice-meta
- https://ffmpeg.org/ffmpeg-filters.html#scale – `out_color_matrix`, `out_range`, `force_original_aspect_ratio`
- https://ffmpeg.org/ffmpeg-filters.html#adelay – delaying audio by the lead
- https://ffmpeg.org/ffmpeg-filters.html#xfade – video cross-dissolve (P2)
- https://ffmpeg.org/ffmpeg-filters.html#acrossfade – audio cross-fade (P2)
- https://ffmpeg.org/ffmpeg-codecs.html – encoder options, section libx264 options (`-crf`, `-preset`)
- https://github.com/eugeneware/ffmpeg-static – bundled binary, `FFMPEG_BIN` / `FFMPEG_BINARIES_URL` install overrides
- https://ffmpeg.org/legal.html – LGPL/GPL licensing
