import {
  MOVE_COST,
  UNITS,
  type PlayerId,
  type Terrain,
  type UnitKind,
} from "./data";

export interface Point {
  x: number;
  y: number;
}

export interface BuiltMap {
  id: string;
  name: string;
  blurb: string;
  width: number;
  height: number;
  terrain: Terrain[][];
  owner: (0 | PlayerId)[][];
  homeKeep: Point[];
  seats: 2 | 3 | 4;
  deploy: { kind: UnitKind; player: PlayerId; x: number; y: number }[];
  rows: string[];
}

const MIRROR: Record<string, string> = {
  "1": "2",
  "2": "1",
  "3": "4",
  "4": "3",
  "6": "7",
  "7": "6",
  "9": "0",
  "0": "9",
};

const DECODE: Record<string, { terrain: Terrain; owner: 0 | PlayerId }> = {
  ".": { terrain: "plain", owner: 0 },
  "*": { terrain: "woods", owner: 0 },
  "^": { terrain: "ridge", owner: 0 },
  "=": { terrain: "road", owner: 0 },
  "~": { terrain: "river", owner: 0 },
  w: { terrain: "sea", owner: 0 },
  ",": { terrain: "shoal", owner: 0 },
  b: { terrain: "bridge", owner: 0 },
  n: { terrain: "city", owner: 0 },
  "1": { terrain: "city", owner: 1 },
  "2": { terrain: "city", owner: 2 },
  "3": { terrain: "factory", owner: 1 },
  "4": { terrain: "factory", owner: 2 },
  "5": { terrain: "factory", owner: 0 },
  "6": { terrain: "airport", owner: 1 },
  "7": { terrain: "airport", owner: 2 },
  "9": { terrain: "hq", owner: 1 },
  "0": { terrain: "hq", owner: 2 },
  C: { terrain: "city", owner: 3 },
  D: { terrain: "city", owner: 4 },
  E: { terrain: "factory", owner: 3 },
  F: { terrain: "factory", owner: 4 },
  G: { terrain: "airport", owner: 3 },
  H: { terrain: "airport", owner: 4 },
  I: { terrain: "hq", owner: 3 },
  J: { terrain: "hq", owner: 4 },
  "8": { terrain: "airport", owner: 0 },
};

function mirrorChar(ch: string): string {
  return MIRROR[ch] ?? ch;
}

function stamp(w: number, h: number, marks: [number, number, string][]): string[] {
  const g = Array.from({ length: h }, () => Array(w).fill("."));
  const put = (x: number, y: number, ch: string) => {
    if (y < 0 || x < 0 || y >= h || x >= w) throw new Error(`out ${x},${y}`);
    const cur = g[y][x];
    if (cur !== "." && cur !== ch) throw new Error(`conflict ${x},${y} ${cur} vs ${ch}`);
    g[y][x] = ch;
    const mx = w - 1 - x;
    const my = h - 1 - y;
    const mc = mirrorChar(ch);
    if (mx === x && my === y) {
      if (mc !== ch) throw new Error(`center ${ch}`);
      return;
    }
    const other = g[my][mx];
    if (other !== "." && other !== mc) {
      throw new Error(`mirror ${mx},${my} ${other} vs ${mc} from ${x},${y} ${ch}`);
    }
    g[my][mx] = mc;
  };
  for (const [x, y, ch] of marks) put(x, y, ch);
  return g.map((row) => row.join(""));
}

