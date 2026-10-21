import {
  CAPTURE_MAX,
  COMMANDERS,
  COVER,
  INCOME,
  MOVE_COST,
  REPAIR_HP,
  SEAT_NAME,
  UNITS,
  baseDamage,
  canCarry,
  isAirClass,
  isIndirect,
  isPassenger,
  isProperty,
  type CommanderId,
  type PlayerId,
  type Terrain,
  type UnitKind,
} from "./data";
import { getMap, type Point } from "./maps";

export interface Unit {
  id: string;
  kind: UnitKind;
  player: PlayerId;
  x: number;
  y: number;
  hp: number;
  ammo: number;
  fuel: number;
  moved: boolean;
  done: boolean;
  loaded: boolean;
  cargo: string | null;
}

export interface World {
  mapId: string;
  width: number;
  height: number;
  terrain: Terrain[][];
  owner: (0 | PlayerId)[][];
  capture: number[][];
  capturer: (string | null)[][];
  homeKeep: Point[];
  units: Unit[];
  funds: number[];
  commanders: CommanderId[];
  powerMeter: number[];
  powerActive: boolean[];
  fog: boolean;
  mode: "hotseat" | "drill" | "alliance";
  turn: PlayerId;
  day: number;
  over: boolean;
  winner: 0 | PlayerId;
  winReason: string;
  losses: number[];
  eliminated: boolean[];
  log: string[];
  nextId: number;
}

export interface MoveOrder {
  unitId: string;
  ox: number;
  oy: number;
  x: number;
  y: number;
  path: Point[];
}

export interface AttackPreview {
  unitId: string;
  x: number;
  y: number;
  kind: UnitKind;
  dmgMin: number;
  dmgMax: number;
  counterMin: number;
  counterMax: number;
}

export interface Hints {
  moves: { x: number; y: number; path: Point[] }[];
  attacks: AttackPreview[];
  drops: Point[];
  canCapture: boolean;
  canSupply: boolean;
  board: { id: string; name: string } | null;
  canWait: boolean;
}

const DIRS: Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

export function other(p: PlayerId): PlayerId {
  return p === 1 ? 2 : 1;
}

export function allied(w: World, a: PlayerId, b: PlayerId): boolean {
  if (a === b) return true;
  if (w.mode !== "alliance") return false;
  return a + b === 4 || a + b === 6;
}

function seatCount(w: World): number {
  return w.eliminated.length;
}

function livingSeats(w: World): PlayerId[] {
  const out: PlayerId[] = [];
  for (let i = 0; i < w.eliminated.length; i++) {
    if (!w.eliminated[i]) out.push((i + 1) as PlayerId);
  }
  return out;
}

function teamOf(p: PlayerId): "warm" | "cool" {
  return p === 1 || p === 3 ? "warm" : "cool";
}

export function cloneWorld(w: World): World {
  return structuredClone(w);
}

function note(w: World, line: string) {
  w.log = [...w.log, line].slice(-14);
}

export function unitById(w: World, id: string): Unit | undefined {
  return w.units.find((u) => u.id === id);
}

export function unitAt(w: World, x: number, y: number): Unit | undefined {
  return w.units.find((u) => !u.loaded && u.x === x && u.y === y);
}

