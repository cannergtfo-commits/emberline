import { COMMANDERS, UNITS, isPassenger, isProperty, type PlayerId, type UnitKind } from "./data";
import type { Point } from "./maps";
import {
  attacksFrom,
  allied,
  canBuild,
  canSeeUnit,
  canStrikeAfterMove,
  commanderOf,
  dropTiles,
  manhattan,
  reachable,
  unitAt,
  type MoveOrder,
  type Unit,
  type World,
} from "./rules";

export type Command =
  | { type: "power" }
  | { type: "end" }
  | { type: "wait"; order: MoveOrder }
  | { type: "attack"; order: MoveOrder; targetId: string }
  | { type: "capture"; order: MoveOrder }
  | { type: "load"; order: MoveOrder }
  | { type: "drop"; order: MoveOrder; dest: Point }
  | { type: "supply"; order: MoveOrder }
  | { type: "build"; x: number; y: number; kind: UnitKind };

function canTake(w: World, me: PlayerId, x: number, y: number): boolean {
  if (!isProperty(w.terrain[y][x])) return false;
  const owner = w.owner[y][x];
  if (owner === 0) return true;
  return !allied(w, me, owner);
}

function foeKeep(w: World, me: PlayerId, from: Point): Point {
  let best = w.homeKeep[0] ?? from;
  let bestD = Infinity;
  for (let i = 0; i < w.homeKeep.length; i++) {
    const p = (i + 1) as PlayerId;
    if (w.eliminated[i] || allied(w, me, p)) continue;
    const d = manhattan(from, w.homeKeep[i]);
    if (d < bestD) {
      bestD = d;
      best = w.homeKeep[i];
    }
  }
  return best;
}

function orderStay(u: Unit): MoveOrder {
  return { unitId: u.id, ox: u.x, oy: u.y, x: u.x, y: u.y, path: [{ x: u.x, y: u.y }] };
}

function orderTo(u: Unit, x: number, y: number, path: Point[]): MoveOrder {
  return { unitId: u.id, ox: u.x, oy: u.y, x, y, path };
}

export function planCommand(w: World): Command {
  if (w.over) return { type: "end" };
  const me = w.turn;
  const need = COMMANDERS[commanderOf(w, me)].threshold;
  if (!w.powerActive[me - 1] && w.powerMeter[me - 1] >= need) return { type: "power" };

  const ready = w.units.filter((u) => u.player === me && !u.loaded && !u.done && u.hp > 0);

  for (const u of ready) {
    if (!isPassenger(u.kind)) continue;
    if (canTake(w, me, u.x, u.y) && w.terrain[u.y][u.x] === "hq") {
      return { type: "capture", order: orderStay(u) };
    }
  }

  for (const u of ready.filter((u) => isPassenger(u.kind))) {
    const stops = [{ x: u.x, y: u.y, path: [{ x: u.x, y: u.y }] }, ...reachable(w, u)];
    for (const s of stops) {
      if (w.terrain[s.y][s.x] === "hq" && canTake(w, me, s.x, s.y) && !unitAt(w, s.x, s.y)) {
        return { type: "capture", order: orderTo(u, s.x, s.y, s.path) };
      }
    }
  }

  let best: { score: number; cmd: Command } | null = null;
  for (const u of ready) {
    const stops = [
      { x: u.x, y: u.y, path: [{ x: u.x, y: u.y }], moved: false },
      ...reachable(w, u).map((r) => ({ ...r, moved: true })),
    ];
    for (const s of stops) {
      if (s.moved && !canStrikeAfterMove(w, u)) continue;
      for (const hit of attacksFrom(w, u, s.x, s.y, s.moved)) {
        const foe = w.units.find((x) => x.id === hit.unitId);
        if (!foe) continue;
        const dmg = (hit.dmgMin + hit.dmgMax) / 2;
        const counter = (hit.counterMin + hit.counterMax) / 2;
        const value = UNITS[foe.kind].cost;
        const mine = UNITS[u.kind].cost;
        let score = (dmg * value) / 100 - (counter * mine) / 100;
        if (dmg >= foe.hp) score += value * 0.85;
        if (counter >= u.hp) score -= mine;
        if (w.owner[foe.y][foe.x] === me && isProperty(w.terrain[foe.y][foe.x])) score += 500;
        if (!best || score > best.score) {
          best = {
            score,
            cmd: { type: "attack", order: orderTo(u, s.x, s.y, s.path), targetId: foe.id },
          };
        }
      }
    }
  }
  if (best && best.score > 60) return best.cmd;

  let cap: { score: number; cmd: Command } | null = null;
  for (const u of ready.filter((u) => isPassenger(u.kind))) {
    if (canTake(w, me, u.x, u.y)) {
      return { type: "capture", order: orderStay(u) };
    }
    for (const s of reachable(w, u)) {
      if (unitAt(w, s.x, s.y)) continue;
      if (!canTake(w, me, s.x, s.y)) continue;
      const kind = w.terrain[s.y][s.x];
      const score = (kind === "hq" ? 200 : kind === "factory" ? 80 : kind === "airport" ? 70 : 40) - s.cost;
      if (!cap || score > cap.score) {
        cap = { score, cmd: { type: "capture", order: orderTo(u, s.x, s.y, s.path) } };
      }
    }
  }
  if (cap) return cap.cmd;

  for (const u of ready) {
    if (!u.cargo) continue;
    const drops = dropTiles(w, u, u.x, u.y);
    if (!drops.length) continue;
    const enemyKeep = foeKeep(w, me, u);
    drops.sort((a, b) => manhattan(a, enemyKeep) - manhattan(b, enemyKeep));
    return { type: "drop", order: orderStay(u), dest: drops[0] };
  }

  const goal = foeKeep(w, me, ready[0] ?? { x: 0, y: 0 });
  let march: { gain: number; cmd: Command } | null = null;
  for (const u of ready) {
    const now = manhattan(u, goal);
    for (const s of reachable(w, u)) {
      if (unitAt(w, s.x, s.y)) continue;
      const dist = manhattan(s, goal);
      const gain = now - dist;
      if (gain <= 0) continue;
      if (!march || gain > march.gain) {
        march = { gain, cmd: { type: "wait", order: orderTo(u, s.x, s.y, s.path) } };
      }
    }
    const foes = w.units.filter((f) => !allied(w, me, f.player) && canSeeUnit(w, me, f));
    if (foes.length && isPassenger(u.kind)) {
      const near = foes.reduce((a, b) => (manhattan(u, a) < manhattan(u, b) ? a : b));
      for (const s of reachable(w, u)) {
        if (unitAt(w, s.x, s.y)) continue;
        const gain = manhattan(u, near) - manhattan(s, near);
        if (gain <= 0) continue;
        if (!march || gain > march.gain) {
          march = { gain, cmd: { type: "wait", order: orderTo(u, s.x, s.y, s.path) } };
        }
      }
    }
  }
  if (march) return march.cmd;

  const built = chooseBuild(w);
  if (built) return built;
  return { type: "end" };
}