function finish(
  id: string,
  name: string,
  blurb: string,
  rows: string[],
  south: { kind: UnitKind; x: number; y: number }[],
): BuiltMap {
  const height = rows.length;
  const width = rows[0].length;
  const terrain: Terrain[][] = [];
  const owner: (0 | PlayerId)[][] = [];
  let keep1: Point | null = null;
  let keep2: Point | null = null;
  for (let y = 0; y < height; y++) {
    terrain[y] = [];
    owner[y] = [];
    for (let x = 0; x < width; x++) {
      const cell = DECODE[rows[y][x]];
      if (!cell) throw new Error(`bad char ${rows[y][x]} at ${x},${y} on ${id}`);
      terrain[y][x] = cell.terrain;
      owner[y][x] = cell.owner;
      if (cell.terrain === "hq" && cell.owner === 1) keep1 = { x, y };
      if (cell.terrain === "hq" && cell.owner === 2) keep2 = { x, y };
      const mx = width - 1 - x;
      const my = height - 1 - y;
      if (y > my || (y === my && x > mx)) continue;
    }
  }
  if (!keep1 || !keep2) throw new Error(`missing keep ${id}`);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const mx = width - 1 - x;
      const my = height - 1 - y;
      if (terrain[y][x] !== terrain[my][mx]) throw new Error(`terrain symmetry ${id} ${x},${y}`);
      const o = owner[y][x];
      const mo = owner[my][mx];
      const expect = o === 1 ? 2 : o === 2 ? 1 : 0;
      if (mo !== expect) throw new Error(`owner symmetry ${id} ${x},${y}`);
    }
  }
  const deploy = [
    ...south.map((u) => ({ ...u, player: 1 as const })),
    ...south.map((u) => ({
      kind: u.kind,
      player: 2 as const,
      x: width - 1 - u.x,
      y: height - 1 - u.y,
    })),
  ];
  const seen = new Set<string>();
  for (const u of deploy) {
    const k = `${u.x},${u.y}`;
    if (seen.has(k)) throw new Error(`stacked deploy ${id} ${k}`);
    seen.add(k);
    const cost = MOVE_COST[UNITS[u.kind].moveClass][terrain[u.y][u.x]];
    if (cost >= 99) throw new Error(`illegal deploy ${id} ${u.kind} ${k} ${terrain[u.y][u.x]}`);
  }
  return {
    id,
    name,
    blurb,
    width,
    height,
    terrain,
    owner,
    homeKeep: [keep1, keep2],
    seats: 2,
    deploy,
    rows,
  };
}

const W = 15;
const H = 11;

const splitRidge = finish(
  "ridge",
  "Split Ridge",
  "A mountain wall with a forest gap and one wagon road. Keeps, works, airfields.",
  stamp(W, H, [
    [1, 9, "9"],
    [0, 8, "6"],
    [3, 9, "3"],
    [1, 7, "1"],
    [4, 7, "1"],
    [2, 9, "="],
    [4, 9, "="],
    [5, 9, "="],
    [1, 8, "="],
    [5, 8, "="],
    [6, 8, "="],
    [6, 7, "="],
    [5, 7, "="],
    [7, 7, "="],
    [7, 6, "="],
    [7, 5, "n"],
    [6, 5, "="],
    [5, 5, "^"],
    [4, 5, "^"],
    [3, 5, "*"],
    [2, 5, "*"],
    [1, 5, "*"],
    [0, 5, "*"],
    [4, 6, "^"],
    [5, 6, "^"],
    [6, 6, "^"],
    [8, 6, "^"],
    [3, 6, "*"],
    [2, 7, "*"],
    [3, 7, "*"],
    [0, 9, "*"],
    [0, 10, "*"],
    [2, 10, "*"],
    [4, 10, "^"],
    [6, 10, "*"],
    [8, 9, "*"],
    [9, 8, "*"],
    [4, 8, "*"],
    [8, 8, "*"],
    [9, 9, "*"],
    [10, 8, "="],
    [2, 6, "^"],
    [8, 7, "^"],
    [9, 6, "^"],
    [9, 10, "^"],
  ]),
  [
    { kind: "skirmisher", x: 2, y: 9 },
    { kind: "skirmisher", x: 2, y: 8 },
    { kind: "lancer", x: 4, y: 9 },
    { kind: "mortar", x: 5, y: 9 },
    { kind: "outrider", x: 6, y: 8 },
  ],
);

