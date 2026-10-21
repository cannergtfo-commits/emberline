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

export const CO_SRC: Record<CommanderId, string> = { nord, vael, heart, maw, aure };

const FACTIONS: CommanderId[] = ["nord", "vael", "heart", "maw", "aure"];
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

export interface ArtPack {
  grass?: HTMLImageElement;
  woods?: HTMLImageElement;
  ridge?: HTMLImageElement;
  dirt?: HTMLImageElement;
  water?: HTMLImageElement;
  sand?: HTMLImageElement;
  units: Partial<Record<CommanderId, Partial<Record<UnitKind, HTMLImageElement[]>>>>;
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

export function unitFrames(art: ArtPack | null, faction: CommanderId, kind: UnitKind): (HTMLImageElement | undefined)[] {
  return art?.units[faction]?.[kind] ?? [];
}

export function unitStill(faction: CommanderId, kind: UnitKind): string | undefined {
  const suffix = `/units/${faction}/${kind}/0.png`;
  return Object.entries(frameUrls).find(([path]) => path.endsWith(suffix))?.[1];
}

if (typeof window !== "undefined") void loadArt();
