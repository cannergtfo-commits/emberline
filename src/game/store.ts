import { create } from "zustand";
import { planCommand } from "./ai";
import { playCue, setSoundEnabled, unlockAudio } from "./audio";
import { COMMANDERS, SEAT_NAME, unitTitle, type CommanderId, type UnitKind } from "./data";
import type { Point } from "./maps";
import {
  attacksFrom,
  canSeeUnit,
  commitAttack,
  commitBuild,
  commitCapture,
  commitDrop,
  commitLoad,
  commitPower,
  commitSupply,
  commitWait,
  commanderOf,
  createMatch,
  endTurn,
  getHints,
  reachable,
  resignSeat,
  unitAt,
  unitById,
  type MoveOrder,
  type World,
} from "./rules";

export interface Fx {
  id: number;
  kind: "move" | "float" | "banner" | "strike";
  t0: number;
  dur: number;
  path?: Point[];
  unitId?: string;
  x?: number;
  y?: number;
  text?: string;
}

export interface Setup {
  mapId: string;
  p1: CommanderId;
  p2: CommanderId;
  p3: CommanderId;
  p4: CommanderId;
  fog: boolean;
  mode: "hotseat" | "drill" | "alliance";
}

type Phase = "title" | "setup" | "pass" | "play" | "gameover";

interface Store {
  phase: Phase;
  setup: Setup;
  world: World | null;
  pending: MoveOrder | null;
  selectedId: string | null;
  buildAt: Point | null;
  cursor: Point;
  endArmed: boolean;
  fx: Fx[];
  history: string[];
  aiToken: number;
  aiSteps: number;
  sound: boolean;
  announce: string;
  hasSave: boolean;
  boot: () => void;
  setPhase: (phase: Phase) => void;
  patchSetup: (p: Partial<Setup>) => void;
  toggleSound: () => void;
  begin: () => void;
  resume: () => void;
  ready: () => void;
  pressTile: (x: number, y: number) => void;
  setCursor: (p: Point) => void;
  doWait: () => void;
  doCapture: () => void;
  doSupply: () => void;
  doLoad: () => void;
  doDrop: (dest: Point) => void;
  doAttack: (targetId: string) => void;
  doBuild: (kind: UnitKind) => void;
  openBuild: (p: Point) => void;
  cancelPending: () => void;
  callPower: () => void;
  endDay: (force?: boolean) => void;
  undo: () => void;
  resign: () => void;
  rematch: () => void;
}

const KEY = "emberline-v2";
const LEGACY_KEY = "emberline-v1";
const LEGACY_CO: Record<string, CommanderId> = {
  brann: "nord",
  sera: "heart",
  idris: "vael",
  mira: "maw",
  nord: "nord",
  vael: "vael",
  heart: "heart",
  maw: "maw",
};

function coerceCommander(id: string): CommanderId {
  return LEGACY_CO[id] ?? "nord";
}

function normalizeSetup(raw: Partial<Setup> | undefined, fallback: Setup): Setup {
  if (!raw) return fallback;
  const mode = raw.mode === "drill" || raw.mode === "alliance" || raw.mode === "hotseat" ? raw.mode : "hotseat";
  return {
    mapId: raw.mapId || fallback.mapId,
    p1: coerceCommander(raw.p1 ?? "nord"),
    p2: coerceCommander(raw.p2 ?? "vael"),
    p3: coerceCommander(raw.p3 ?? "heart"),
    p4: coerceCommander(raw.p4 ?? "maw"),
    fog: raw.fog ?? true,
    mode,
  };
}

function normalizeWorld(world: World): World {
  const seats = Math.max(2, world.commanders?.length ?? 2);
  world.commanders = Array.from({ length: seats }, (_, i) => coerceCommander(String(world.commanders?.[i] ?? "nord")));
  const fill = <T,>(arr: T[] | undefined, value: T): T[] =>
    Array.from({ length: seats }, (_, i) => (arr && i < arr.length ? arr[i] : value));
  world.funds = fill(world.funds, 0);
  world.powerMeter = fill(world.powerMeter, 0);
  world.powerActive = fill(world.powerActive, false);
  world.losses = fill(world.losses, 0);
  world.eliminated = fill(world.eliminated, false);
  if (!Array.isArray(world.homeKeep)) world.homeKeep = [];
  if (world.mode !== "hotseat" && world.mode !== "drill" && world.mode !== "alliance") world.mode = "hotseat";
  return world;
}

