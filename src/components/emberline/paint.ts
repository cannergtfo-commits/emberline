import { isProperty, type PlayerId, type Terrain } from "@/game/data";
import type { Fx } from "@/game/store";
import { canSeeUnit, visionMap, type Hints, type MoveOrder, type World } from "@/game/rules";
import type { Point } from "@/game/maps";
import type { ArtPack } from "./art";
import { unitFrames } from "./art";

export const TILE = 64;

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

interface PaintArgs {
  ctx: CanvasRenderingContext2D;
  world: World;
  cam: Camera;
  art: ArtPack | null;
  hints: Hints;
  pending: MoveOrder | null;
  selectedId: string | null;
  cursor: Point | null;
  fx: Fx[];
  now: number;
  viewW: number;
  viewH: number;
  dpr: number;
  ember: string;
  gale: string;
  flint: string;
  tide: string;
  ink: string;
}

function seatColor(p: PlayerId, ember: string, gale: string, flint: string, tide: string): string {
  if (p === 1) return ember;
  if (p === 2) return gale;
  if (p === 3) return flint;
  return tide;
}

function blit(ctx: CanvasRenderingContext2D, img: HTMLImageElement | undefined, x: number, y: number, size: number, seed: number) {
  if (!img) return false;
  const s = img.width;
  const win = Math.max(32, Math.floor(s * 0.78));
  const max = Math.max(1, s - win);
  const ox = Math.abs(Math.floor(Math.sin(seed * 12.989) * 43758)) % max;
  const oy = Math.abs(Math.floor(Math.sin(seed * 78.233) * 24634)) % max;
  ctx.drawImage(img, ox, oy, win, win, x, y, size, size);
  return true;
}

function neighbors(world: World, x: number, y: number) {
  const t = (nx: number, ny: number) =>
    nx >= 0 && ny >= 0 && nx < world.width && ny < world.height ? world.terrain[ny][nx] : null;
  return { n: t(x, y - 1), e: t(x + 1, y), s: t(x, y + 1), w: t(x - 1, y) };
}

function roadish(t: Terrain | null): boolean {
  return t === "road" || t === "bridge" || t === "city" || t === "factory" || t === "airport" || t === "hq";
}

function wet(t: Terrain | null): boolean {
  return t === "river" || t === "sea" || t === "bridge";
}

function clipArms(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  mask: { n: boolean; e: boolean; s: boolean; w: boolean },
  width: number,
) {
  const c = TILE / 2;
  const ww = width;
  ctx.beginPath();
  ctx.arc(x + c, y + c, ww / 2, 0, Math.PI * 2);
  if (mask.n) ctx.rect(x + c - ww / 2, y, ww, c);
  if (mask.s) ctx.rect(x + c - ww / 2, y + c, ww, c);
  if (mask.w) ctx.rect(x, y + c - ww / 2, c, ww);
  if (mask.e) ctx.rect(x + c, y + c - ww / 2, c, ww);
  ctx.clip();
}

function fallback(t: Terrain): string {
  switch (t) {
    case "woods":
      return "#3f5c39";
    case "ridge":
      return "#8b8174";
    case "road":
    case "bridge":
      return "#c2a36e";
    case "river":
    case "sea":
      return "#5f8e96";
    case "shoal":
      return "#d7c39a";
    default:
      return "#8b9a63";
  }
}