const orchard = finish(
  "orchard",
  "Orchard Line",
  "Open meadows, a forest belt, and a few peaks. Two neutral works wait in the trees.",
  stamp(W, H, [
    [1, 9, "9"],
    [3, 9, "3"],
    [1, 7, "6"],
    [5, 8, "1"],
    [3, 7, "1"],
    [4, 6, "5"],
    [2, 9, "="],
    [4, 9, "="],
    [5, 9, "="],
    [6, 9, "="],
    [7, 9, "="],
    [7, 8, "="],
    [7, 7, "="],
    [7, 6, "="],
    [6, 8, "="],
    [1, 8, "="],
    [2, 8, "="],
    [3, 8, "="],
    [4, 8, "="],
    [7, 5, "n"],
    [6, 5, "="],
    [5, 5, "*"],
    [4, 5, "*"],
    [2, 5, "*"],
    [1, 5, "*"],
    [0, 5, "*"],
    [0, 9, "*"],
    [0, 10, "*"],
    [2, 10, "*"],
    [4, 10, "*"],
    [5, 10, "*"],
    [8, 8, "*"],
    [9, 7, "*"],
    [5, 7, "*"],
    [6, 6, "*"],
    [9, 9, "*"],
    [10, 9, "*"],
    [11, 8, "*"],
    [10, 6, "*"],
    [9, 6, "^"],
    [8, 10, "^"],
    [9, 10, "^"],
    [10, 10, "^"],
  ]),
  [
    { kind: "skirmisher", x: 2, y: 9 },
    { kind: "skirmisher", x: 3, y: 8 },
    { kind: "lancer", x: 5, y: 9 },
    { kind: "wasp", x: 1, y: 8 },
  ],
);

const causeway = finish(
  "causeway",
  "Broken Causeway",
  "A creek with three bridges. Vehicles cannot ford it. Mountains stop everyone.",
  stamp(W, H, [
    [7, 10, "w"],
    [7, 9, "~"],
    [7, 8, "b"],
    [7, 7, "~"],
    [7, 6, "~"],
    [7, 5, "b"],
    [6, 10, ","],
    [8, 10, ","],
    [1, 9, "9"],
    [3, 8, "3"],
    [1, 7, "6"],
    [4, 9, "1"],
    [3, 6, "1"],
    [2, 9, "="],
    [1, 8, "="],
    [4, 8, "="],
    [5, 8, "="],
    [6, 8, "="],
    [4, 6, "="],
    [5, 6, "="],
    [6, 6, "="],
    [6, 5, "="],
    [5, 9, "*"],
    [4, 7, "*"],
    [5, 7, "*"],
    [2, 10, "*"],
    [0, 9, "*"],
    [0, 10, "*"],
    [5, 10, "^"],
    [2, 7, "*"],
    [9, 8, "*"],
    [3, 10, "^"],
    [4, 10, "^"],
  ]),
  [
    { kind: "skirmisher", x: 5, y: 8 },
    { kind: "skirmisher", x: 2, y: 9 },
    { kind: "lancer", x: 6, y: 8 },
    { kind: "jugger", x: 6, y: 6 },
    { kind: "kite", x: 0, y: 7 },
  ],
);

const CROWN_W = 21;
const CROWN_H = 15;

const ALLY_MIRROR: Record<string, string> = {
  "1": "C",
  C: "1",
  "3": "E",
  E: "3",
  "6": "G",
  G: "6",
  "9": "I",
  I: "9",
  "2": "D",
  D: "2",
  "4": "F",
  F: "4",
  "7": "H",
  H: "7",
  "0": "J",
  J: "0",
};

function stampAlliance(w: number, h: number, marks: [number, number, string][]): string[] {
  const g = Array.from({ length: h }, () => Array(w).fill("."));
  const put = (x: number, y: number, ch: string) => {
    if (y < 0 || x < 0 || y >= h || x >= w) throw new Error(`out ${x},${y}`);
    const cur = g[y][x];
    if (cur !== "." && cur !== ch) throw new Error(`conflict ${x},${y} ${cur} vs ${ch}`);
    g[y][x] = ch;
    const mx = w - 1 - x;
    const my = h - 1 - y;
    const mc = ALLY_MIRROR[ch] ?? ch;
    if (mx === x && my === y) {
      if (mc !== ch) throw new Error(`center ${ch}`);
      return;
    }
    const other = g[my][mx];
    if (other !== "." && other !== mc) {
      throw new Error(`mirror ${mx},${my} ${other} vs ${mc} from ${x},${y} ${ch}`);
    }
    g[my][mx] = mc;
  };
  for (const [x, y, ch] of marks) put(x, y, ch);
  return g.map((row) => row.join(""));
}