const DEFAULT_SETUP: Setup = {
  mapId: "ridge",
  p1: "nord",
  p2: "vael",
  p3: "heart",
  p4: "maw",
  fog: true,
  mode: "hotseat",
};

function fxBusy(fx: Fx[]): boolean {
  const now = performance.now();
  return fx.some((f) => now < f.t0 + f.dur);
}

function stay(u: { id: string; x: number; y: number }): MoveOrder {
  return { unitId: u.id, ox: u.x, oy: u.y, x: u.x, y: u.y, path: [{ x: u.x, y: u.y }] };
}

function buildFx(before: World, after: World, order?: MoveOrder): Fx[] {
  const now = performance.now();
  const reduce =
    typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fx: Fx[] = [];
  let id = 1;
  if (order && (order.x !== order.ox || order.y !== order.oy)) {
    const path =
      order.path.length > 1 ? order.path : [{ x: order.ox, y: order.oy }, { x: order.x, y: order.y }];
    fx.push({
      id: id++,
      kind: "move",
      unitId: order.unitId,
      path,
      t0: now,
      dur: reduce ? 1 : 240 + path.length * 110,
    });
  }
  for (const u of before.units) {
    const v = after.units.find((a) => a.id === u.id);
    if (!v && u.loaded) continue;
    const lost = v ? u.hp - v.hp : u.hp;
    if (lost <= 0) continue;
    const at = v
      ? { x: v.x, y: v.y }
      : order?.unitId === u.id
        ? { x: order.x, y: order.y }
        : { x: u.x, y: u.y };
    fx.push({
      id: id++,
      kind: "float",
      x: at.x,
      y: at.y,
      text: !v ? "DOWN" : `−${Math.max(1, Math.ceil(lost / 10))}`,
      t0: now,
      dur: reduce ? 1 : 880,
    });
  }
  if (order) {
    const foe = before.units.find((u) => {
      if (u.id === order.unitId || u.loaded) return false;
      const v = after.units.find((a) => a.id === u.id);
      return !v || v.hp < u.hp;
    });
    if (foe) {
      const lived = after.units.find((a) => a.id === foe.id);
      fx.push({
        id: id++,
        kind: "strike",
        unitId: order.unitId,
        x: lived?.x ?? foe.x,
        y: lived?.y ?? foe.y,
        t0: now,
        dur: reduce ? 1 : 520,
      });
    }
  }
  if (after.turn === before.turn && after.powerActive[after.turn - 1] && !before.powerActive[before.turn - 1]) {
    fx.push({
      id: id++,
      kind: "banner",
      text: COMMANDERS[commanderOf(after, after.turn)].power,
      t0: now,
      dur: reduce ? 1 : 1200,
    });
  }
  return fx;
}

