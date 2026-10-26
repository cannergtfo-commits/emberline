import { useEffect, useState } from "react";
import { UNIT_KINDS, type CommanderId, type UnitKind } from "@/game/data";
import grass from "@/assets/emberline/tiles/grass.jpg";
import woods from "@/assets/emberline/tiles/woods.jpg";
import ridge from "@/assets/emberline/tiles/ridge.jpg";
import dirt from "@/assets/emberline/tiles/dirt.jpg";
import water from "@/assets/emberline/tiles/water.jpg";
import sand from "@/assets/emberline/tiles/sand.jpg";
import nord from "@/assets/emberline/commanders/nord.jpg";
import vael from "@/assets/emberline/commanders/vael.jpg";
import heart from "@/assets/emberline/commanders/heart.jpg";
import maw from "@/assets/emberline/commanders/maw.jpg";
import aure from "@/assets/emberline/commanders/aure.jpg";
import hana from "@/assets/emberline/commanders/hana.jpg";

export const CO_SRC: Record<CommanderId, string> = { nord, vael, heart, maw, aure, hana };

const FACTIONS: CommanderId[] = ["nord", "vael", "heart", "maw", "aure", "hana"];
const PROP_KINDS = ["keep", "town", "works", "air"] as const;
export type PropKind = (typeof PROP_KINDS)[number];