function smooth(path: Point[], t: number): Point {
  const e = t * t * (3 - 2 * t);
  if (path.length < 2) return path[0] ?? { x: 0, y: 0 };
  const f = Math.min(0.9999, Math.max(0, e)) * (path.length - 1);
  const i = Math.floor(f);
  const u = f - i;
  const a = path[i];
  const b = path[Math.min(path.length - 1, i + 1)];
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

const LABEL = "#eef2f6";

interface BoardCache {
  world: World;
  art: ArtPack | null;
  canvas: HTMLCanvasElement;
  vis: boolean[][] | null;
}

let boardCache: BoardCache | null = null;

function drawTerrain(
  ctx: CanvasRenderingContext2D,
  world: World,
  art: ArtPack | null,
  tone: (p: PlayerId) => string,
  vis: boolean[][] | null,
) {
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const t = world.terrain[y][x];
      const px = x * TILE;
      const py = y * TILE;
      const nb = neighbors(world, x, y);
      ctx.save();
      if (t === "woods" && art?.woods) blit(ctx, art.woods, px, py, TILE, x * 3 + y);
      else if (t === "ridge" && art?.ridge) blit(ctx, art.ridge, px, py, TILE, x + y * 5);
      else if (t === "sea" && art?.water) blit(ctx, art.water, px, py, TILE, x * 9 + y);
      else if (t === "shoal" && art?.sand) blit(ctx, art.sand, px, py, TILE, x + y * 4);
      else {
        if (!blit(ctx, art?.grass, px, py, TILE, x * 13 + y * 7)) {
          ctx.fillStyle = fallback(t);
          ctx.fillRect(px, py, TILE, TILE);
        }
      }
      if ((t === "river" || t === "bridge") && art?.water) {
        ctx.save();
        clipArms(ctx, px, py, { n: wet(nb.n), e: wet(nb.e), s: wet(nb.s), w: wet(nb.w) }, t === "bridge" ? TILE * 0.62 : TILE * 0.46);
        blit(ctx, art.water, px, py, TILE, 3 + x + y);
        ctx.restore();
      }
      if (t === "road" || t === "bridge" || (isProperty(t) && (roadish(nb.n) || roadish(nb.e) || roadish(nb.s) || roadish(nb.w)))) {
        ctx.save();
        clipArms(
          ctx,
          px,
          py,
          { n: roadish(nb.n), e: roadish(nb.e), s: roadish(nb.s), w: roadish(nb.w) },
          TILE * (t === "bridge" ? 0.4 : 0.34),
        );
        if (!blit(ctx, art?.dirt, px, py, TILE, x * 2 + y * 8)) {
          ctx.fillStyle = "#c2a36e";
          ctx.fillRect(px, py, TILE, TILE);
        }
        ctx.restore();
      }
      ctx.restore();

      if (isProperty(t)) {
        const owner = world.owner[y][x];
        const faction = owner === 0 ? "neutral" : world.commanders[owner - 1];
        const propKind = t === "hq" ? "keep" : t === "factory" ? "works" : t === "airport" ? "air" : "town";
        const prop = art?.props[faction]?.[propKind] ?? art?.props.neutral?.[propKind];
        if (prop) {
          const s = TILE * 0.92;
          ctx.drawImage(prop, px + (TILE - s) / 2, py + TILE * 0.01, s, s);
        }
        ctx.fillStyle = owner === 0 ? "rgba(28,23,18,0.35)" : tone(owner);
        ctx.fillRect(px + 8, py + TILE - 8, TILE - 16, 5);
        if (world.capturer[y][x]) {
          ctx.fillStyle = LABEL;
          ctx.font = "600 11px ui-sans-serif, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(String(Math.max(0, world.capture[y][x])), px + TILE / 2, py + 14);
        }
      }

      ctx.strokeStyle = "rgba(28,23,18,0.2)";
      ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);

      if (vis && !vis[y][x]) {
        ctx.fillStyle = "rgba(28,23,18,0.42)";
        ctx.fillRect(px, py, TILE, TILE);
      }
    }
  }
}

function terrainLayer(
  world: World,
  art: ArtPack | null,
  tone: (p: PlayerId) => string,
): BoardCache {
  if (boardCache && boardCache.world === world && boardCache.art === art) return boardCache;
  const canvas = document.createElement("canvas");
  canvas.width = world.width * TILE;
  canvas.height = world.height * TILE;
  const ctx = canvas.getContext("2d");
  const vis = world.fog ? visionMap(world, world.turn) : null;
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    drawTerrain(ctx, world, art, tone, vis);
  }
  boardCache = { world, art, canvas, vis };
  return boardCache;
}

