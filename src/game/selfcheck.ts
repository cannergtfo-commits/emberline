import { planCommand, type Command } from "./ai";
import { MOVE_COST, UNITS, isProperty, type MoveClass } from "./data";
import { MAPS } from "./maps";
import {
  allied,
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
  createMatch,
  endTurn,
  reachable,
  unitAt,
  unitById,
  type Unit,
  type World,
} from "./rules";

function fail(errors: string[], msg: string) {
  errors.push(msg);
}

function stay(u: Unit) {
  return { unitId: u.id, ox: u.x, oy: u.y, x: u.x, y: u.y, path: [{ x: u.x, y: u.y }] };
}

export function runSelfCheck(): string[] {
  const errors: string[] = [];
  const classes = Object.keys(MOVE_COST) as MoveClass[];
  for (const cls of classes) {
    if (MOVE_COST[cls].ridge < 99) fail(errors, `${cls} can enter mountains`);
    if (MOVE_COST[cls].woods >= 99) fail(errors, `${cls} cannot enter forests`);
  }
  if (MAPS.length !== 5) fail(errors, "map count");
  for (const map of MAPS) {
    const w = createMatch({ mapId: map.id, p1: "nord", p2: "vael", p3: "heart", p4: "maw", fog: false, mode: "hotseat" });
    if (w.commanders.length !== map.seats || w.homeKeep.length !== map.seats) fail(errors, `${map.id} seats`);
    if (w.funds[0] !== w.funds[0]) fail(errors, "funds nan");
    if (w.funds[0] < 1000) fail(errors, `${map.id} income too small ${w.funds[0]}`);
    if (w.units.length < 4) fail(errors, `${map.id} units`);
    let neutral = 0;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.owner[y][x] === 0 && isProperty(map.terrain[y][x])) neutral += 1;
      }
    }
    if (map.id === "crown" && neutral < 8) fail(errors, `crown ruins ${neutral}`);
    if (map.id === "pale" && neutral < 15) fail(errors, `pale ruins ${neutral}`);
    const seen = new Set<string>();
    for (const u of w.units) {
      const k = `${u.x},${u.y}`;
      if (seen.has(k)) fail(errors, `${map.id} stack ${k}`);
      seen.add(k);
      if (map.seats === 2 && u.player === 2) {
        const home = map.deploy.find((d) => d.player === 1 && d.kind === u.kind && map.width - 1 - d.x === u.x);
        if (!home) fail(errors, `${map.id} mirror unit ${u.kind}`);
      }
    }
  }

  const w = createMatch({ mapId: "ridge", p1: "heart", p2: "maw", fog: false, mode: "drill" });
  const sk = w.units.find((u) => u.player === 1 && u.kind === "skirmisher");
  const lancer = w.units.find((u) => u.player === 1 && u.kind === "lancer");
  if (!sk || !lancer) fail(errors, "missing starters");
  else {
    const far = reachable(w, sk);
    if (!far.length) fail(errors, "skirmisher cannot move");
    const sea = createMatch({ mapId: "causeway", p1: "nord", p2: "vael", fog: false, mode: "hotseat" });
    const tank = sea.units.find((u) => u.player === 1 && u.kind === "lancer");
    if (!tank) fail(errors, "no lancer");
    else if (reachable(sea, tank).some((p) => sea.terrain[p.y][p.x] === "sea" || sea.terrain[p.y][p.x] === "river")) {
      fail(errors, "lancer entered water");
    }
    const kite = sea.units.find((u) => u.player === 1 && u.kind === "kite");
    if (kite) {
      const parked = unitAt(sea, 6, 9);
      if (parked && parked.id !== kite.id) {
        parked.x = 0;
        parked.y = 0;
      }
      kite.x = 6;
      kite.y = 9;
      if (!reachable(sea, kite).some((p) => sea.terrain[p.y][p.x] === "sea" || sea.terrain[p.y][p.x] === "river")) {
        fail(errors, "kite should cross water");
      }
    }
  }

  const fight = createMatch({ mapId: "orchard", p1: "nord", p2: "vael", fog: false, mode: "hotseat" });
  const a = fight.units.find((u) => u.player === 1 && u.kind === "lancer");
  const b = fight.units.find((u) => u.player === 2 && u.kind === "lancer");
  if (a && b) {
    b.x = a.x + 1;
    b.y = a.y;
    const occ = unitAt(fight, b.x, b.y);
    if (occ && occ.id !== b.id) occ.x = 0;
    const hits = attacksFrom(fight, a, a.x, a.y, false);
    if (!hits.some((h) => h.unitId === b.id)) fail(errors, "adjacent lancer should have a shot");
    const after = commitAttack(fight, stay(a), b.id, () => 0);
    const foe = unitById(after, b.id);
    if (!foe || foe.hp >= 100) fail(errors, "attack did not hurt");
    const moved = attacksFrom(fight, a, a.x, a.y, true);
    if (!moved.length && UNITS.lancer) {
      /* direct units can fire after moving; empty means no targets at origin with moved flag still listed */
    }
    if (!attacksFrom(fight, a, a.x, a.y, true).length && hits.length) {
      fail(errors, "lancer lost in-place shot when marked moved but still adjacent");
    }
  }

  const mort = createMatch({ mapId: "ridge", p1: "maw", p2: "vael", fog: false, mode: "hotseat" });
  const mortar = mort.units.find((u) => u.kind === "mortar" && u.player === 1);
  const enemy = mort.units.find((u) => u.player === 2);
  if (mortar && enemy) {
    enemy.x = mortar.x + 1;
    enemy.y = mortar.y;
    if (attacksFrom(mort, mortar, mortar.x, mortar.y, false).some((h) => h.unitId === enemy.id)) {
      fail(errors, "mortar shot inside minimum range");
    }
    enemy.x = mortar.x + 2;
    enemy.y = mortar.y;
    if (!attacksFrom(mort, mortar, mortar.x, mortar.y, false).some((h) => h.unitId === enemy.id)) {
      fail(errors, "mortar should reach range 2");
    }
    if (attacksFrom(mort, mortar, mortar.x, mortar.y, true).some((h) => h.unitId === enemy.id)) {
      fail(errors, "mortar fired after moving");
    }
    mort.powerActive[0] = true;
    mort.commanders[0] = "maw";
    if (!attacksFrom(mort, mortar, mortar.x, mortar.y, true).some((h) => h.unitId === enemy.id)) {
      fail(errors, "glass rain should let mortar fire after moving");
    }
  }

  const cap = createMatch({ mapId: "ridge", p1: "heart", p2: "nord", fog: true, mode: "hotseat" });
  const foot = cap.units.find((u) => u.player === 1 && u.kind === "skirmisher");
  const keep = cap.homeKeep[1];
  if (foot) {
    const blocker = unitAt(cap, keep.x, keep.y);
    if (blocker) {
      blocker.x = 0;
      blocker.y = 0;
    }
    foot.x = keep.x;
    foot.y = keep.y;
    foot.done = false;
    let n = commitCapture(cap, stay(foot));
    if (n.owner[keep.y][keep.x] === 1) fail(errors, "keep fell in one seize");
    const still = unitById(n, foot.id);
    if (!still) fail(errors, "captor vanished");
    else {
      still.done = false;
      n = commitCapture(n, stay(still));
      if (!n.over || n.winner !== 1) fail(errors, "second seize should take the keep");
    }
    const hider = cap.units.find((u) => u.player === 2 && u.kind === "skirmisher");
    if (hider) {
      hider.x = 0;
      hider.y = 10;
      cap.terrain[10][0] = "woods";
      const spotter = cap.units.find((u) => u.player === 1 && u.kind === "outrider");
      if (spotter) {
        spotter.x = 0;
        spotter.y = 8;
        if (canSeeUnit(cap, 1, hider)) fail(errors, "thicket infantry visible from two tiles");
        spotter.y = 9;
        if (!canSeeUnit(cap, 1, hider)) fail(errors, "adjacent spotter should reveal thicket");
      }
    }
  }

  const prod = createMatch({ mapId: "ridge", p1: "nord", p2: "vael", fog: false, mode: "hotseat" });
  let fx = -1;
  let fy = -1;
  for (let y = 0; y < prod.height && fy < 0; y++) {
    for (let x = 0; x < prod.width; x++) {
      if (prod.terrain[y][x] === "factory" && prod.owner[y][x] === 1 && !unitAt(prod, x, y)) {
        fx = x;
        fy = y;
      }
    }
  }
  if (fy < 0) fail(errors, "no empty works");
  else {
    const before = prod.funds[0];
    const built = commitBuild(prod, fx, fy, "skirmisher");
    if (built.funds[0] !== before - 1000) fail(errors, "build cost");
    if (!built.units.some((u) => u.kind === "skirmisher" && u.x === fx && !u.done)) fail(errors, "new unit");
  }

  const pow = createMatch({ mapId: "ridge", p1: "nord", p2: "vael", fog: false, mode: "hotseat" });
  pow.powerMeter[0] = 999999;
  const lit = commitPower(pow);
  if (!lit.powerActive[0] || lit.powerMeter[0] !== 0) fail(errors, "power");

  const day = endTurn(endTurn(createMatch({ mapId: "ridge", p1: "nord", p2: "vael", fog: false, mode: "hotseat" })));
  if (day.day !== 2 || day.turn !== 1) fail(errors, `day cycle ${day.day} turn ${day.turn}`);

  const haul = createMatch({ mapId: "orchard", p1: "nord", p2: "vael", fog: false, mode: "hotseat" });
  const infantry = haul.units.find((u) => u.player === 1 && u.kind === "skirmisher");
  if (infantry) {
    const carrier: Unit = {
      id: "haul1",
      kind: "hauler",
      player: 1,
      x: infantry.x + 1,
      y: infantry.y,
      hp: 100,
      ammo: 0,
      fuel: 70,
      moved: false,
      done: false,
      loaded: false,
      cargo: null,
    };
    const block = unitAt(haul, carrier.x, carrier.y);
    if (block) {
      block.x = Math.min(haul.width - 1, block.x + 2);
    }
    haul.units.push(carrier);
    const loaded = commitLoad(haul, {
      unitId: infantry.id,
      ox: infantry.x,
      oy: infantry.y,
      x: carrier.x,
      y: carrier.y,
      path: [
        { x: infantry.x, y: infantry.y },
        { x: carrier.x, y: carrier.y },
      ],
    });
    const rider = unitById(loaded, infantry.id);
    if (!rider?.loaded || unitById(loaded, "haul1")?.cargo !== infantry.id) fail(errors, "load failed");
  }

  const wiped = createMatch({ mapId: "ridge", p1: "nord", p2: "vael", fog: false, mode: "hotseat" });
  wiped.units = wiped.units.filter((u) => u.player === 1);
  wiped.funds[1] = 0;
  for (let y = 0; y < wiped.height; y++) {
    for (let x = 0; x < wiped.width; x++) if (wiped.owner[y][x] === 2) wiped.owner[y][x] = 1;
  }
  const ended = endTurn(wiped);
  if (!ended.over || ended.winner !== 1) fail(errors, "elimination");

  let march = createMatch({ mapId: "crown", p1: "nord", p2: "vael", p3: "heart", p4: "maw", fog: false, mode: "hotseat" });
  for (let i = 0; i < 4; i++) march = endTurn(march);
  if (march.day !== 2 || march.turn !== 1 || march.over) fail(errors, `crown day ${march.day} turn ${march.turn}`);

  const allies = createMatch({ mapId: "crown", p1: "nord", p2: "vael", p3: "heart", p4: "maw", fog: true, mode: "alliance" });
  const allyFoot = allies.units.find((u) => u.player === 1 && u.kind === "skirmisher");
  const friend = allies.units.find((u) => u.player === 3 && u.kind === "lancer");
  if (!allyFoot || !friend) fail(errors, "alliance starters");
  else {
    if (!allied(allies, 1, 3) || allied(allies, 1, 2)) fail(errors, "alliance pairs");
    if (!canSeeUnit(allies, 1, friend)) fail(errors, "allies should share sight");
    const keep3 = allies.homeKeep[2];
    const blocking = unitAt(allies, keep3.x, keep3.y);
    if (blocking && blocking.id !== allyFoot.id) {
      blocking.x = 0;
      blocking.y = 0;
    }
    allyFoot.x = keep3.x;
    allyFoot.y = keep3.y;
    const before = allies.owner[keep3.y][keep3.x];
    const tried = commitCapture(allies, stay(allyFoot));
    if (tried.owner[keep3.y][keep3.x] !== before || tried.over) fail(errors, "alliance captured an ally keep");
    friend.x = allyFoot.x + 1;
    friend.y = allyFoot.y;
    if (attacksFrom(allies, allyFoot, allyFoot.x, allyFoot.y, false).some((h) => h.unitId === friend.id)) {
      fail(errors, "alliance shot an ally");
    }
  }

  const forks = createMatch({ mapId: "pale", p1: "nord", p2: "vael", p3: "heart", fog: false, mode: "hotseat" });
  if (forks.commanders.length !== 3) fail(errors, "pale seats");
  const boot = forks.units.find((u) => u.player === 1 && u.kind === "skirmisher");
  if (boot) {
    const keep2 = forks.homeKeep[1];
    let city: { x: number; y: number } | null = null;
    for (let y = 0; y < forks.height && !city; y++) {
      for (let x = 0; x < forks.width; x++) {
        if (forks.owner[y][x] === 2 && forks.terrain[y][x] === "city") {
          city = { x, y };
          break;
        }
      }
    }
    const blocker = unitAt(forks, keep2.x, keep2.y);
    if (blocker) {
      blocker.x = 0;
      blocker.y = 0;
    }
    boot.x = keep2.x;
    boot.y = keep2.y;
    let seized = commitCapture(forks, stay(boot));
    const still = unitById(seized, boot.id);
    if (!still) fail(errors, "pale captor vanished");
    else {
      still.done = false;
      seized.turn = 1;
      seized = commitCapture(seized, stay(still));
      if (seized.over || !seized.eliminated[1]) fail(errors, "pale should continue after one keep");
      if (seized.units.some((u) => u.player === 2)) fail(errors, "eliminated units remain");
      if (city && seized.owner[city.y][city.x] !== 0) fail(errors, "fallen holdings should be abandoned");
      if (seized.owner[keep2.y][keep2.x] !== 1) fail(errors, "keep should stay with the captor");
    }
  }

  void commitWait;

  const played = applyAiTurn(createMatch({ mapId: "orchard", p1: "nord", p2: "maw", fog: true, mode: "drill" }));
  if (played.steps > 30) fail(errors, `drill ran too long ${played.steps}`);
  if (!played.world.over && played.world.turn !== 1) fail(errors, "drill did not return the day");
  if (played.stuck) fail(errors, "drill repeated an illegal order");

  return errors;
}

