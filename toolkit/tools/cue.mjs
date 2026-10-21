// Voice cues for Node and Remotion: an ES module mirror of makeCue() and sceneInfo() in engine.js.
// makeCue() is a verbatim copy of the engine's (only the default lead is the literal 0.5 instead of LEAD);
// tools/cue.test.mjs enforces that the two stay identical. sceneInfo() reads the parsed shared/voice.json
// ({ VIDEO, VOICE }) written by tools/voice-meta.mjs.
//
//   import meta from "../../shared/voice.json";
//   import { sceneInfo, toFrame } from "../../tools/cue.mjs";
//   const S = sceneInfo(meta, 3);  // S.duration, S.lead, S.cue("phrase") → seconds; toFrame(sec, fps) → frame

/**
 * Builds cue(phrase) for a voice text. Measured word times (voice.words: one [start, end] per word in audio
 * seconds, from `pnpm align` via tools/voice-meta.mjs) are used as they are when present – about 0.1 s.
 * Otherwise word timing is estimated from character counts and anchored to the pauses that tools/voice-meta.mjs
 * measured in the audio (punctuation ↔ nearest pause): usually within 0.2 s in short paragraphs with clear
 * pauses, but it drifts up to several seconds in long paragraphs. Without measured pauses it falls back to lead + audioDuration * wordIndex / totalWords.
 * Returned times are scene times (lead included).
 */
export function makeCue({ voiceText, audioDuration, lead = 0.5, voice = null }) {
  const norm = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const words = voiceText.split(/\s+/).filter(Boolean).map((raw) => ({
    raw, n: norm(raw), w: norm(raw).length + 1,
    pause: /[.!?]["»”]?$/.test(raw) ? 6 : /[,;:]$/.test(raw) ? 3 : 0,
  })).filter((w) => w.n);
  let start = [], end = [];
  const measured = voice && Array.isArray(voice.words);
  if (measured && voice.words.length !== words.length) {
    console.warn(`cue(): voice.words har ${voice.words.length} ord, teksten ${words.length} – bruker estimat (kjør pnpm align på nytt)`);
  }

  if (measured && voice.words.length === words.length) {
    words.forEach((_, i) => { start[i] = voice.words[i][0]; end[i] = voice.words[i][1]; });
  } else if (!voice || !voice.pauses) {
    words.forEach((_, i) => { start[i] = audioDuration * i / words.length; end[i] = audioDuration * (i + 1) / words.length; });
  } else {
    // Anchors: index i = boundary before word i (i = words.length → end of speech). Value = [timeBefore, timeAfter].
    const solve = (anchors) => {
      const idx = Object.keys(anchors).map(Number).sort((a, b) => a - b);
      const s = [], e = [], pauseMid = [];
      for (let k = 0; k < idx.length - 1; k++) {
        const i0 = idx[k], i1 = idx[k + 1];
        const tA = anchors[i0][1], tB = anchors[i1][0];
        // Weight inside the segment: words + unanchored punctuation pauses.
        let total = 0;
        for (let i = i0; i < i1; i++) total += words[i].w + (i < i1 - 1 ? words[i].pause : 0);
        let acc = 0;
        for (let i = i0; i < i1; i++) {
          s[i] = tA + (tB - tA) * acc / total;
          acc += words[i].w;
          e[i] = tA + (tB - tA) * acc / total;
          if (i < i1 - 1) { acc += words[i].pause; pauseMid[i] = (e[i] + tA + (tB - tA) * acc / total) / 2; }
          else pauseMid[i] = (e[i] + anchors[i1][1]) / 2;
        }
      }
      return { s, e, pauseMid };
    };
    const base = { 0: [voice.speechStart, voice.speechStart], [words.length]: [voice.speechEnd, voice.speechEnd] };
    let anchors = { ...base };
    for (let iter = 0; iter < 2; iter++) {
      const { pauseMid } = solve(anchors);
      anchors = { ...base };
      let lastPause = -1;
      words.forEach((w, i) => {
        if (!w.pause || i === words.length - 1) return;
        let best = -1, bestD = 1.0;
        voice.pauses.forEach(([a, b], j) => {
          const d = Math.abs((a + b) / 2 - pauseMid[i]);
          if (j > lastPause && d < bestD) { best = j; bestD = d; }
        });
        if (best >= 0) { anchors[i + 1] = voice.pauses[best]; lastPause = best; }
      });
    }
    ({ s: start, e: end } = solve(anchors));
  }

  const find = (phrase, nth = 1) => {
    const p = phrase.split(/\s+/).map(norm).filter(Boolean);
    let seen = 0;
    for (let i = 0; i + p.length <= words.length; i++) {
      if (p.every((x, j) => words[i + j].n === x) && ++seen === nth) return [i, i + p.length - 1];
    }
    throw new Error(`cue(): fant ikke «${phrase}» (${nth}. forekomst) i speakerteksten`);
  };
  /** Time the phrase starts being spoken. nth = which occurrence (1-based). */
  const cue = (phrase, nth = 1) => lead + start[find(phrase, nth)[0]];
  /** Time the phrase has been spoken. */
  const cueEnd = (phrase, nth = 1) => lead + end[find(phrase, nth)[1]];
  return { cue, cueEnd, words: words.map((w, i) => ({ word: w.raw, start: lead + start[i], end: lead + end[i] })) };
}

/** sceneInfo for Node/Remotion from the parsed shared/voice.json ({ VIDEO, VOICE }). Mirrors engine.js sceneInfo. */
export function sceneInfo(meta, n, opts = {}) {
  const v = meta.VOICE[n] ?? meta.VOICE[String(n).padStart(2, "0")] ?? null;
  const slug = v?.slug ?? String(n);
  const noVoice = () => { throw new Error(`Scene ${n} har ingen speakertekst`); };
  if (!v || !v.text) {
    return { n, slug, lead: 0, tail: 0, audioDuration: 0, duration: opts.duration ?? v?.duration ?? 3, voiceText: "",
      audioFile: null, audioSrc: null, cue: noVoice, cueEnd: noVoice, words: [] };
  }
  const lead = opts.lead ?? v.lead ?? meta.VIDEO.lead ?? 0.5, tail = opts.tail ?? v.tail ?? meta.VIDEO.tail ?? 0.8;
  const { cue, cueEnd, words } = makeCue({ voiceText: v.text, audioDuration: v.duration, lead, voice: v.file ? v : null });
  return { n, slug, lead, tail, audioDuration: v.duration, duration: lead + v.duration + tail, voiceText: v.text,
    audioFile: v.file ?? null, audioSrc: v.src ?? null, cue, cueEnd, words };
}

/** Seconds → frame number. */
export const toFrame = (seconds, fps) => Math.round(seconds * fps);
