import menuUrl from "@/assets/emberline/music/menu.mp3";
import ridgeUrl from "@/assets/emberline/music/ridge.mp3";
import orchardUrl from "@/assets/emberline/music/orchard.mp3";
import causewayUrl from "@/assets/emberline/music/causeway.mp3";

type Cue = "tick" | "move" | "hit" | "take" | "power" | "turn" | "win";
type MusicBed = "menu" | "ridge" | "orchard" | "causeway";

const BEDS: Record<MusicBed, string> = {
  menu: menuUrl,
  ridge: ridgeUrl,
  orchard: orchardUrl,
  causeway: causewayUrl,
};

const OVERLAP = 3.4;

let ctx: AudioContext | null = null;
let enabled = true;
let musicGain: GainNode | null = null;
let master = 0;
let bedId: MusicBed | null = null;
let token = 0;
let playing: AudioBufferSourceNode[] = [];
let aheadTimer = 0;
let queued: { id: MusicBed; volume: number; token: number; buffer?: AudioBuffer } | null = null;
const cache = new Map<MusicBed, Promise<AudioBuffer>>();

function loadBed(id: MusicBed): Promise<AudioBuffer> {
  const existing = cache.get(id);
  if (existing) return existing;
  const c = context();
  if (!c) return Promise.reject(new Error("no audio"));
  const job = fetch(BEDS[id])
    .then((res) => {
      if (!res.ok) throw new Error("music");
      return res.arrayBuffer();
    })
    .then((raw) => c.decodeAudioData(raw.slice(0)));
  cache.set(id, job);
  job.catch(() => cache.delete(id));
  return job;
}

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

function bus(): GainNode | null {
  const c = context();
  if (!c) return null;
  if (!musicGain) {
    musicGain = c.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(c.destination);
  }
  return musicGain;
}

function rampMaster(to: number, seconds: number) {
  const c = ctx;
  const g = musicGain;
  if (!c || !g) return;
  const now = c.currentTime;
  g.gain.cancelScheduledValues(now);
  g.gain.setValueAtTime(master, now);
  g.gain.linearRampToValueAtTime(to, now + Math.max(0.02, seconds));
  master = to;
}

function stopSources() {
  window.clearTimeout(aheadTimer);
  aheadTimer = 0;
  for (const src of playing) {
    try {
      src.onended = null;
      src.stop();
    } catch {
      /* already stopped */
    }
  }
  playing = [];
}

function armLoop(buffer: AudioBuffer, run: number) {
  const c = ctx;
  const gain = musicGain;
  if (!c || !gain) return;
  const dur = buffer.duration;
  const overlap = Math.min(OVERLAP, dur * 0.3);
  const step = Math.max(0.5, dur - overlap);
  let nextAt = c.currentTime + 0.06;
  let first = true;

  const spawn = (when: number, lead: boolean) => {
    if (run !== token || !ctx || !musicGain) return;
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buffer;
    src.connect(g);
    g.connect(musicGain);
    const fade = lead ? 0.7 : overlap;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(1, when + fade);
    g.gain.setValueAtTime(1, when + dur - overlap);
    g.gain.linearRampToValueAtTime(0, when + dur);
    src.start(when);
    src.stop(when + dur + 0.03);
    src.onended = () => {
      playing = playing.filter((p) => p !== src);
    };
    playing.push(src);
  };

  const scheduleAhead = () => {
    if (run !== token || !ctx) return;
    while (nextAt < ctx.currentTime + 10) {
      if (nextAt < ctx.currentTime + 0.03) nextAt = ctx.currentTime + 0.03;
      spawn(nextAt, first);
      first = false;
      nextAt += step;
    }
    aheadTimer = window.setTimeout(scheduleAhead, 1000);
  };
  scheduleAhead();
}

function playBuffer(id: MusicBed, buffer: AudioBuffer, volume: number, run: number) {
  const c = ctx;
  const gain = musicGain;
  if (!c || !gain || run !== token) return;
  bedId = id;
  stopSources();
  master = 0;
  gain.gain.cancelScheduledValues(c.currentTime);
  gain.gain.setValueAtTime(0, c.currentTime);
  armLoop(buffer, run);
  rampMaster(volume, 0.9);
}