export function manhattan(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function commanderOf(w: World, p: PlayerId): CommanderId {
  return w.commanders[p - 1];
}

export function powered(w: World, p: PlayerId): boolean {
  return w.powerActive[p - 1];
}

export function moveStat(w: World, unit: Unit): number {
  const def = UNITS[unit.kind];
  let m = def.move;
  if (!powered(w, unit.player)) return m;
  const c = commanderOf(w, unit.player);
  if (c === "nord" && (def.moveClass === "tires" || def.moveClass === "treads")) m += 1;
  if (c === "heart" && (def.moveClass === "foot" || def.moveClass === "boot")) m += 1;
  return m;
}

export function attackMul(w: World, unit: Unit): number {
  if (!powered(w, unit.player)) return 1;
  const c = commanderOf(w, unit.player);
  const cls = UNITS[unit.kind].moveClass;
  if (c === "nord" && (cls === "tires" || cls === "treads")) return 1.3;
  if (c === "heart" && (cls === "foot" || cls === "boot")) return 1.15;
  if (c === "vael") return 1.12;
  if (
    c === "maw" &&
    (isIndirect(unit.kind) || cls === "air" || cls === "copter")
  ) {
    return 1.35;
  }
  return 1;
}

export function canStrikeAfterMove(w: World, unit: Unit): boolean {
  if (!isIndirect(unit.kind)) return true;
  return powered(w, unit.player) && commanderOf(w, unit.player) === "maw";
}

export function defenseStars(w: World, unit: Unit, terrain: Terrain): number {
  const air = isAirClass(UNITS[unit.kind].moveClass);
  let stars = air ? 0 : COVER[terrain];
  if (powered(w, unit.player) && commanderOf(w, unit.player) === "vael") stars += 1;
  return stars;
}

export function strikeDamage(
  base: number,
  atkHp: number,
  defHp: number,
  stars: number,
  mul: number,
  luck: number,
): number {
  if (base <= 0 || atkHp <= 0 || defHp <= 0) return 0;
  const a = Math.max(1, Math.ceil(atkHp / 10));
  const d = Math.max(1, Math.ceil(defHp / 10));
  const factor = Math.max(0, 100 - stars * d) / 100;
  return Math.max(0, Math.floor(base * mul * (a / 10) * factor + luck));
}

function inBounds(w: World, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < w.width && y < w.height;
}

function conceal(t: Terrain): boolean {
  return t === "woods" || isProperty(t);
}

export function visionMap(w: World, player: PlayerId): boolean[][] {
  const vis = Array.from({ length: w.height }, () => Array(w.width).fill(false));
  for (const u of w.units) {
    if (!allied(w, u.player, player) || u.loaded || u.hp <= 0) continue;
    const r = UNITS[u.kind].vision;
    for (let y = 0; y < w.height; y++) {
      for (let x = 0; x < w.width; x++) {
        if (manhattan(u, { x, y }) <= r) vis[y][x] = true;
      }
    }
  }
  return vis;
}

export function canSeeUnit(w: World, viewer: PlayerId, unit: Unit, vis?: boolean[][]): boolean {
  if (unit.loaded || unit.hp <= 0) return false;
  if (!w.fog || allied(w, unit.player, viewer)) return true;
  const seen = vis ?? visionMap(w, viewer);
  if (!seen[unit.y][unit.x]) return false;
  if (!conceal(w.terrain[unit.y][unit.x])) return true;
  return w.units.some(
    (ally) =>
      allied(w, ally.player, viewer) &&
      !ally.loaded &&
      ally.hp > 0 &&
      manhattan(ally, unit) <= 1,
  );
}

interface Reach {
  x: number;
  y: number;
  cost: number;
  path: Point[];
}

export function reachable(w: World, unit: Unit): Reach[] {
  const budget = moveStat(w, unit);
  const cls = UNITS[unit.kind].moveClass;
  const air = isAirClass(cls);
  const startKey = unit.y * 100 + unit.x;
  const best = new Map<number, number>();
  const prev = new Map<number, number>();
  best.set(startKey, 0);
  const queue: number[] = [startKey];
  while (queue.length) {
    queue.sort((a, b) => (best.get(a) ?? 0) - (best.get(b) ?? 0));
    const cur = queue.shift()!;
    const cx = cur % 100;
    const cy = Math.floor(cur / 100);
    const cost = best.get(cur) ?? 0;
    for (const d of DIRS) {
      const nx = cx + d.x;
      const ny = cy + d.y;
      if (!inBounds(w, nx, ny)) continue;
      const step = MOVE_COST[cls][w.terrain[ny][nx]];
      if (step >= 99) continue;
      const occ = unitAt(w, nx, ny);
      if (occ && occ.id !== unit.id) {
        if (!allied(w, occ.player, unit.player) && !air) continue;
      }
      const next = cost + step;
      if (next > budget) continue;
      const nk = ny * 100 + nx;
      if (next >= (best.get(nk) ?? 999)) continue;
      best.set(nk, next);
      prev.set(nk, cur);
      queue.push(nk);
    }
  }
  const out: Reach[] = [];
  for (const [key, cost] of best) {
    if (key === startKey) continue;
    const x = key % 100;
    const y = Math.floor(key / 100);
    if (!canStop(w, unit, x, y)) continue;
    const path: Point[] = [];
    let cursor = key;
    path.push({ x, y });
    while (cursor !== startKey) {
      const p = prev.get(cursor);
      if (p === undefined) break;
      cursor = p;
      path.push({ x: cursor % 100, y: Math.floor(cursor / 100) });
    }
    path.reverse();
    out.push({ x, y, cost, path });
  }
  return out;
}

function canStop(w: World, unit: Unit, x: number, y: number): boolean {
  const occ = unitAt(w, x, y);
  if (!occ || occ.id === unit.id) return true;
  return Boolean(loadTarget(w, unit, x, y));
}

function loadTarget(w: World, unit: Unit, x: number, y: number): Unit | null {
  if (!isPassenger(unit.kind)) return null;
  const occ = unitAt(w, x, y);
  if (!occ || occ.player !== unit.player || occ.id === unit.id) return null;
  if (!canCarry(occ.kind) || occ.cargo) return null;
  return occ;
}

export function attacksFrom(
  w: World,
  unit: Unit,
  x: number,
  y: number,
  moved: boolean,
): AttackPreview[] {
  const range = UNITS[unit.kind].range;
  if (!range || unit.ammo === 0) return [];
  if (moved && !canStrikeAfterMove(w, unit)) return [];
  const previews: AttackPreview[] = [];
  for (const foe of w.units) {
    if (allied(w, foe.player, unit.player) || foe.loaded || foe.hp <= 0) continue;
    const dist = manhattan({ x, y }, foe);
    if (dist < range.min || dist > range.max) continue;
    if (!canSeeUnit(w, unit.player, foe)) continue;
    const base = baseDamage(unit.kind, foe.kind);
    if (base <= 0) continue;
    const stars = defenseStars(w, foe, w.terrain[foe.y][foe.x]);
    const mul = attackMul(w, unit);
    const dmgMin = strikeDamage(base, unit.hp, foe.hp, stars, mul, 0);
    const dmgMax = strikeDamage(base, unit.hp, foe.hp, stars, mul, 9);
    let counterMin = 0;
    let counterMax = 0;
    const remain = Math.max(0, foe.hp - dmgMin);
    if (remain > 0 && canCounter(w, foe, { ...unit, x, y })) {
      const back = baseDamage(foe.kind, unit.kind);
      const astars = defenseStars(w, unit, w.terrain[y][x]);
      const bmul = attackMul(w, foe);
      counterMin = strikeDamage(back, remain, unit.hp, astars, bmul, 0);
      const remainMax = Math.max(0, foe.hp - dmgMax);
      counterMax =
        remainMax > 0 ? strikeDamage(back, foe.hp, unit.hp, astars, bmul, 9) : counterMin;
    }
    previews.push({
      unitId: foe.id,
      x: foe.x,
      y: foe.y,
      kind: foe.kind,
      dmgMin,
      dmgMax,
      counterMin,
      counterMax,
    });
  }
  return previews;
}

function canCounter(w: World, defender: Unit, attacker: Unit): boolean {
  if (defender.ammo === 0 || isIndirect(defender.kind)) return false;
  const range = UNITS[defender.kind].range;
  if (!range) return false;
  const dist = manhattan(defender, attacker);
  if (dist < range.min || dist > range.max) return false;
  return baseDamage(defender.kind, attacker.kind) > 0;
}

export function dropTiles(w: World, carrier: Unit, x: number, y: number): Point[] {
  if (!carrier.cargo) return [];
  const cargo = unitById(w, carrier.cargo);
  if (!cargo) return [];
  const cls = UNITS[cargo.kind].moveClass;
  const tiles: Point[] = [];
  for (const d of DIRS) {
    const nx = x + d.x;
    const ny = y + d.y;
    if (!inBounds(w, nx, ny)) continue;
    if (MOVE_COST[cls][w.terrain[ny][nx]] >= 99) continue;
    if (unitAt(w, nx, ny)) continue;
    tiles.push({ x: nx, y: ny });
  }
  return tiles;
}

export function getHints(w: World, unitId: string | null, pending: MoveOrder | null): Hints {
  const empty: Hints = {
    moves: [],
    attacks: [],
    drops: [],
    canCapture: false,
    canSupply: false,
    board: null,
    canWait: false,
  };
  if (!unitId || w.over) return empty;
  const unit = unitById(w, unitId);
  if (!unit || unit.player !== w.turn || unit.done || unit.loaded) return empty;
  const moves = reachable(w, unit).map((r) => ({ x: r.x, y: r.y, path: r.path }));
  const pos = pending ?? { x: unit.x, y: unit.y, ox: unit.x, oy: unit.y, path: [], unitId };
  const moved = pending ? pending.x !== unit.x || pending.y !== unit.y : false;
  const attacks = pending
    ? attacksFrom(w, unit, pending.x, pending.y, moved)
    : attacksFrom(w, unit, unit.x, unit.y, false);
  const here = loadTarget(w, unit, pos.x, pos.y);
  const boarding = Boolean(pending && here);
  return {
    moves: pending ? [] : moves,
    attacks,
    drops: canCarry(unit.kind) ? dropTiles(w, unit, pos.x, pos.y) : [],
    canCapture: !boarding && canCaptureAt(w, unit, pos.x, pos.y),
    canSupply: canCarry(unit.kind) && adjacentFriend(w, unit, pos.x, pos.y),
    board: here ? { id: here.id, name: UNITS[here.kind].name } : null,
    canWait: !boarding,
  };
}

function canCaptureAt(w: World, unit: Unit, x: number, y: number): boolean {
  if (!isPassenger(unit.kind)) return false;
  const t = w.terrain[y][x];
  if (!isProperty(t)) return false;
  const owner = w.owner[y][x];
  if (owner !== 0 && allied(w, unit.player, owner)) return false;
  return true;
}

function adjacentFriend(w: World, unit: Unit, x: number, y: number): boolean {
  return w.units.some(
    (o) =>
      o.id !== unit.id &&
      !o.loaded &&
      allied(w, o.player, unit.player) &&
      manhattan(o, { x, y }) === 1,
  );
}

function releaseCapture(w: World, unitId: string, keep?: Point) {
  for (let y = 0; y < w.height; y++) {
    for (let x = 0; x < w.width; x++) {
      if (w.capturer[y][x] !== unitId) continue;
      if (keep && keep.x === x && keep.y === y) continue;
      w.capturer[y][x] = null;
      w.capture[y][x] = CAPTURE_MAX;
    }
  }
}

function destroyUnit(w: World, id: string) {
  const u = unitById(w, id);
  if (!u) return;
  if (u.cargo) destroyUnit(w, u.cargo);
  for (const t of w.units) if (t.cargo === id) t.cargo = null;
  releaseCapture(w, id);
  w.losses[u.player - 1] += 1;
  w.units = w.units.filter((x) => x.id !== id);
  note(w, `${UNITS[u.kind].name} is lost.`);
}

function place(w: World, unit: Unit, order: MoveOrder) {
  const moved = order.x !== unit.x || order.y !== unit.y;
  if (moved) releaseCapture(w, unit.id);
  unit.x = order.x;
  unit.y = order.y;
  if (moved) unit.moved = true;
}

function addMeter(w: World, p: PlayerId, amount: number) {
  const cap = COMMANDERS[commanderOf(w, p)].threshold;
  w.powerMeter[p - 1] = Math.min(cap, w.powerMeter[p - 1] + amount);
}

function applyHit(
  w: World,
  attacker: Unit,
  defender: Unit,
  luck: number,
): { dealt: number; killed: boolean } {
  const base = baseDamage(attacker.kind, defender.kind);
  const stars = defenseStars(w, defender, w.terrain[defender.y][defender.x]);
  const dmg = strikeDamage(base, attacker.hp, defender.hp, stars, attackMul(w, attacker), luck);
  const dealt = Math.min(defender.hp, dmg);
  defender.hp -= dealt;
  if (attacker.ammo > 0) attacker.ammo -= 1;
  addMeter(w, attacker.player, Math.floor((dealt * UNITS[defender.kind].cost) / 100));
  addMeter(w, defender.player, Math.floor((dealt * UNITS[defender.kind].cost) / 200));
  const killed = defender.hp <= 0;
  if (!killed) {
    note(
      w,
      dealt > 0
        ? `${UNITS[attacker.kind].name} hits ${UNITS[defender.kind].name} for ${Math.ceil(dealt / 10)}.`
        : `${UNITS[attacker.kind].name} misses ${UNITS[defender.kind].name}.`,
    );
  }
  return { dealt, killed };
}

function legalOrder(w: World, unit: Unit, order: MoveOrder): boolean {
  if (w.over || unit.player !== w.turn || unit.done || unit.loaded) return false;
  if (order.unitId !== unit.id) return false;
  if (order.x === unit.x && order.y === unit.y) return true;
  return reachable(w, unit).some((r) => r.x === order.x && r.y === order.y);
}

function checkKeeps(w: World) {
  if (w.over) return;
  const lost: PlayerId[] = [];
  for (let i = 0; i < w.homeKeep.length; i++) {
    if (w.eliminated[i]) continue;
    const k = w.homeKeep[i];
    if (w.owner[k.y][k.x] !== i + 1) lost.push((i + 1) as PlayerId);
  }
  if (lost.length === 0) return;
  if (w.mode !== "alliance" && seatCount(w) === 2 && lost.length >= 2) {
    scoreEnd(w, "Both keeps changed hands.");
    return;
  }
  for (const p of lost) eliminate(w, p);
  resolveVictory(w, "keep", lost[0]);
}

function eliminate(w: World, p: PlayerId) {
  if (w.over || w.eliminated[p - 1]) return;
  w.eliminated[p - 1] = true;
  const ids = new Set(w.units.filter((u) => u.player === p).map((u) => u.id));
  for (let y = 0; y < w.height; y++) {
    for (let x = 0; x < w.width; x++) {
      if (w.capturer[y][x] && ids.has(w.capturer[y][x] as string)) {
        w.capturer[y][x] = null;
        w.capture[y][x] = CAPTURE_MAX;
      }
      if (w.owner[y][x] === p) w.owner[y][x] = 0;
    }
  }
  w.losses[p - 1] += w.units.filter((u) => u.player === p).length;
  w.units = w.units.filter((u) => u.player !== p);
  for (const u of w.units) {
    if (u.cargo && ids.has(u.cargo)) u.cargo = null;
  }
  note(w, `${SEAT_NAME[p]} is out.`);
}

function resolveVictory(w: World, kind: "keep" | "wipe" | "resign", subject?: PlayerId) {
  if (w.over) return;
  const living = livingSeats(w);
  if (w.mode === "alliance") {
    const teams = new Set(living.map(teamOf));
    if (teams.size > 1) return;
    if (teams.size === 0) {
      finishGame(w, 0, "The field is empty.");
      return;
    }
    const warm = teams.has("warm");
    const banner = warm ? "Ember and Flint" : "Gale and Tide";
    const winner: PlayerId = warm ? 1 : 2;
    const reason =
      kind === "resign" && subject
        ? `${SEAT_NAME[subject]} yields the field.`
        : kind === "wipe" && subject
          ? `${SEAT_NAME[subject]} has nothing left to field.`
          : kind === "keep"
            ? `${banner} take the keep.`
            : `${banner} hold the field.`;
    finishGame(w, winner, reason);
    return;
  }
  if (living.length === 1) {
    const winner = living[0];
    const reason =
      kind === "keep"
        ? `${SEAT_NAME[winner]} takes the keep.`
        : kind === "wipe" && subject
          ? `${SEAT_NAME[subject]} has nothing left to field.`
          : kind === "resign" && subject
            ? `${SEAT_NAME[subject]} yields the field.`
            : `${SEAT_NAME[winner]} holds the field.`;
    finishGame(w, winner, reason);
    return;
  }
  if (living.length === 0) scoreEnd(w, "The field is empty.");
}

function finishGame(w: World, winner: 0 | PlayerId, reason: string) {
  if (w.over) return;
  w.over = true;
  w.winner = winner;
  w.winReason = reason;
}

function armyScore(w: World, p: PlayerId): number {
  let s = w.funds[p - 1];
  for (let y = 0; y < w.height; y++) {
    for (let x = 0; x < w.width; x++) {
      if (w.owner[y][x] === p && isProperty(w.terrain[y][x])) s += INCOME;
    }
  }
  for (const u of w.units) {
    if (u.player === p) s += Math.floor((UNITS[u.kind].cost * u.hp) / 100);
  }
  return s;
}

function scoreEnd(w: World, prefix: string) {
  const a = armyScore(w, 1);
  const b = armyScore(w, 2);
  if (a === b) finishGame(w, 0, `${prefix} Both lines hold.`);
  else if (a > b) finishGame(w, 1, `${prefix} Ember holds the stronger line.`);
  else finishGame(w, 2, `${prefix} Gale holds the stronger line.`);
}

function canFight(w: World, p: PlayerId): boolean {
  if (w.units.some((u) => u.player === p)) return true;
  for (let y = 0; y < w.height; y++) {
    for (let x = 0; x < w.width; x++) {
      if (w.owner[y][x] !== p || unitAt(w, x, y)) continue;
      const t = w.terrain[y][x];
      if (t === "factory" && w.funds[p - 1] >= 1000) return true;
      if (t === "airport" && w.funds[p - 1] >= 5000) return true;
    }
  }
  return false;
}

function morning(w: World) {
  if (w.over) return;
  let props = 0;
  for (let y = 0; y < w.height; y++) {
    for (let x = 0; x < w.width; x++) {
      if (w.owner[y][x] === w.turn && isProperty(w.terrain[y][x])) props += 1;
    }
  }
  w.funds[w.turn - 1] += props * INCOME;
  for (const u of [...w.units]) {
    if (u.player !== w.turn || u.loaded) continue;
    if (!unitById(w, u.id)) continue;
    const t = w.terrain[u.y][u.x];
    const owned = w.owner[u.y][u.x] === u.player;
    const air = isAirClass(UNITS[u.kind].moveClass);
    const repairs =
      owned &&
      ((air && t === "airport") || (!air && (t === "city" || t === "factory" || t === "hq")));
    if (repairs) {
      const want = Math.min(REPAIR_HP, 100 - u.hp);
      const per = UNITS[u.kind].cost / 1000;
      const affordable = per <= 0 ? want : Math.min(want, Math.floor(w.funds[u.player - 1] / per));
      if (affordable > 0) {
        u.hp += affordable;
        w.funds[u.player - 1] -= Math.floor(per * affordable);
      }
      u.ammo = UNITS[u.kind].ammo;
      u.fuel = UNITS[u.kind].fuel;
    }
    if (UNITS[u.kind].daily > 0) {
      u.fuel -= UNITS[u.kind].daily;
      if (u.fuel <= 0) {
        note(w, `${UNITS[u.kind].name} falls out of the sky.`);
        destroyUnit(w, u.id);
        continue;
      }
    }
    u.done = false;
    u.moved = false;
  }
  if (!canFight(w, w.turn)) {
    const p = w.turn;
    eliminate(w, p);
    resolveVictory(w, "wipe", p);
  }
}

export interface MatchOpts {
  mapId: string;
  p1: CommanderId;
  p2: CommanderId;
  p3?: CommanderId;
  p4?: CommanderId;
  fog: boolean;
  mode: "hotseat" | "drill" | "alliance";
}

export function createMatch(opts: MatchOpts): World {
  const map = getMap(opts.mapId);
  const capture: number[][] = [];
  const capturer: (string | null)[][] = [];
  for (let y = 0; y < map.height; y++) {
    capture[y] = [];
    capturer[y] = [];
    for (let x = 0; x < map.width; x++) {
      capture[y][x] = isProperty(map.terrain[y][x]) ? CAPTURE_MAX : 0;
      capturer[y][x] = null;
    }
  }
  const seats = map.seats;
  const mode: World["mode"] =
    opts.mode === "alliance" && seats !== 4 ? "hotseat" : opts.mode === "drill" && seats !== 2 ? "hotseat" : opts.mode;
  const commanders = [opts.p1, opts.p2, opts.p3 ?? "heart", opts.p4 ?? "maw"].slice(0, seats);
  const w: World = {
    mapId: map.id,
    width: map.width,
    height: map.height,
    terrain: map.terrain.map((r) => r.slice()),
    owner: map.owner.map((r) => r.slice()),
    capture,
    capturer,
    homeKeep: map.homeKeep.map((p) => ({ ...p })),
    units: [],
    funds: Array(seats).fill(0),
    commanders,
    powerMeter: Array(seats).fill(0),
    powerActive: Array(seats).fill(false),
    fog: opts.fog,
    mode,
    turn: 1,
    day: 1,
    over: false,
    winner: 0,
    winReason: "",
    losses: Array(seats).fill(0),
    eliminated: Array(seats).fill(false),
    log: ["Day 1. Ember opens."],
    nextId: 1,
  };
  for (const d of map.deploy) {
    const def = UNITS[d.kind];
    w.units.push({
      id: `u${w.nextId++}`,
      kind: d.kind,
      player: d.player,
      x: d.x,
      y: d.y,
      hp: 100,
      ammo: def.ammo,
      fuel: def.fuel,
      moved: false,
      done: false,
      loaded: false,
      cargo: null,
    });
  }
  morning(w);
  return w;
}

function luckOf(rng: () => number): number {
  return Math.min(9, Math.floor(rng() * 10));
}

export function commitWait(w: World, order: MoveOrder): World {
  const n = cloneWorld(w);
  const u = unitById(n, order.unitId);
  if (!u || !legalOrder(n, u, order)) return w;
  if (order.x !== u.x || order.y !== u.y) {
    const occ = unitAt(n, order.x, order.y);
    if (occ && occ.id !== u.id) return w;
  }
  place(n, u, order);
  u.done = true;
  return n;
}

export function commitLoad(w: World, order: MoveOrder): World {
  const n = cloneWorld(w);
  const u = unitById(n, order.unitId);
  const carrier = u && legalOrder(n, u, order) ? loadTarget(n, u, order.x, order.y) : null;
  if (!u || !carrier) return w;
  place(n, u, order);
  u.loaded = true;
  u.done = true;
  carrier.cargo = u.id;
  note(n, `${UNITS[u.kind].name} boards the ${UNITS[carrier.kind].name}.`);
  return n;
}

export function commitDrop(w: World, order: MoveOrder, dest: Point): World {
  const n = cloneWorld(w);
  const u = unitById(n, order.unitId);
  if (!u || !u.cargo || !legalOrder(n, u, order)) return w;
  place(n, u, order);
  if (!dropTiles(n, u, u.x, u.y).some((p) => p.x === dest.x && p.y === dest.y)) return w;
  const cargo = unitById(n, u.cargo);
  if (!cargo) return w;
  cargo.loaded = false;
  cargo.x = dest.x;
  cargo.y = dest.y;
  cargo.done = true;
  cargo.moved = true;
  u.cargo = null;
  u.done = true;
  note(n, `${UNITS[cargo.kind].name} steps off the ${UNITS[u.kind].name}.`);
  return n;
}

export function commitSupply(w: World, order: MoveOrder): World {
  const n = cloneWorld(w);
  const u = unitById(n, order.unitId);
  if (!u || !legalOrder(n, u, order) || !canCarry(u.kind)) return w;
  place(n, u, order);
  let fed = 0;
  for (const o of n.units) {
    if (o.loaded || !allied(n, o.player, u.player) || o.id === u.id) continue;
    if (manhattan(o, u) !== 1) continue;
    o.ammo = UNITS[o.kind].ammo;
    o.fuel = UNITS[o.kind].fuel;
    fed += 1;
  }
  u.done = true;
  note(n, fed ? `${UNITS[u.kind].name} resupplies ${fed}.` : `${UNITS[u.kind].name} waits.`);
  return n;
}

export function commitCapture(w: World, order: MoveOrder): World {
  const n = cloneWorld(w);
  const u = unitById(n, order.unitId);
  if (!u || !legalOrder(n, u, order) || !canCaptureAt(n, u, order.x, order.y)) return w;
  place(n, u, order);
  const gain =
    Math.ceil(u.hp / 10) *
    (powered(n, u.player) && commanderOf(n, u.player) === "heart" ? 2 : 1);
  n.capture[order.y][order.x] -= gain;
  n.capturer[order.y][order.x] = u.id;
  u.done = true;
  if (n.capture[order.y][order.x] <= 0) {
    n.owner[order.y][order.x] = u.player;
    n.capture[order.y][order.x] = CAPTURE_MAX;
    n.capturer[order.y][order.x] = null;
    const label = n.terrain[order.y][order.x] === "hq" ? "keep" : "ground";
    note(n, `${SEAT_NAME[u.player]} seizes the ${label}.`);
    checkKeeps(n);
  } else {
    note(n, `${UNITS[u.kind].name} digs in (${n.capture[order.y][order.x]} left).`);
  }
  return n;
}

export function commitAttack(
  w: World,
  order: MoveOrder,
  targetId: string,
  rng: () => number = Math.random,
): World {
  const n = cloneWorld(w);
  const u = unitById(n, order.unitId);
  const foe = unitById(n, targetId);
  if (!u || !foe || !legalOrder(n, u, order)) return w;
  const moved = order.x !== u.x || order.y !== u.y;
  const legal = attacksFrom(n, u, order.x, order.y, moved).some((a) => a.unitId === targetId);
  if (!legal) return w;
  place(n, u, order);
  const first = applyHit(n, u, foe, luckOf(rng));
  if (first.killed) {
    note(n, `${UNITS[foe.kind].name} breaks.`);
    destroyUnit(n, foe.id);
  } else if (u.hp > 0 && canCounter(n, foe, u)) {
    const back = applyHit(n, foe, u, luckOf(rng));
    if (back.killed) {
      note(n, `${UNITS[u.kind].name} falls to the counter.`);
      destroyUnit(n, u.id);
    }
  }
  const survivor = unitById(n, order.unitId);
  if (survivor) survivor.done = true;
  return n;
}

export function commitBuild(w: World, x: number, y: number, kind: UnitKind): World {
  if (!canBuild(w, x, y, kind)) return w;
  const n = cloneWorld(w);
  const def = UNITS[kind];
  n.funds[n.turn - 1] -= def.cost;
  n.units.push({
    id: `u${n.nextId++}`,
    kind,
    player: n.turn,
    x,
    y,
    hp: 100,
    ammo: def.ammo,
    fuel: def.fuel,
    moved: false,
    done: false,
    loaded: false,
    cargo: null,
  });
  note(n, `${def.name} rolls out of the ${def.facility === "airport" ? "airfield" : "works"}.`);
  return n;
}

export function canBuild(w: World, x: number, y: number, kind: UnitKind): boolean {
  if (w.over || !inBounds(w, x, y)) return false;
  if (w.owner[y][x] !== w.turn) return false;
  if (unitAt(w, x, y)) return false;
  const def = UNITS[kind];
  if (!def.facility) return false;
  const t = w.terrain[y][x];
  if (def.facility === "factory" && t !== "factory") return false;
  if (def.facility === "airport" && t !== "airport") return false;
  return w.funds[w.turn - 1] >= def.cost;
}

export function commitPower(w: World): World {
  if (w.over || w.powerActive[w.turn - 1]) return w;
  const need = COMMANDERS[commanderOf(w, w.turn)].threshold;
  if (w.powerMeter[w.turn - 1] < need) return w;
  const n = cloneWorld(w);
  n.powerMeter[n.turn - 1] = 0;
  n.powerActive[n.turn - 1] = true;
  const def = COMMANDERS[commanderOf(n, n.turn)];
  note(n, `${def.name} calls ${def.power}.`);
  return n;
}

function advanceTurn(w: World) {
  const n = seatCount(w);
  const from = w.turn;
  for (let step = 1; step <= n; step++) {
    const pid = (((from - 1 + step) % n) + 1) as PlayerId;
    if (w.eliminated[pid - 1]) continue;
    if (pid !== from && pid < from) w.day += 1;
    w.turn = pid;
    return;
  }
}

export function endTurn(w: World): World {
  if (w.over) return w;
  const n = cloneWorld(w);
  n.powerActive[n.turn - 1] = false;
  if (livingSeats(n).length <= 1) {
    resolveVictory(n, "wipe");
    return n;
  }
  advanceTurn(n);
  morning(n);
  if (!n.over && n.eliminated[n.turn - 1]) return endTurn(n);
  if (!n.over) note(n, `Day ${n.day}. ${SEAT_NAME[n.turn]} to move.`);
  return n;
}

export function resignSeat(w: World): World {
  if (w.over) return w;
  const n = cloneWorld(w);
  const p = n.turn;
  eliminate(n, p);
  resolveVictory(n, "resign", p);
  if (n.over) return n;
  if (livingSeats(n).length <= 1) {
    resolveVictory(n, "resign", p);
    return n;
  }
  advanceTurn(n);
  morning(n);
  if (!n.over && n.eliminated[n.turn - 1]) return endTurn(n);
  if (!n.over) note(n, `Day ${n.day}. ${SEAT_NAME[n.turn]} to move.`);
  return n;
}

export function propertyCount(w: World, p: PlayerId): number {
  let n = 0;
  for (let y = 0; y < w.height; y++) {
    for (let x = 0; x < w.width; x++) {
      if (w.owner[y][x] === p && isProperty(w.terrain[y][x])) n += 1;
    }
  }
  return n;
}

export function incomeOf(w: World, p: PlayerId): number {
  return propertyCount(w, p) * INCOME;
}