const frameUrls = import.meta.glob("../../assets/emberline/units/*/*/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const propUrls = import.meta.glob("../../assets/emberline/props/*/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const hitUrls = import.meta.glob("../../assets/emberline/fx/hit*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

type Sprite = CanvasImageSource;

export interface ArtPack {
  grass?: HTMLImageElement;
  woods?: HTMLImageElement;
  ridge?: HTMLImageElement;
  dirt?: HTMLImageElement;
  water?: HTMLImageElement;
  sand?: HTMLImageElement;
  units: Partial<Record<CommanderId, Partial<Record<UnitKind, (Sprite | undefined)[]>>>>;
  props: Partial<Record<string, Partial<Record<PropKind, HTMLImageElement>>>>;
  hit: HTMLImageElement[];
}

function loadImage(src: string): Promise<HTMLImageElement | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(undefined);
    img.src = src;
  });
}

function ankleOf(img: HTMLImageElement): number {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const fallback = Math.round(h * 0.72);
  if (!w || !h) return fallback;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return fallback;
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, w, h);
  const widths = new Array<number>(h).fill(0);
  let y0 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    let min = w;
    let max = -1;
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 24) {
        if (x < min) min = x;
        if (x > max) max = x;
      }
    }
    if (max >= 0) {
      widths[y] = max - min + 1;
      if (y0 < 0) y0 = y;
      y1 = y;
    }
  }
  if (y0 < 0 || y1 - y0 < 40) return fallback;
  const span = y1 - y0;
  const bandA = y0 + Math.floor(span * 0.58);
  const bandB = y0 + Math.floor(span * 0.84);
  let ankle = bandA;
  let narrow = Number.POSITIVE_INFINITY;
  for (let y = bandA; y < bandB; y++) {
    const width = widths[y] || 9999;
    if (width < narrow) {
      narrow = width;
      ankle = y;
    }
  }
  return ankle;
}

function poseGround(img: HTMLImageElement, ankle: number, dx: number, dy: number, rot: number, sy: number) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const nh = Math.max(1, Math.round(ankle * sy));
  const pad = 48;
  const fig = document.createElement("canvas");
  fig.width = w + pad * 2;
  fig.height = nh + pad * 2;
  const fctx = fig.getContext("2d");
  if (!fctx) return img;
  fctx.imageSmoothingEnabled = true;
  fctx.translate(pad + w / 2, pad + nh);
  fctx.rotate((rot * Math.PI) / 180);
  fctx.drawImage(img, 0, 0, w, ankle, -w / 2, -nh, w, nh);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d");
  if (!octx) return img;
  octx.imageSmoothingEnabled = true;
  octx.drawImage(fig, dx - pad, Math.round(ankle + dy - nh) - pad);
  octx.drawImage(img, 0, ankle, w, h - ankle, 0, ankle, w, h - ankle);
  return out;
}

function poseAir(img: HTMLImageElement, dx: number, dy: number, rot: number, sy: number) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const nh = Math.max(1, Math.round(h * sy));
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return img;
  ctx.imageSmoothingEnabled = true;
  ctx.translate(w / 2 + dx, h / 2 + dy);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -nh / 2, w, nh);
  return out;
}

function enliven(pack: ArtPack) {
  for (const faction of FACTIONS) {
    const kinds = pack.units[faction];
    if (!kinds) continue;
    for (const kind of UNIT_KINDS) {
      const row = kinds[kind];
      const still = row?.[0];
      if (!row || !(still instanceof HTMLImageElement)) continue;
      const air = kind === "kite" || kind === "wasp" || kind === "dart" || kind === "crucible";
      const take = (index: number) => (row[index] instanceof HTMLImageElement ? row[index] : still);
      if (air) {
        row[6] = poseAir(still, 0, -18, -10, 1);
        row[7] = poseAir(still, 0, 12, 9, 1);
        row[8] = poseAir(take(4), 0, -22, -16, 1.04);
        row[9] = poseAir(take(5), 8, -8, 14, 1);
        row[10] = poseAir(take(1), -6, -12, -13, 1.05);
        row[11] = poseAir(take(4), 6, 10, 12, 0.96);
      } else {
        const ankle = ankleOf(still);
        row[6] = poseGround(still, ankle, 0, -14, -5, 1.08);
        row[7] = poseGround(still, ankle, 10, 4, 6.5, 0.96);
        row[8] = poseGround(take(4), ankle, 0, -22, -8, 1.05);
        row[9] = poseGround(take(5), ankle, -8, -6, 6, 1);
        row[10] = poseGround(take(1), ankle, 6, -16, -6, 1.03);
        row[11] = poseGround(take(4), ankle, -6, -8, 8, 0.98);
      }
    }
  }
}

let packPromise: Promise<void> | null = null;
let current: ArtPack = { units: {}, props: {}, hit: [] };
const listeners = new Set<(pack: ArtPack) => void>();

function publish(next: ArtPack) {
  const units: ArtPack["units"] = {};
  for (const faction of FACTIONS) units[faction] = { ...next.units[faction] };
  const props: ArtPack["props"] = {};
  for (const [faction, kinds] of Object.entries(next.props)) props[faction] = { ...kinds };
  current = { ...next, units, props, hit: next.hit.slice() };
  for (const listener of listeners) listener(current);
}

export function loadArt(): Promise<ArtPack> {
  if (!packPromise) {
    packPromise = (async () => {
      const [grassI, woodsI, ridgeI, dirtI, waterI, sandI] = await Promise.all([
        loadImage(grass),
        loadImage(woods),
        loadImage(ridge),
        loadImage(dirt),
        loadImage(water),
        loadImage(sand),
      ]);
      const pack: ArtPack = {
        grass: grassI,
        woods: woodsI,
        ridge: ridgeI,
        dirt: dirtI,
        water: waterI,
        sand: sandI,
        units: {},
        props: {},
        hit: [],
      };
      for (const faction of FACTIONS) {
        const kinds: Partial<Record<UnitKind, HTMLImageElement[]>> = {};
        for (const kind of UNIT_KINDS) kinds[kind] = [];
        pack.units[faction] = kinds;
      }
      publish(pack);

      const soon: Promise<void>[] = [];
      const later: Promise<void>[] = [];
      for (const [path, url] of Object.entries(frameUrls)) {
        const match = path.match(/units\/([^/]+)\/([^/]+)\/(\d+)\.png$/);
        if (!match) continue;
        const faction = match[1] as CommanderId;
        const kind = match[2] as UnitKind;
        const index = Number(match[3]);
        const row = pack.units[faction]?.[kind];
        if (!row) continue;
        const job = loadImage(url).then((img) => {
          if (img) row[index] = img;
        });
        (index === 0 ? soon : later).push(job);
      }
      for (const [path, url] of Object.entries(propUrls)) {
        const match = path.match(/props\/([^/]+)\/([^/]+)\.png$/);
        if (!match) continue;
        const faction = match[1];
        const kind = match[2] as PropKind;
        soon.push(
          loadImage(url).then((img) => {
            if (!img) return;
            pack.props[faction] = pack.props[faction] ?? {};
            pack.props[faction]![kind] = img;
          }),
        );
      }
      await Promise.all(soon);
      publish(pack);
      void Promise.all(later).then(async () => {
        enliven(pack);
        publish(pack);
        const hitPairs = Object.entries(hitUrls).sort(([a], [b]) => a.localeCompare(b));
        const hits = await Promise.all(hitPairs.map(([, url]) => loadImage(url)));
        for (const img of hits) if (img) current.hit.push(img);
      });
    })();
  }
  return packPromise.then(() => current);
}

export function useArt(): ArtPack | null {
  const [art, setArt] = useState<ArtPack | null>(current.grass ? current : null);
  useEffect(() => {
    listeners.add(setArt);
    if (current.grass) setArt(current);
    void loadArt();
    return () => {
      listeners.delete(setArt);
    };
  }, []);
  return art;
}

export function unitFrames(art: ArtPack | null, faction: CommanderId, kind: UnitKind): (Sprite | undefined)[] {
  return art?.units[faction]?.[kind] ?? [];
}

export function unitStill(faction: CommanderId, kind: UnitKind): string | undefined {
  const suffix = `/units/${faction}/${kind}/0.png`;
  return Object.entries(frameUrls).find(([path]) => path.endsWith(suffix))?.[1];
}

if (typeof window !== "undefined") void loadArt();