async function startBed(id: MusicBed, volume: number, run: number) {
  const c = context();
  const gain = bus();
  if (!c || !gain) return;
  queued = { id, volume, token: run };
  try {
    const buffer = await loadBed(id);
    if (run !== token) return;
    if (c.state !== "running") {
      queued = { id, volume, token: run, buffer };
      return;
    }
    queued = null;
    playBuffer(id, buffer, volume, run);
  } catch {
    /* cues still work if a bed fails to decode */
  }
}

function flushQueued() {
  const job = queued;
  if (!job || job.token !== token || !enabled) return;
  if (!job.buffer) {
    void startBed(job.id, job.volume, job.token);
    return;
  }
  if (!ctx || ctx.state !== "running") return;
  queued = null;
  playBuffer(job.id, job.buffer, job.volume, job.token);
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
  if (on) unlockAudio();
}

export function unlockAudio() {
  const c = context();
  if (!c) return;
  if (c.state === "suspended") {
    void c.resume().then(flushQueued);
  } else {
    flushQueued();
  }
}

function bedFor(phase: string, mapId: string | undefined): { id: MusicBed; volume: number } {
  if (phase === "play" || phase === "pass") {
    const volume = phase === "pass" ? 0.26 : 0.42;
    if (mapId === "ridge" || mapId === "crown") return { id: "ridge", volume };
    if (mapId === "orchard") return { id: "orchard", volume };
    if (mapId === "causeway" || mapId === "pale") return { id: "causeway", volume };
  }
  if (phase === "gameover") return { id: "menu", volume: 0.46 };
  return { id: "menu", volume: 0.55 };
}

export function syncMusic(phase: string, mapId: string | undefined, sound: boolean) {
  if (typeof window === "undefined") return;
  enabled = sound;
  if (!sound) {
    const run = ++token;
    queued = null;
    rampMaster(0, 0.28);
    window.setTimeout(() => {
      if (run !== token) return;
      stopSources();
      bedId = null;
    }, 300);
    return;
  }
  const next = bedFor(phase, mapId);
  if (bedId === next.id && playing.length > 0) {
    rampMaster(next.volume, 0.45);
    return;
  }
  const run = ++token;
  if (playing.length > 0) {
    rampMaster(0, 0.35);
    window.setTimeout(() => {
      if (run !== token) return;
      void startBed(next.id, next.volume, run);
    }, 360);
    return;
  }
  void startBed(next.id, next.volume, run);
}

function duck() {
  if (!ctx || !musicGain || master <= 0) return;
  const now = ctx.currentTime;
  const g = musicGain.gain;
  g.cancelScheduledValues(now);
  g.setValueAtTime(master, now);
  g.linearRampToValueAtTime(master * 0.62, now + 0.04);
  g.linearRampToValueAtTime(master, now + 0.42);
}

export function playCue(cue: Cue) {
  if (!enabled) return;
  const c = context();
  if (!c || c.state !== "running") return;
  const now = c.currentTime;
  const tone = (freq: number, at: number, dur: number, type: OscillatorType, gain: number) => {
    const osc = c.createOscillator();
    const amp = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now + at);
    amp.gain.setValueAtTime(0.0001, now + at);
    amp.gain.exponentialRampToValueAtTime(gain, now + at + 0.02);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + at + dur);
    osc.connect(amp);
    amp.connect(c.destination);
    osc.start(now + at);
    osc.stop(now + at + dur + 0.02);
  };
  if (cue === "tick") tone(520, 0, 0.06, "triangle", 0.055);
  if (cue === "move") tone(240, 0, 0.08, "sine", 0.07);
  if (cue === "hit") {
    duck();
    tone(180, 0, 0.12, "sawtooth", 0.07);
    tone(90, 0.05, 0.14, "square", 0.05);
  }
  if (cue === "take") {
    tone(392, 0, 0.1, "triangle", 0.07);
    tone(523, 0.08, 0.14, "triangle", 0.07);
  }
  if (cue === "power") {
    duck();
    tone(262, 0, 0.16, "triangle", 0.07);
    tone(330, 0.08, 0.18, "triangle", 0.07);
    tone(392, 0.16, 0.22, "triangle", 0.08);
  }
  if (cue === "turn") tone(196, 0, 0.12, "sine", 0.06);
  if (cue === "win") {
    duck();
    tone(349, 0, 0.14, "triangle", 0.07);
    tone(440, 0.12, 0.16, "triangle", 0.07);
    tone(523, 0.24, 0.28, "triangle", 0.08);
  }
}