function assemble(
  id: string,
  name: string,
  blurb: string,
  rows: string[],
  deploy: { kind: UnitKind; player: PlayerId; x: number; y: number }[],
): BuiltMap {
  const height = rows.length;
  const width = rows[0].length;
  if (rows.some((r) => r.length !== width)) throw new Error(`ragged ${id}`);
  const terrain: Terrain[][] = [];
  const owner: (0 | PlayerId)[][] = [];
  const keeps: (Point | null)[] = [null, null, null, null];
  for (let y = 0; y < height; y++) {
    terrain[y] = [];
    owner[y] = [];
    for (let x = 0; x < width; x++) {
      const cell = DECODE[rows[y][x]];
      if (!cell) throw new Error(`bad char ${rows[y][x]} at ${x},${y} on ${id}`);
      terrain[y][x] = cell.terrain;
      owner[y][x] = cell.owner;
      if (cell.terrain === "hq" && cell.owner >= 1 && cell.owner <= 4) keeps[cell.owner - 1] = { x, y };
    }
  }
  let count = 0;
  for (let i = 0; i < 4; i++) if (keeps[i]) count += 1;
  for (let i = 0; i < count; i++) if (!keeps[i]) throw new Error(`keep gap ${id}`);
  if (count < 2 || count > 4) throw new Error(`seats ${id} ${count}`);
  const homeKeep = keeps.slice(0, count).map((k) => k as Point);
  const seen = new Set<string>();
  for (const u of deploy) {
    if (u.player > count) throw new Error(`deploy player ${id} ${u.player}`);
    const k = `${u.x},${u.y}`;
    if (seen.has(k)) throw new Error(`stacked deploy ${id} ${k}`);
    seen.add(k);
    const cost = MOVE_COST[UNITS[u.kind].moveClass][terrain[u.y][u.x]];
    if (cost >= 99) throw new Error(`illegal deploy ${id} ${u.kind} ${k} ${terrain[u.y][u.x]}`);
  }
  for (let p = 1; p <= count; p++) {
    if (!deploy.some((d) => d.player === p)) throw new Error(`no units for ${p} on ${id}`);
  }
  return {
    id,
    name,
    blurb,
    width,
    height,
    terrain,
    owner,
    homeKeep,
    seats: count as 2 | 3 | 4,
    deploy,
    rows,
  };
}

const crownSouth: { kind: UnitKind; player: 1 | 2; x: number; y: number }[] = [
  { kind: "skirmisher", player: 1, x: 2, y: 13 },
  { kind: "skirmisher", player: 1, x: 2, y: 12 },
  { kind: "lancer", player: 1, x: 4, y: 13 },
  { kind: "outrider", player: 1, x: 5, y: 13 },
  { kind: "mortar", player: 1, x: 5, y: 12 },
  { kind: "skirmisher", player: 2, x: 18, y: 13 },
  { kind: "skirmisher", player: 2, x: 18, y: 12 },
  { kind: "lancer", player: 2, x: 16, y: 13 },
  { kind: "outrider", player: 2, x: 15, y: 13 },
  { kind: "mortar", player: 2, x: 15, y: 12 },
];