function applyCommand(w: World, cmd: Command): World {
  if (cmd.type === "power") return commitPower(w);
  if (cmd.type === "wait") return commitWait(w, cmd.order);
  if (cmd.type === "attack") return commitAttack(w, cmd.order, cmd.targetId, () => 0);
  if (cmd.type === "capture") return commitCapture(w, cmd.order);
  if (cmd.type === "load") return commitLoad(w, cmd.order);
  if (cmd.type === "drop") return commitDrop(w, cmd.order, cmd.dest);
  if (cmd.type === "supply") return commitSupply(w, cmd.order);
  if (cmd.type === "build") return commitBuild(w, cmd.x, cmd.y, cmd.kind);
  return endTurn(w);
}

function applyAiTurn(start: World): { world: World; steps: number; stuck: boolean } {
  let world = endTurn(start);
  let steps = 0;
  let stuck = false;
  while (!world.over && world.turn === 2 && steps < 40) {
    const cmd = planCommand(world);
    steps += 1;
    if (cmd.type === "end") {
      world = endTurn(world);
      break;
    }
    const next = applyCommand(world, cmd);
    if (next === world) {
      stuck = true;
      break;
    }
    world = next;
  }
  return { world, steps, stuck };
}

const errors = runSelfCheck();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("emberline rules ok");