function chooseBuild(w: World): Command | null {
  const spots: { x: number; y: number; t: "factory" | "airport" }[] = [];
  for (let y = 0; y < w.height; y++) {
    for (let x = 0; x < w.width; x++) {
      if (w.owner[y][x] !== w.turn || unitAt(w, x, y)) continue;
      const t = w.terrain[y][x];
      if (t === "factory" || t === "airport") spots.push({ x, y, t });
    }
  }
  const mine = w.units.filter((u) => u.player === w.turn);
  const funds = w.funds[w.turn - 1];
  const enemyAir = w.units.some(
    (u) => !allied(w, w.turn, u.player) && (UNITS[u.kind].moveClass === "air" || UNITS[u.kind].moveClass === "copter"),
  );
  const foot = mine.filter((u) => isPassenger(u.kind)).length;
  for (const s of spots) {
    if (s.t === "factory") {
      const kind: UnitKind | null =
        foot < 2 && funds >= 1000
          ? "skirmisher"
          : enemyAir && !mine.some((u) => u.kind === "ward") && funds >= 8000
            ? "ward"
            : funds >= 16000 && mine.some((u) => u.kind === "lancer") && !mine.some((u) => u.kind === "bastion")
              ? "bastion"
              : funds >= 7000 && mine.filter((u) => u.kind === "lancer").length < 2
                ? "lancer"
                : !mine.some((u) => u.kind === "mortar") && funds >= 6000
                  ? "mortar"
                  : foot < 4 && funds >= 1000
                    ? "skirmisher"
                    : null;
      if (kind && canBuild(w, s.x, s.y, kind)) return { type: "build", x: s.x, y: s.y, kind };
    }
  }
  for (const s of spots) {
    if (s.t !== "airport") continue;
    const kind: UnitKind | null =
      enemyAir && funds >= 20000
        ? "dart"
        : !mine.some((u) => u.kind === "wasp") && funds >= 9000
          ? "wasp"
          : null;
    if (kind && canBuild(w, s.x, s.y, kind)) return { type: "build", x: s.x, y: s.y, kind };
  }
  return null;
}