function persist(state: Store) {
  if (!state.world) return;
  if (state.phase !== "pass" && state.phase !== "play" && state.phase !== "gameover") return;
  const payload = {
    v: 3 as const,
    phase: state.phase,
    world: state.world,
    history: state.history,
    setup: state.setup,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

export const useGame = create<Store>((set, get) => {
  const apply = (before: World, next: World, order: MoveOrder | undefined, cue: "move" | "hit" | "take" | "power") => {
    if (next === before) {
      set({ announce: "That order doesn't hold." });
      return;
    }
    const fx = buildFx(before, next, order);
    const history = [...get().history, JSON.stringify(before)].slice(-40);
    set({
      world: next,
      history,
      fx,
      pending: null,
      selectedId: null,
      buildAt: null,
      endArmed: false,
      phase: next.over ? "gameover" : get().phase,
      announce: next.log[next.log.length - 1] ?? "",
    });
    playCue(next.over ? "win" : cue);
    persist(get());
  };

  const kickAi = () => {
    const token = get().aiToken + 1;
    set({ aiToken: token, aiSteps: 0 });
    const step = () => {
      if (get().aiToken !== token) return;
      const s = get();
      if (!s.world || s.phase !== "play" || s.world.mode !== "drill" || s.world.turn !== 2 || s.world.over) {
        return;
      }
      if (fxBusy(s.fx)) {
        window.setTimeout(step, 40);
        return;
      }
      if (s.aiSteps > 26) {
        get().endDay(true);
        return;
      }
      const cmd = planCommand(s.world);
      if (cmd.type === "end") {
        get().endDay(true);
        return;
      }
      set({ aiSteps: s.aiSteps + 1 });
      const w = get().world;
      if (!w) return;
      if (cmd.type === "power") apply(w, commitPower(w), undefined, "power");
      else if (cmd.type === "wait") apply(w, commitWait(w, cmd.order), cmd.order, "move");
      else if (cmd.type === "attack") apply(w, commitAttack(w, cmd.order, cmd.targetId), cmd.order, "hit");
      else if (cmd.type === "capture") apply(w, commitCapture(w, cmd.order), cmd.order, "take");
      else if (cmd.type === "load") apply(w, commitLoad(w, cmd.order), cmd.order, "move");
      else if (cmd.type === "drop") apply(w, commitDrop(w, cmd.order, cmd.dest), cmd.order, "move");
      else if (cmd.type === "supply") apply(w, commitSupply(w, cmd.order), cmd.order, "tick" as "move");
      else if (cmd.type === "build") apply(w, commitBuild(w, cmd.x, cmd.y, cmd.kind), undefined, "take");
      window.setTimeout(step, 260);
    };
    window.setTimeout(step, 320);
  };

  return {
    phase: "title",
    setup: DEFAULT_SETUP,
    world: null,
    pending: null,
    selectedId: null,
    buildAt: null,
    cursor: { x: 1, y: 9 },
    endArmed: false,
    fx: [],
    history: [],
    aiToken: 0,
    aiSteps: 0,
    sound: true,
    announce: "",
    hasSave: false,
    boot: () => {
      try {
        set({ hasSave: Boolean(localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY)) });
      } catch {
        set({ hasSave: false });
      }
    },
    setPhase: (phase) => set({ phase }),
    patchSetup: (p) => set({ setup: { ...get().setup, ...p } }),
    toggleSound: () => {
      const sound = !get().sound;
      set({ sound });
      setSoundEnabled(sound);
      if (sound) {
        unlockAudio();
        playCue("tick");
      }
    },
    begin: () => {
      unlockAudio();
      const setup = get().setup;
      const world = createMatch(setup);
      set({
        world,
        phase: setup.mode === "drill" ? "play" : "pass",
        history: [],
        pending: null,
        selectedId: null,
        buildAt: null,
        fx: [],
        aiSteps: 0,
        endArmed: false,
        aiToken: get().aiToken + 1,
        cursor: { ...world.homeKeep[0] },
        announce:
          setup.mode === "drill"
            ? "Day 1. You have the first move."
            : `Hand the device to ${COMMANDERS[setup.p1].name}.`,
      });
      playCue("turn");
      persist(get());
    },
    resume: () => {
      try {
        const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
        if (!raw) return;
        const data = JSON.parse(raw) as {
          v: number;
          phase: Phase;
          world: World;
          history: string[];
          setup?: Setup;
        };
        if ((data.v !== 1 && data.v !== 2 && data.v !== 3) || !data.world) return;
        const world = normalizeWorld(data.world);
        const setup = normalizeSetup(data.setup, get().setup);
        set({
          world,
          phase: world.over ? "gameover" : data.phase === "gameover" ? "gameover" : data.phase,
          history: data.history ?? [],
          setup,
          pending: null,
          selectedId: null,
          buildAt: null,
          fx: [],
          endArmed: false,
          announce: "Campaign restored.",
        });
      } catch {
        set({ announce: "That save could not be read." });
      }
    },
    ready: () => {
      const w = get().world;
      if (!w || get().phase !== "pass") return;
      unlockAudio();
      set({
        phase: "play",
        announce: `${COMMANDERS[commanderOf(w, w.turn)].name} is up.`,
      });
      playCue("tick");
    },
    pressTile: (x, y) => {
      const s = get();
      const world = s.world;
      if (!world || s.phase !== "play" || world.over || fxBusy(s.fx)) return;
      if (world.mode === "drill" && world.turn === 2) return;
      if (x < 0 || y < 0 || x >= world.width || y >= world.height) return;
      set({ cursor: { x, y } });
      const me = world.turn;
      const selected = s.selectedId ? unitById(world, s.selectedId) : undefined;
      const mine =
        selected && selected.player === me && !selected.done && !selected.loaded ? selected : undefined;

      if (s.pending && mine) {
        const hints = getHints(world, mine.id, s.pending);
        const atk = hints.attacks.find((a) => a.x === x && a.y === y);
        if (atk) {
          apply(world, commitAttack(world, s.pending, atk.unitId), s.pending, "hit");
          return;
        }
        const drop = hints.drops.find((d) => d.x === x && d.y === y);
        if (drop) {
          apply(world, commitDrop(world, s.pending, drop), s.pending, "move");
          return;
        }
        const mv = reachable(world, mine).find((m) => m.x === x && m.y === y);
        if (mv) {
          set({
            pending: { unitId: mine.id, ox: mine.x, oy: mine.y, x, y, path: mv.path },
            buildAt: null,
          });
          playCue("tick");
          return;
        }
        if (x === mine.x && y === mine.y) {
          set({ pending: stay(mine), buildAt: null });
          return;
        }
      }

      const occ = unitAt(world, x, y);
      if (occ && (occ.player === me || canSeeUnit(world, me, occ))) {
        if (occ.player === me && !occ.done && !occ.loaded) {
          if (s.selectedId === occ.id && !s.pending) {
            set({ pending: stay(occ), buildAt: null, announce: `${unitTitle(commanderOf(world, occ.player), occ.kind)} awaits orders.` });
          } else {
            set({
              selectedId: occ.id,
              pending: null,
              buildAt: null,
              announce: unitTitle(commanderOf(world, occ.player), occ.kind),
            });
          }
          playCue("tick");
          return;
        }
        set({ selectedId: occ.id, pending: null, buildAt: null, announce: unitTitle(commanderOf(world, occ.player), occ.kind) });
        playCue("tick");
        return;
      }

      if (mine && !s.pending) {
        const mv = reachable(world, mine).find((m) => m.x === x && m.y === y);
        if (mv) {
          set({
            pending: { unitId: mine.id, ox: mine.x, oy: mine.y, x, y, path: mv.path },
            buildAt: null,
            announce: "Choose an order.",
          });
          playCue("tick");
          return;
        }
        const atk = attacksFrom(world, mine, mine.x, mine.y, false).find((a) => a.x === x && a.y === y);
        if (atk) {
          apply(world, commitAttack(world, stay(mine), atk.unitId), stay(mine), "hit");
          return;
        }
      }

      const t = world.terrain[y][x];
      if (world.owner[y][x] === me && (t === "factory" || t === "airport") && !unitAt(world, x, y)) {
        set({ buildAt: { x, y }, selectedId: null, pending: null, announce: "Choose a unit to field." });
        return;
      }
      set({ selectedId: null, pending: null, buildAt: null });
    },
    setCursor: (p) => set({ cursor: p }),
    doWait: () => {
      const { world, pending } = get();
      if (!world || !pending || fxBusy(get().fx)) return;
      const hints = getHints(world, pending.unitId, pending);
      if (hints.board) {
        apply(world, commitLoad(world, pending), pending, "move");
        return;
      }
      apply(world, commitWait(world, pending), pending, "move");
    },
    doCapture: () => {
      const { world, pending } = get();
      if (!world || !pending || fxBusy(get().fx)) return;
      apply(world, commitCapture(world, pending), pending, "take");
    },
    doSupply: () => {
      const { world, pending } = get();
      if (!world || !pending || fxBusy(get().fx)) return;
      apply(world, commitSupply(world, pending), pending, "move");
    },
    doLoad: () => {
      const { world, pending } = get();
      if (!world || !pending || fxBusy(get().fx)) return;
      apply(world, commitLoad(world, pending), pending, "move");
    },
    doDrop: (dest) => {
      const { world, pending } = get();
      if (!world || !pending || fxBusy(get().fx)) return;
      apply(world, commitDrop(world, pending, dest), pending, "move");
    },
    doAttack: (targetId) => {
      const { world, pending, selectedId } = get();
      if (!world || fxBusy(get().fx)) return;
      const order =
        pending ??
        (() => {
          const u = selectedId ? unitById(world, selectedId) : undefined;
          return u ? stay(u) : null;
        })();
      if (!order) return;
      apply(world, commitAttack(world, order, targetId), order, "hit");
    },
    doBuild: (kind) => {
      const { world, buildAt } = get();
      if (!world || !buildAt || fxBusy(get().fx)) return;
      apply(world, commitBuild(world, buildAt.x, buildAt.y, kind), undefined, "take");
    },
    openBuild: (p) => set({ buildAt: p, selectedId: null, pending: null, announce: "Choose a unit to field." }),
    cancelPending: () => set({ pending: null, buildAt: null, announce: "Order cancelled." }),
    callPower: () => {
      const w = get().world;
      if (!w || fxBusy(get().fx)) return;
      if (w.mode === "drill" && w.turn === 2) return;
      apply(w, commitPower(w), undefined, "power");
    },
    endDay: (force = false) => {
      const s = get();
      const w = s.world;
      if (!w || w.over || s.phase !== "play" || fxBusy(s.fx)) return;
      if (w.mode === "drill" && w.turn === 2 && !force) return;
      const idle = w.units.some((u) => u.player === w.turn && !u.done && !u.loaded);
      if (idle && !force && !s.endArmed) {
        set({ endArmed: true, announce: "Some units are still idle. End the day anyway?" });
        return;
      }
      const next = endTurn(w);
      const phase: Phase = next.over ? "gameover" : next.mode === "drill" ? "play" : "pass";
      set({
        world: next,
        phase,
        history: [],
        pending: null,
        selectedId: null,
        buildAt: null,
        endArmed: false,
        fx: [],
        aiSteps: 0,
        aiToken: get().aiToken + 1,
        announce: next.over ? next.winReason : `${SEAT_NAME[next.turn]} to move.`,
      });
      playCue(next.over ? "win" : "turn");
      persist(get());
      if (phase === "play" && next.mode === "drill" && next.turn === 2 && !next.over) kickAi();
    },
    undo: () => {
      const s = get();
      if (!s.world || s.phase !== "play" || fxBusy(s.fx) || s.history.length === 0) return;
      if (s.world.mode === "drill" && s.world.turn === 2) return;
      const world = JSON.parse(s.history[s.history.length - 1]) as World;
      set({
        world,
        history: s.history.slice(0, -1),
        pending: null,
        selectedId: null,
        buildAt: null,
        fx: [],
        endArmed: false,
        announce: "Last order rewound.",
      });
      playCue("tick");
      persist(get());
    },
    resign: () => {
      const w = get().world;
      if (!w || w.over) return;
      const next = resignSeat(w);
      const phase: Phase = next.over ? "gameover" : next.mode === "drill" ? "play" : "pass";
      set({
        world: next,
        phase,
        history: [],
        pending: null,
        selectedId: null,
        buildAt: null,
        fx: [],
        endArmed: false,
        aiToken: get().aiToken + 1,
        announce: next.over ? next.winReason : `${SEAT_NAME[next.turn]} to move.`,
      });
      playCue(next.over ? "win" : "turn");
      persist(get());
    },
    rematch: () => {
      get().begin();
    },
  };
});

export function fxActive(fx: Fx[]): boolean {
  return fxBusy(fx);
}