export function paint(args: PaintArgs) {
  const { ctx, world, cam, art, hints, pending, selectedId, cursor, fx, now, viewW, viewH, dpr, ember, gale, flint, tide } = args;
  const tone = (p: PlayerId) => seatColor(p, ember, gale, flint, tide);
  const shaking = fx.some((f) => f.kind === "float" && now - f.t0 < 160);
  const jx = shaking ? Math.sin(now / 18) * 2.5 : 0;
  const jy = shaking ? Math.cos(now / 15) * 1.6 : 0;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewW, viewH);
  ctx.fillStyle = "#090c10";
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.translate(cam.x + jx, cam.y + jy);
  ctx.scale(cam.scale, cam.scale);
  ctx.imageSmoothingEnabled = true;
  const layer = terrainLayer(world, art, tone);
  ctx.drawImage(layer.canvas, 0, 0);
  const vis = layer.vis;

  const mark = (points: { x: number; y: number }[], color: string) => {
    ctx.fillStyle = color;
    for (const p of points) ctx.fillRect(p.x * TILE, p.y * TILE, TILE, TILE);
  };
  const moveTint =
    world.turn === 1
      ? "rgba(196,73,29,0.28)"
      : world.turn === 2
        ? "rgba(27,107,102,0.28)"
        : world.turn === 3
          ? "rgba(161,98,7,0.32)"
          : "rgba(42,78,143,0.32)";
  mark(hints.moves, moveTint);
  mark(hints.drops, "rgba(250,246,238,0.45)");
  mark(hints.attacks, "rgba(122,36,24,0.38)");

  if (pending && pending.path.length > 1) {
    ctx.fillStyle = LABEL;
    for (const p of pending.path) {
      ctx.beginPath();
      ctx.arc(p.x * TILE + TILE / 2, p.y * TILE + TILE / 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (cursor) {
    ctx.strokeStyle = "rgba(250,246,238,0.95)";
    ctx.lineWidth = 2;
    ctx.strokeRect(cursor.x * TILE + 2, cursor.y * TILE + 2, TILE - 4, TILE - 4);
    ctx.lineWidth = 1;
  }

  const moving = new Map<string, Point>();
  for (const f of fx) {
    if (f.kind === "move" && f.unitId && f.path && now < f.t0 + f.dur) {
      moving.set(f.unitId, smooth(f.path, (now - f.t0) / f.dur));
    }
  }

  const drawUnit = (
    kind: World["units"][number]["kind"],
    player: PlayerId,
    faction: World["commanders"][number],
    gx: number,
    gy: number,
    hp: number,
    done: boolean,
    selected: boolean,
    cargo: boolean,
    frame: number,
    ox: number,
    oy: number,
  ) => {
    const cx = gx * TILE + TILE / 2 + ox;
    const cy = gy * TILE + TILE / 2 + oy;
    ctx.save();
    if (done) ctx.globalAlpha = 0.62;
    ctx.fillStyle = tone(player);
    ctx.globalAlpha = (done ? 0.45 : 0.85) * (ctx.globalAlpha || 1);
    ctx.beginPath();
    ctx.ellipse(cx, cy + TILE * 0.22, TILE * 0.26, TILE * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = done ? 0.72 : 1;
    const frames = unitFrames(art, faction, kind);
    const sprite = frames[Math.min(frame, Math.max(0, frames.length - 1))] ?? frames[0];
    if (sprite) {
      const s = TILE * 0.96;
      ctx.drawImage(sprite, cx - s / 2, cy - s * 0.62, s, s);
    } else {
      ctx.fillStyle = tone(player);
      ctx.fillRect(cx - 10, cy - 14, 20, 20);
    }
    if (selected) {
      ctx.strokeStyle = "#faf6ee";
      ctx.lineWidth = 2;
      ctx.strokeRect(gx * TILE + 3, gy * TILE + 3, TILE - 6, TILE - 6);
    }
    const bars = Math.ceil(hp / 10);
    const bw = TILE * 0.62;
    const bx = gx * TILE + TILE / 2 - bw / 2;
    const by = gy * TILE + TILE - 11;
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i < bars ? tone(player) : "rgba(28,23,18,0.28)";
      ctx.fillRect(bx + i * (bw / 10), by, bw / 10 - 1, 4);
    }
    if (cargo) {
      ctx.fillStyle = "#faf6ee";
      ctx.fillRect(cx + 12, cy - 20, 7, 7);
    }
    ctx.restore();
  };

  const units = [...world.units].filter((u) => !u.loaded && u.hp > 0).sort((a, b) => a.y - b.y || a.x - b.x);
  for (const u of units) {
    if (u.player !== world.turn && !canSeeUnit(world, world.turn, u, vis ?? undefined)) continue;
    const pos = moving.get(u.id);
    const strike = fx.find((f) => f.kind === "strike" && f.unitId === u.id && now >= f.t0 && now < f.t0 + f.dur);
    const frames = unitFrames(art, world.commanders[u.player - 1], u.kind);
    let frame = 0;
    let ox = 0;
    let oy = Math.sin(now / 460 + u.x * 2.1) * 1.2;
    if (strike && strike.x !== undefined && strike.y !== undefined) {
      const p = (now - strike.t0) / strike.dur;
      frame = p < 0.46 ? 2 : 3;
      const dx = strike.x - (pos?.x ?? u.x);
      const dy = strike.y - (pos?.y ?? u.y);
      const len = Math.hypot(dx, dy) || 1;
      const lunge = Math.sin(Math.min(1, p) * Math.PI) * 12;
      ox = (dx / len) * lunge;
      oy = (dy / len) * lunge;
    } else if (pos) {
      const march = [0, 4, 5].filter((i) => frames[i]);
      const steps = march.length >= 3 ? march : [0, 1].filter((i) => frames[i]);
      frame = steps[Math.floor(now / 110) % Math.max(1, steps.length)] ?? 0;
      oy = Math.sin(now / 90) * 1.5;
    }
    drawUnit(
      u.kind,
      u.player,
      world.commanders[u.player - 1],
      pos?.x ?? u.x,
      pos?.y ?? u.y,
      u.hp,
      u.done && u.player === world.turn,
      u.id === selectedId,
      Boolean(u.cargo),
      frame,
      ox,
      oy,
    );
    if (strike && art?.hit.length && strike.x !== undefined && strike.y !== undefined) {
      const p = (now - strike.t0) / strike.dur;
      const hit = art.hit[Math.min(art.hit.length - 1, Math.floor(p * art.hit.length))];
      if (hit) {
        const s = TILE * (0.55 + Math.sin(Math.min(1, p) * Math.PI) * 0.35);
        ctx.save();
        ctx.globalAlpha = 1 - p * 0.35;
        ctx.drawImage(hit, strike.x * TILE + (TILE - s) / 2, strike.y * TILE + (TILE - s) / 2, s, s);
        ctx.restore();
      }
    }
  }

  ctx.font = "700 15px Barlow, sans-serif";
  ctx.textAlign = "center";
  for (const f of fx) {
    if (f.kind !== "float" || f.x === undefined || f.y === undefined || !f.text) continue;
    const p = Math.min(1, (now - f.t0) / f.dur);
    if (p < 0 || p >= 1) continue;
    ctx.globalAlpha = 1 - p;
    ctx.fillStyle = LABEL;
    ctx.fillText(f.text, f.x * TILE + TILE / 2, f.y * TILE + 18 - p * 22);
    ctx.globalAlpha = 1;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