const crownMarch = assemble(
  "crown",
  "Crown March",
  "Four keeps on a road ring. Abandoned towns, works, and an airfield sit in the middle.",
  stampAlliance(CROWN_W, CROWN_H, [
    [1, 13, "9"],
    [3, 13, "3"],
    [0, 12, "6"],
    [1, 11, "1"],
    [4, 12, "1"],
    [2, 13, "="],
    [4, 13, "="],
    [5, 13, "="],
    [1, 12, "="],
    [2, 12, "="],
    [3, 12, "="],
    [5, 12, "="],
    [6, 12, "="],
    [6, 11, "="],
    [6, 10, "="],
    [7, 10, "="],
    [8, 10, "="],
    [8, 9, "="],
    [8, 8, "="],
    [9, 8, "="],
    [9, 7, "="],
    [19, 13, "0"],
    [17, 13, "4"],
    [20, 12, "7"],
    [19, 11, "2"],
    [16, 12, "2"],
    [18, 13, "="],
    [16, 13, "="],
    [15, 13, "="],
    [19, 12, "="],
    [18, 12, "="],
    [17, 12, "="],
    [15, 12, "="],
    [14, 12, "="],
    [14, 11, "="],
    [14, 10, "="],
    [13, 10, "="],
    [12, 10, "="],
    [12, 9, "="],
    [12, 8, "="],
    [11, 8, "="],
    [11, 7, "="],
    [0, 7, "n"],
    [1, 7, "="],
    [2, 7, "="],
    [3, 7, "="],
    [4, 7, "*"],
    [5, 7, "="],
    [6, 7, "="],
    [7, 7, "8"],
    [8, 7, "="],
    [9, 7, "="],
    [10, 7, "5"],
    [6, 9, "^"],
    [5, 9, "*"],
    [7, 9, "*"],
    [9, 9, "n"],
    [7, 11, "n"],
    [9, 11, "n"],
    [10, 11, "n"],
    [10, 9, "5"],
    [10, 10, "8"],
    [10, 12, "n"],
    [10, 14, "n"],
    [8, 14, "*"],
    [9, 14, "^"],
  ]),
  [
    ...crownSouth,
    ...crownSouth.map((u) => ({
      kind: u.kind,
      player: (u.player === 1 ? 3 : 4) as PlayerId,
      x: CROWN_W - 1 - u.x,
      y: CROWN_H - 1 - u.y,
    })),
  ],
);

const paleForks = assemble(
  "pale",
  "Pale Forks",
  "Three banners. Ghost towns crowd the north corners, and ruins fill the center.",
  [
    "^..*.^....^....^.*..^",
    "^n=.n...*.*.*...n.=n^",
    "*==n.^.*E=I=G*.^.n==*",
    ".=5=*.^.=====.^.*=5=.",
    "*8*n*..*.C=C.*..*n*8*",
    "......^.*.=.*.^......",
    "*.*.n.*n*n=n*n*.n.*.*",
    "....*..*=====*..*....",
    "n.*.*^*n=nnn=n*^*.*.n",
    "......n.=*5*=.n......",
    "....n.===*.*===.n....",
    "*1**.*=...n...=*.**2*",
    "6===1==*..n..*==2===7",
    "*9=3==.........==4=0*",
    "^.*.*^.*.*n*.*.^*.*.^",
  ],
  [
    { kind: "skirmisher", player: 1, x: 2, y: 13 },
    { kind: "skirmisher", player: 1, x: 2, y: 12 },
    { kind: "lancer", player: 1, x: 4, y: 13 },
    { kind: "outrider", player: 1, x: 5, y: 13 },
    { kind: "mortar", player: 1, x: 6, y: 12 },
    { kind: "skirmisher", player: 2, x: 18, y: 13 },
    { kind: "skirmisher", player: 2, x: 18, y: 12 },
    { kind: "lancer", player: 2, x: 16, y: 13 },
    { kind: "outrider", player: 2, x: 15, y: 13 },
    { kind: "mortar", player: 2, x: 15, y: 12 },
    { kind: "skirmisher", player: 3, x: 9, y: 2 },
    { kind: "skirmisher", player: 3, x: 9, y: 3 },
    { kind: "lancer", player: 3, x: 11, y: 2 },
    { kind: "outrider", player: 3, x: 11, y: 3 },
    { kind: "mortar", player: 3, x: 10, y: 3 },
  ],
);

export const MAPS: BuiltMap[] = [splitRidge, orchard, causeway, crownMarch, paleForks];

export function getMap(id: string): BuiltMap {
  const map = MAPS.find((m) => m.id === id);
  if (!map) throw new Error(`unknown map ${id}`);
  return map;
}
