import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Volume2, VolumeX } from "lucide-react";
import {
  COMMANDERS,
  COMMANDER_IDS,
  COVER,
  SEAT_NAME,
  TERRAIN_NAME,
  UNIT_KINDS,
  UNITS,
  captainCost,
  captainMods,
  unitTitle,
  xpToNext,
  type CommanderId,
  type PlayerId,
  type UnitKind,
} from "@/game/data";
import { MAPS, type BuiltMap } from "@/game/maps";
import {
  allied,
  canRecall,
  commanderOf,
  createMatch,
  getHints,
  incomeOf,
  moveStat,
  propertyCount,
  unitAt,
  unitById,
  type Hints,
  type Unit,
  type World,
} from "@/game/rules";
import { useGame } from "@/game/store";
import { syncMusic, unlockAudio } from "@/game/audio";
import { CO_SRC, unitStill, useArt } from "./art";
import { MapView } from "./MapView";
import { TILE, paint } from "./paint";
import { Btn, Icon, cn } from "./ui";

function coins(n: number) {
  return n.toLocaleString("en-US");
}

function seatText(p: PlayerId): string {
  if (p === 1) return "text-ember";
  if (p === 2) return "text-gale";
  if (p === 3) return "text-flint";
  return "text-tide";
}

function seatBg(p: PlayerId): string {
  if (p === 1) return "bg-ember";
  if (p === 2) return "bg-gale";
  if (p === 3) return "bg-flint";
  return "bg-tide";
}

function partnerOf(p: PlayerId): PlayerId {
  if (p === 1) return 3;
  if (p === 3) return 1;
  if (p === 2) return 4;
  return 2;
}

function seatLine(world: World): string {
  const name = SEAT_NAME[world.turn];
  if (world.mode !== "alliance") return `${name} · Day ${world.day}`;
  return `${name} with ${SEAT_NAME[partnerOf(world.turn)]} · Day ${world.day}`;
}

function victoryTitle(world: World): string {
  if (!world.winner) return "A held line";
  if (world.mode === "alliance") {
    return world.winner === 1 || world.winner === 3 ? "Ember and Flint win" : "Gale and Tide win";
  }
  return `${SEAT_NAME[world.winner]} wins`;
}

function mapAllowed(mode: "hotseat" | "drill" | "alliance", seats: BuiltMap["seats"]): boolean {
  if (mode === "drill") return seats === 2;
  if (mode === "alliance") return seats === 4;
  return true;
}

export function GameApp() {
  const phase = useGame((s) => s.phase);
  const announce = useGame((s) => s.announce);
  const boot = useGame((s) => s.boot);
  const sound = useGame((s) => s.sound);
  const mapId = useGame((s) => s.world?.mapId);
  const [manual, setManual] = useState(false);

  useEffect(() => {
    boot();
  }, [boot]);

  useEffect(() => {
    syncMusic(phase, mapId, sound);
  }, [phase, mapId, sound]);

  return (
    <div
      className={cn(
        "war-room text-fg",
        phase === "play" ? "h-dvh overflow-hidden" : "min-h-dvh",
      )}
      onPointerDown={() => unlockAudio()}
    >
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      {phase === "title" ? <Title onManual={() => setManual(true)} /> : null}
      {phase === "setup" ? <Setup onManual={() => setManual(true)} /> : null}
      {phase === "pass" ? <Pass /> : null}
      {phase === "play" ? <Battle onManual={() => setManual(true)} /> : null}
      {phase === "gameover" ? <Over /> : null}
      {manual ? <Manual onClose={() => setManual(false)} /> : null}
    </div>
  );
}

function Title({ onManual }: { onManual: () => void }) {
  const hasSave = useGame((s) => s.hasSave);
  const setPhase = useGame((s) => s.setPhase);
  const patchSetup = useGame((s) => s.patchSetup);
  const resume = useGame((s) => s.resume);
  return (
    <main className="menu-hero menu-enter mx-auto flex min-h-dvh w-full min-w-0 max-w-5xl flex-col items-center gap-6 px-[max(1.25rem,env(safe-area-inset-left))] py-6 pt-[max(1.25rem,env(safe-area-inset-top))] pr-[max(1.25rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:grid lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-10 lg:px-8">
      <div className="w-full max-w-md lg:max-w-none">
        <img src="/emberline-icon.png" alt="" className="size-16 rounded-2xl shadow-lg" />
        <p className="menu-kicker mt-4">Fun hot-seat multiplayer</p>
        <h1 className="ui-title menu-title mt-2 text-5xl md:text-6xl">Emberline</h1>
        <p className="menu-lead mt-3 max-w-md text-base leading-relaxed">
          Pass one phone or tablet around the table. Two to four players, five banners, no accounts and no waiting on anyone online.
        </p>
        <div className="mt-6 grid w-full gap-2.5">
          <Btn
            className="min-h-14 w-full text-base"
            onClick={() => {
              patchSetup({ mode: "hotseat" });
              setPhase("setup");
            }}
          >
            Pass and play
          </Btn>
          <Btn
            tone="gale"
            className="min-h-14 w-full text-base"
            onClick={() => {
              patchSetup({ mode: "alliance", mapId: "crown" });
              setPhase("setup");
            }}
          >
            Two versus two
          </Btn>
          <Btn
            tone="line"
            className="min-h-14 w-full text-base"
            onClick={() => {
              patchSetup({ mode: "drill", mapId: "ridge" });
              setPhase("setup");
            }}
          >
            Practice
          </Btn>
          {hasSave ? (
            <Btn tone="ghost" onClick={() => resume()}>
              Continue
            </Btn>
          ) : null}
        </div>
        <button type="button" className="menu-lead mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold" onClick={onManual}>
          <BookOpen className="size-4" aria-hidden />
          Rules
        </button>
        <a
          className="menu-lead mt-1 inline-flex min-h-11 items-center text-sm font-semibold underline decoration-white/30 underline-offset-4"
          href="https://github.com/cannergtfo-commits/emberline/releases/latest"
        >
          Download the Android app
        </a>
      </div>
      <div className="grid w-full grid-cols-3 gap-2 lg:grid-cols-2 lg:gap-3">
        {COMMANDER_IDS.map((id) => (
          <Portrait key={id} id={id} />
        ))}
      </div>
    </main>
  );
}

function Portrait({ id, large = false }: { id: CommanderId; large?: boolean }) {
  const c = COMMANDERS[id];
  return (
    <figure className={cn("war-frame", large && "mx-auto max-w-xs")}>
      <img src={CO_SRC[id]} alt={c.name} className={cn("w-full object-cover", large ? "h-52 max-h-[36dvh] sm:h-72 lg:h-80" : "h-20 sm:h-28 lg:h-40")} />
      <figcaption className="px-3 py-2">
        <p className="text-base font-semibold leading-tight">{c.name}</p>
        <p className="text-xs text-muted">{c.pact}</p>
      </figcaption>
    </figure>
  );
}

function Setup({ onManual }: { onManual: () => void }) {
  const setup = useGame((s) => s.setup);
  const patchSetup = useGame((s) => s.patchSetup);
  const begin = useGame((s) => s.begin);
  const setPhase = useGame((s) => s.setPhase);
  const maps = MAPS.filter((map) => mapAllowed(setup.mode, map.seats));
  const current = maps.find((map) => map.id === setup.mapId) ?? maps[0];
  useEffect(() => {
    if (!current || current.id === setup.mapId) return;
    patchSetup({ mapId: current.id });
  }, [current, patchSetup, setup.mapId]);
  const seats = current?.seats ?? 2;
  const picks = (
    [
      ["p1", setup.p1, "Ember"],
      ["p2", setup.p2, "Gale"],
      ["p3", setup.p3, "Flint"],
      ["p4", setup.p4, "Tide"],
    ] as const
  ).slice(0, seats);
  const kicker =
    setup.mode === "drill" ? "Practice" : setup.mode === "alliance" ? "Two versus two" : "Pass and play";
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-6 px-[max(1rem,env(safe-area-inset-left))] pt-[max(1.25rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pb-32">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-ember uppercase">{kicker}</p>
          <h1 className="ui-title text-4xl">Setup</h1>
        </div>
        <Btn tone="ghost" onClick={() => setPhase("title")}>
          Back
        </Btn>
      </div>
      <div className="h-scroll snap-x snap-mandatory gap-3 pb-1 lg:grid lg:grid-cols-2 lg:overflow-visible xl:grid-cols-3">
        {maps.map((map) => (
          <button
            key={map.id}
            type="button"
            aria-pressed={setup.mapId === map.id}
            onClick={() => patchSetup({ mapId: map.id })}
            className={cn(
              "w-[78%] max-w-xs shrink-0 snap-center war-frame text-left lg:w-auto lg:max-w-none",
              setup.mapId === map.id && "is-on",
            )}
          >
            <Preview id={map.id} />
            <p className="mt-3 text-xl font-semibold tracking-tight">{map.name}</p>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">{map.seats} seats</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">{map.blurb}</p>
          </button>
        ))}
      </div>
      <div className={cn("grid min-w-0 gap-6", seats > 2 ? "lg:grid-cols-2" : "md:grid-cols-2")}>
        {picks.map(([key, value, seat], index) => (
          <CommanderPick
            key={key}
            label={
              setup.mode === "drill"
                ? index === 0
                  ? "Your banner"
                  : "Drill's banner"
                : setup.mode === "alliance"
                  ? `${seat} · with ${SEAT_NAME[partnerOf((index + 1) as PlayerId)]}`
                  : `${seat} banner`
            }
            tone={seatText((index + 1) as PlayerId)}
            value={value}
            onChange={(id) => patchSetup({ [key]: id })}
          />
        ))}
      </div>
      {setup.mode === "alliance" ? (
        <p className="text-sm text-fg-soft">
          Ember fights with Flint. Gale fights with Tide. You cannot strike or seize an ally, and you share what you see. Funds stay with each seat.
        </p>
      ) : null}
      <div className="flex flex-col gap-4 pb-2">
        <button
          type="button"
          role="switch"
          aria-checked={setup.fog}
          onClick={() => patchSetup({ fog: !setup.fog })}
          className="flex min-h-12 items-center gap-3 text-left text-sm"
        >
          <span className={cn("h-7 w-12 shrink-0 rounded-full p-1", setup.fog ? "bg-gale" : "bg-line")}>
            <span className={cn("block size-5 rounded-full bg-panel", setup.fog && "translate-x-5")} />
          </span>
          Fog of war — forests and towns hide units until you stand beside them
        </button>
        <p className="text-sm text-muted">
          Seat colors stay Ember, Gale, Flint, and Tide, even if two players choose the same banner.
        </p>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-parchment/95 px-[max(1rem,env(safe-area-inset-left))] py-3 pr-[max(1rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center gap-2">
          <Btn tone="ghost" onClick={onManual}>
            Rules
          </Btn>
          <Btn className="min-h-14 flex-1 text-base" onClick={() => begin()}>
            Start match
          </Btn>
        </div>
      </div>
    </main>
  );
}

function CommanderPick({
  label,
  tone,
  value,
  onChange,
}: {
  label: string;
  tone: string;
  value: CommanderId;
  onChange: (id: CommanderId) => void;
}) {
  return (
    <section>
      <h2 className={cn("mb-3 text-lg font-semibold tracking-tight", tone)}>{label}</h2>
      <div className="h-scroll gap-2 pb-1 lg:hidden">
        {COMMANDER_IDS.map((id) => {
          const c = COMMANDERS[id];
          const on = value === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(id)}
              className={cn("war-frame w-28 shrink-0 text-left", on && "is-on")}
            >
              <img src={CO_SRC[id]} alt="" className="h-24 w-full rounded-lg object-cover" />
              <span className="mt-2 block text-sm font-semibold leading-tight">{c.name}</span>
              <span className="mt-0.5 block text-xs text-ember">{c.power}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-sm leading-snug text-muted lg:hidden">{COMMANDERS[value].blurb}</p>
      <div className="hidden gap-2 lg:grid">
        {COMMANDER_IDS.map((id) => {
          const c = COMMANDERS[id];
          const on = value === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(id)}
              className={cn("war-frame flex min-h-16 gap-3 text-left", on && "is-on")}
            >
              <img src={CO_SRC[id]} alt="" className="h-20 w-16 rounded-xl object-cover" />
              <span className="min-w-0">
                <span className="block text-xs font-semibold tracking-wide text-muted uppercase">{c.pact}</span>
                <span className="block text-lg font-semibold leading-tight">{c.name}</span>
                <span className="block text-sm font-semibold text-ember">{c.power}</span>
                <span className="mt-1 block text-sm leading-snug text-muted">{c.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Preview({ id }: { id: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const art = useArt();
  const world = useMemo(
    () => createMatch({ mapId: id, p1: "nord", p2: "vael", fog: false, mode: "hotseat" }),
    [id],
  );
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const viewW = 320;
    const viewH = 200;
    const dpr = 2;
    canvas.width = viewW * dpr;
    canvas.height = viewH * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const scale = Math.min(viewW / (world.width * TILE), viewH / (world.height * TILE)) * 0.92;
    const styles = getComputedStyle(document.documentElement);
    paint({
      ctx,
      world,
      cam: {
        scale,
        x: (viewW - world.width * TILE * scale) / 2,
        y: (viewH - world.height * TILE * scale) / 2,
      },
      art,
      hints: { moves: [], attacks: [], drops: [], canCapture: false, canSupply: false, board: null, canWait: false, canHeal: false },
      pending: null,
      selectedId: null,
      cursor: null,
      fx: [],
      now: 0,
      viewW,
      viewH,
      dpr,
      ember: styles.getPropertyValue("--color-ember").trim() || "#c4491d",
      gale: styles.getPropertyValue("--color-gale").trim() || "#1b6b66",
      flint: styles.getPropertyValue("--color-flint").trim() || "#a16207",
      tide: styles.getPropertyValue("--color-tide").trim() || "#2a4e8f",
      ink: styles.getPropertyValue("--color-ink").trim() || "#1c1712",
    });
  }, [art, world]);
  return <canvas ref={ref} className="h-40 w-full rounded-xl bg-parchment-deep" />;
}

function Pass() {
  const world = useGame((s) => s.world);
  const ready = useGame((s) => s.ready);
  if (!world) return null;
  const co = COMMANDERS[commanderOf(world, world.turn)];
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-5 px-[max(1.25rem,env(safe-area-inset-left))] py-8 pt-[max(1.5rem,env(safe-area-inset-top))] pr-[max(1.25rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">Next player</p>
      <Portrait id={co.id} large />
      <div>
        <h1 className="ui-title text-4xl">{co.name}</h1>
        <p className={cn("mt-1 font-semibold", seatText(world.turn))}>{seatLine(world)}</p>
        <p className="mt-3 text-fg-soft">
          Funds {coins(world.funds[world.turn - 1])}. Hand over the device, then tap Ready. The map stays hidden until you look.
        </p>
      </div>
      <Btn onClick={() => ready()} className="min-h-16 w-full max-w-sm text-lg">
        Ready
      </Btn>
    </main>
  );
}

function Battle({ onManual }: { onManual: () => void }) {
  const world = useGame((s) => s.world);
  const endArmed = useGame((s) => s.endArmed);
  const sound = useGame((s) => s.sound);
  const endDay = useGame((s) => s.endDay);
  const undo = useGame((s) => s.undo);
  const toggleSound = useGame((s) => s.toggleSound);
  const history = useGame((s) => s.history.length);
  const selectedId = useGame((s) => s.selectedId);
  const pending = useGame((s) => s.pending);
  const buildAt = useGame((s) => s.buildAt);
  const token = `${selectedId ?? ""}|${pending ? `${pending.unitId}@${pending.x},${pending.y}` : ""}|${buildAt ? `${buildAt.x},${buildAt.y}` : ""}`;
  const [track, setTrack] = useState(token);
  const [details, setDetails] = useState(false);
  if (track !== token) {
    setTrack(token);
    if (!selectedId && !pending) setDetails(false);
    if (buildAt) setDetails(false);
  }
  if (!world) return null;
  const co = COMMANDERS[commanderOf(world, world.turn)];
  const drilling = world.mode === "drill" && world.turn === 2;
  const orderProps = { onManual, canUndo: history > 0 && !drilling, onUndo: undo, onDetails: () => setDetails(true) };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="war-bar flex items-center gap-2 px-[max(0.5rem,env(safe-area-inset-left))] py-1.5 pt-[max(0.35rem,env(safe-area-inset-top))] pr-[max(0.5rem,env(safe-area-inset-right))] sm:gap-3 sm:py-2">
        <img src={CO_SRC[co.id]} alt="" className="size-10 shrink-0 rounded-xl object-cover sm:size-12" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold leading-none sm:text-lg">{drilling ? "Drill" : co.name}</p>
          <p className={cn("truncate text-xs sm:text-sm", seatText(world.turn))}>
            {co.pact} · {seatLine(world)}
          </p>
        </div>
        <p className="text-sm font-semibold tabular-nums sm:text-base">{coins(world.funds[world.turn - 1])}</p>
        <Btn tone="line" className="square" onClick={toggleSound} aria-label={sound ? "Mute" : "Sound on"}>
          {sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
        </Btn>
        <Btn tone={endArmed ? "solid" : "line"} className="compact px-3" onClick={() => endDay()} disabled={drilling}>
          <span className="sm:hidden">{endArmed ? "Sure?" : "End"}</span>
          <span className="hidden sm:inline">{endArmed ? "Confirm end" : "End day"}</span>
        </Btn>
      </header>
      <div className="flex min-h-0 flex-1 lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <MapView dock={details ? "open" : "peek"} />
          </div>
          <div className="touch-dock shrink-0 lg:hidden">
            <Orders {...orderProps} mode="rail" />
          </div>
        </div>
        <aside className="orders-sheet war-sheet hidden min-h-0 w-96 shrink-0 overflow-y-auto border-l lg:block">
          <Orders {...orderProps} />
        </aside>
      </div>
      {details ? (
        <div className="fixed inset-0 z-30 flex items-end bg-ink/55 lg:hidden" onClick={() => setDetails(false)}>
          <div
            role="dialog"
            aria-label="Orders"
            data-dock="sheet"
            className="orders-sheet war-sheet max-h-[min(78dvh,40rem)] w-full overflow-y-auto rounded-t-2xl border-t"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between bg-parchment/95 px-3 py-1">
              <span className="text-xs font-semibold tracking-wide text-muted uppercase">Orders</span>
              <Btn tone="ghost" onClick={() => setDetails(false)}>
                Close
              </Btn>
            </div>
            <Orders {...orderProps} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OrderRail({
  world,
  co,
  pct,
  selected,
  hints,
  shops,
  building,
  canUndo,
  onUndo,
  onDetails,
}: {
  world: World;
  co: (typeof COMMANDERS)[CommanderId];
  pct: number;
  selected: Unit | undefined;
  hints: Hints | null;
  shops: { x: number; y: number; kind: "factory" | "airport" }[];
  building: string | null;
  canUndo: boolean;
  onUndo: () => void;
  onDetails?: () => void;
}) {
  const callPower = useGame((s) => s.callPower);
  const doWait = useGame((s) => s.doWait);
  const doCapture = useGame((s) => s.doCapture);
  const doSupply = useGame((s) => s.doSupply);
  const doAttack = useGame((s) => s.doAttack);
  const doHeal = useGame((s) => s.doHeal);
  const doRecall = useGame((s) => s.doRecall);
  const doDrop = useGame((s) => s.doDrop);
  const doBuild = useGame((s) => s.doBuild);
  const openBuild = useGame((s) => s.openBuild);
  const cancelPending = useGame((s) => s.cancelPending);
  const pending = useGame((s) => s.pending);
  const openDetails = onDetails ?? (() => {});

  if (building === "factory" || building === "airport") {
    const facility = building === "airport" ? "airport" : "factory";
    const faction = commanderOf(world, world.turn);
    const funds = world.funds[world.turn - 1];
    return (
      <div className="touch-rail">
        <Btn tone="ghost" className="shrink-0" onClick={() => cancelPending()}>
          Close
        </Btn>
        {UNIT_KINDS.filter((k) => UNITS[k].facility === facility).map((kind) => {
          const def = UNITS[kind];
          const still = unitStill(faction, kind);
          return (
            <button key={kind} type="button" className="touch-chip" disabled={funds < def.cost} onClick={() => doBuild(kind)}>
              {still ? <img src={still} alt="" className="size-10 object-contain" /> : null}
              <span className="max-w-24 truncate">{unitTitle(faction, kind)}</span>
              <span className="font-medium text-muted tabular-nums">{coins(def.cost)}</span>
            </button>
          );
        })}
      </div>
    );
  }

  const mine = selected && selected.player === world.turn && !selected.done;
  let sub = "or a works to build";
  if (selected) {
    const hp = `HP ${Math.ceil(selected.hp / 10)}/10`;
    if (selected.player !== world.turn) {
      sub = `${hp} · ${allied(world, selected.player, world.turn) ? "ally" : "enemy"}`;
    } else if (selected.done) sub = `${hp} · already acted`;
    else if (pending) sub = `${hp} · choose an order`;
    else sub = `${hp} · tap a blue tile`;
  }

  return (
    <div className="touch-rail">
      <div className="touch-rail-status">
        <span className="truncate font-semibold">
          {selected ? unitTitle(world.commanders[selected.player - 1], selected.kind) : "Tap a unit"}
        </span>
        <span className="truncate text-muted">{sub}</span>
      </div>
      {pct >= 100 && !world.powerActive[world.turn - 1] ? (
        <Btn className="shrink-0" onClick={() => callPower()}>
          {co.power}
        </Btn>
      ) : null}
      {pending && hints?.canWait ? (
        <Btn className="shrink-0" onClick={() => doWait()}>
          <Icon name="wait" /> Wait
        </Btn>
      ) : null}
      {pending && hints?.board ? (
        <Btn className="shrink-0" onClick={() => doWait()}>
          <Icon name="drop" /> Board
        </Btn>
      ) : null}
      {pending && hints?.canCapture ? (
        <Btn tone="gale" className="shrink-0" onClick={() => doCapture()}>
          <Icon name="seize" /> Seize
        </Btn>
      ) : null}
      {pending && hints?.canSupply ? (
        <Btn tone="line" className="shrink-0" onClick={() => doSupply()}>
          <Icon name="supply" /> Supply
        </Btn>
      ) : null}
      {pending && hints?.canHeal ? (
        <Btn tone="gale" className="shrink-0" onClick={() => doHeal()}>
          Heal
        </Btn>
      ) : null}
      {!pending && canRecall(world) ? (
        <Btn className="shrink-0" onClick={() => doRecall()}>
          Recall {coins(captainCost(world.captainLevel[world.turn - 1] ?? 1))}
        </Btn>
      ) : null}
      {pending
        ? hints?.attacks.map((a) => (
            <Btn key={a.unitId} tone="line" className="shrink-0" onClick={() => doAttack(a.unitId)}>
              <Icon name="strike" /> Strike {a.dmgMin}–{a.dmgMax}%
            </Btn>
          ))
        : null}
      {!pending && mine && hints
        ? hints.attacks.map((a) => (
            <Btn key={a.unitId} tone="line" className="shrink-0" onClick={() => doAttack(a.unitId)}>
              <Icon name="strike" /> Here {a.dmgMin}–{a.dmgMax}%
            </Btn>
          ))
        : null}
      {pending
        ? hints?.drops.map((d) => (
            <Btn key={`${d.x},${d.y}`} tone="line" className="shrink-0" onClick={() => doDrop(d)}>
              <Icon name="drop" /> Drop {d.x + 1},{d.y + 1}
            </Btn>
          ))
        : null}
      {pending ? (
        <Btn tone="ghost" className="shrink-0" onClick={() => cancelPending()}>
          Cancel
        </Btn>
      ) : null}
      {!selected && shops.length === 1 ? (
        <Btn tone="line" className="shrink-0" onClick={() => openBuild(shops[0])}>
          <Icon name={shops[0].kind === "airport" ? "air" : "works"} />
          {shops[0].kind === "airport" ? "Airfield" : "Works"}
        </Btn>
      ) : null}
      {!selected && shops.length > 1 ? (
        <Btn tone="line" className="shrink-0" onClick={openDetails}>
          <Icon name="works" /> Build
        </Btn>
      ) : null}
      <Btn tone="line" className="shrink-0" onClick={onUndo} disabled={!canUndo}>
        <Icon name="undo" /> Undo
      </Btn>
      <Btn tone="line" className="touch-rail-pin shrink-0" onClick={openDetails}>
        Details
      </Btn>
    </div>
  );
}

function Orders({
  onManual,
  canUndo,
  onUndo,
  mode = "panel",
  onDetails,
}: {
  onManual: () => void;
  canUndo: boolean;
  onUndo: () => void;
  mode?: "panel" | "rail";
  onDetails?: () => void;
}) {
  const world = useGame((s) => s.world);
  const selectedId = useGame((s) => s.selectedId);
  const pending = useGame((s) => s.pending);
  const buildAt = useGame((s) => s.buildAt);
  const cursor = useGame((s) => s.cursor);
  const callPower = useGame((s) => s.callPower);
  const doWait = useGame((s) => s.doWait);
  const doCapture = useGame((s) => s.doCapture);
  const doSupply = useGame((s) => s.doSupply);
  const doAttack = useGame((s) => s.doAttack);
  const doHeal = useGame((s) => s.doHeal);
  const doRecall = useGame((s) => s.doRecall);
  const doDrop = useGame((s) => s.doDrop);
  const doBuild = useGame((s) => s.doBuild);
  const openBuild = useGame((s) => s.openBuild);
  const cancelPending = useGame((s) => s.cancelPending);
  const resign = useGame((s) => s.resign);
  if (!world) return null;
  const co = COMMANDERS[commanderOf(world, world.turn)];
  const pct = Math.min(100, Math.round((world.powerMeter[world.turn - 1] / co.threshold) * 100));
  const selected = selectedId ? unitById(world, selectedId) : undefined;
  const hints = selected ? getHints(world, selected.id, pending) : null;
  const t = world.terrain[cursor.y]?.[cursor.x];
  const occ = t ? unitAt(world, cursor.x, cursor.y) : undefined;
  const shops: { x: number; y: number; kind: "factory" | "airport" }[] = [];
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const tile = world.terrain[y][x];
      if (world.owner[y][x] === world.turn && (tile === "factory" || tile === "airport") && !unitAt(world, x, y)) {
        shops.push({ x, y, kind: tile });
      }
    }
  }
  const building = buildAt ? world.terrain[buildAt.y][buildAt.x] : null;
  if (mode === "rail") return <OrderRail world={world} co={co} pct={pct} selected={selected} hints={hints} shops={shops} building={building} canUndo={canUndo} onUndo={onUndo} onDetails={onDetails} />;
  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-semibold">{co.power}</span>
          <span className="tabular-nums text-muted">{pct}%</span>
        </div>
        <div className="power-track">
          <div className={cn("power-fill", seatBg(world.turn))} style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-sm text-muted">{co.blurb}</p>
        {pct >= 100 && !world.powerActive[world.turn - 1] ? (
          <Btn className="mt-3 w-full" onClick={() => callPower()}>
            Call {co.power}
          </Btn>
        ) : null}
        {world.powerActive[world.turn - 1] ? (
          <p className="mt-2 text-sm font-semibold text-ember">Power is up until you end the day.</p>
        ) : null}
      </div>

      {t ? (
        <p className="text-sm text-fg-soft">
          {TERRAIN_NAME[t]}
          {COVER[t] ? ` · cover ${COVER[t]}` : ""}
          {occ ? ` · ${unitTitle(world.commanders[occ.player - 1], occ.kind)}` : ""}
          {" · "}
          income {coins(incomeOf(world, world.turn))} from {propertyCount(world, world.turn)} holdings
        </p>
      ) : null}

      {selected && hints ? (
        <section className="war-panel">
          <h2 className="ui-title text-2xl">{unitTitle(world.commanders[selected.player - 1], selected.kind)}</h2>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">{UNITS[selected.kind].name}</p>
          <p className="text-sm text-muted">{UNITS[selected.kind].blurb}</p>
          <p className="mt-2 text-sm tabular-nums">
            HP {Math.ceil(selected.hp / 10)}/10 · Move {moveStat(world, selected)}
            {UNITS[selected.kind].ammo < 0 ? " · Ammo ∞" : ` · Ammo ${selected.ammo}`}
            {UNITS[selected.kind].daily > 0 ? ` · Fuel ${selected.fuel}` : ""}
          </p>
          {selected.kind === "captain" ? (
            <p className="text-sm text-fg-soft">
              Rank {selected.level}/6
              {selected.level < 6 ? ` · ${selected.xp}/${xpToNext(selected.level)} xp` : " · rank capped"}
              {` · mend ${Math.ceil(captainMods(selected.level).heal / 10)}`}
              {` · strike ${Math.round(captainMods(selected.level).atk * 100)}%`}
            </p>
          ) : null}
          {selected.player !== world.turn ? (
            <p className="mt-2 text-sm">
              {allied(world, selected.player, world.turn)
                ? "Allied unit. You cannot strike or seize them."
                : "Enemy unit. You can only look."}
            </p>
          ) : null}
          {selected.done ? <p className="mt-2 text-sm">Already acted today.</p> : null}
          {!pending && selected.player === world.turn && !selected.done ? (
            <p className="mt-2 text-sm text-fg-soft">
              Blue tiles are moves. Red tiles can be struck. Tap this unit again to act in place.
            </p>
          ) : null}
          {pending ? (
            <div className="mt-3 flex flex-col gap-2">
              {hints.canWait ? (
                <Btn className="min-h-14 w-full text-base" onClick={() => doWait()}>
                  <Icon name="wait" /> Wait
                </Btn>
              ) : null}
              {hints.board ? (
                <Btn className="min-h-14 w-full text-base" align="start" onClick={() => doWait()}>
                  <Icon name="drop" /> Board {hints.board.name}
                </Btn>
              ) : null}
              {hints.canCapture ? (
                <Btn tone="gale" className="min-h-14 w-full text-base" onClick={() => doCapture()}>
                  <Icon name="seize" /> Seize
                </Btn>
              ) : null}
              {hints.canSupply ? (
                <Btn tone="line" className="min-h-14 w-full text-base" align="start" onClick={() => doSupply()}>
                  <Icon name="supply" /> Resupply neighbors
                </Btn>
              ) : null}
              {hints.canHeal ? (
                <Btn tone="gale" className="min-h-14 w-full text-base" onClick={() => doHeal()}>
                  Heal the line
                </Btn>
              ) : null}
              {hints.attacks.map((a) => (
                <Btn key={a.unitId} tone="line" className="min-h-14 w-full text-base" align="start" onClick={() => doAttack(a.unitId)}>
                  <Icon name="strike" />
                  Strike {strikeName(world, a.unitId, a.kind)} · {a.dmgMin}–{a.dmgMax}%
                  {a.counterMax ? ` · back ${a.counterMin}–${a.counterMax}%` : ""}
                </Btn>
              ))}
              {hints.drops.map((d) => (
                <Btn key={`${d.x},${d.y}`} tone="line" className="min-h-14 w-full text-base" align="start" onClick={() => doDrop(d)}>
                  <Icon name="drop" /> Drop at {d.x + 1},{d.y + 1}
                </Btn>
              ))}
              <Btn tone="ghost" className="min-h-14 w-full text-base" onClick={() => cancelPending()}>
                Cancel
              </Btn>
            </div>
          ) : null}
          {!pending && hints.attacks.length > 0 && selected.player === world.turn && !selected.done ? (
            <div className="mt-3 flex flex-col gap-2">
              {hints.attacks.map((a) => (
                <Btn key={a.unitId} tone="line" className="min-h-14 w-full text-base" align="start" onClick={() => doAttack(a.unitId)}>
                  <Icon name="strike" />
                  Strike in place · {strikeName(world, a.unitId, a.kind)} {a.dmgMin}–{a.dmgMax}%
                </Btn>
              ))}
            </div>
          ) : null}
        </section>
      ) : (
        <p className="text-sm text-fg-soft">Tap a unit, or a works to build. Drag to pan. Pinch to zoom.</p>
      )}

      {!pending && canRecall(world) ? (
        <Btn className="min-h-14 w-full text-base" onClick={() => doRecall()}>
          Recall captain · {coins(captainCost(world.captainLevel[world.turn - 1] ?? 1))}
        </Btn>
      ) : null}

      {buildAt && building ? (
        <section className="war-panel">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="ui-title text-2xl">{building === "airport" ? "Airfield" : "Works"}</h2>
            <Btn tone="ghost" onClick={() => cancelPending()}>
              Close
            </Btn>
          </div>
          <div className="flex flex-col gap-2">
            {UNIT_KINDS.filter((k) => UNITS[k].facility === (building === "airport" ? "airport" : "factory")).map(
              (kind) => (
                <BuildRow
                  key={kind}
                  kind={kind}
                  faction={commanderOf(world, world.turn)}
                  funds={world.funds[world.turn - 1]}
                  onBuild={() => doBuild(kind)}
                />
              ),
            )}
          </div>
        </section>
      ) : null}

      {shops.length ? (
        <div className="flex flex-wrap gap-2">
          {shops.map((s) => (
            <Btn key={`${s.x},${s.y}`} tone="line" onClick={() => openBuild(s)}>
              <Icon name={s.kind === "airport" ? "air" : "works"} />
              {s.kind === "airport" ? "Airfield" : "Works"}
            </Btn>
          ))}
        </div>
      ) : null}

      {world.log.length ? (
        <ul className="space-y-1 text-sm text-muted">
          {world.log.slice(-4).map((line, i) => (
            <li key={`${line}-${i}`}>{line}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Btn tone="line" onClick={onUndo} disabled={!canUndo}>
          <Icon name="undo" />
          Undo
        </Btn>
        <Btn tone="ghost" onClick={onManual}>
          Rules
        </Btn>
        <Btn tone="ghost" onClick={() => resign()}>
          Resign
        </Btn>
      </div>
    </div>
  );
}

function BuildRow({
  kind,
  faction,
  funds,
  onBuild,
}: {
  kind: UnitKind;
  faction: CommanderId;
  funds: number;
  onBuild: () => void;
}) {
  const def = UNITS[kind];
  const still = unitStill(faction, kind);
  const range = def.range ? (def.range.min === def.range.max ? "adjacent" : `${def.range.min}–${def.range.max}`) : "no gun";
  return (
    <Btn tone="line" align="start" className="min-h-14 w-full text-base" disabled={funds < def.cost} onClick={onBuild}>
      {still ? <img src={still} alt="" className="size-14 object-contain" /> : null}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span>{unitTitle(faction, kind)}</span>
          <span className="tabular-nums">{coins(def.cost)}</span>
        </span>
        <span className="mt-1 block text-sm font-medium text-muted">
          {def.name}. {def.blurb} Move {def.move} · {range}.
        </span>
      </span>
    </Btn>
  );
}

function strikeName(world: World, unitId: string, kind: UnitKind): string {
  const foe = unitById(world, unitId);
  if (!foe) return UNITS[kind].name;
  return unitTitle(world.commanders[foe.player - 1], kind);
}

function Over() {
  const world = useGame((s) => s.world);
  const rematch = useGame((s) => s.rematch);
  const setPhase = useGame((s) => s.setPhase);
  if (!world) return null;
  const team =
    world.mode === "alliance" && world.winner
      ? ((world.winner === 1 || world.winner === 3 ? [1, 3] : [2, 4]) as PlayerId[])
      : null;
  const co = world.winner ? COMMANDERS[commanderOf(world, world.winner)] : null;
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-5 px-[max(1.25rem,env(safe-area-inset-left))] py-8 pt-[max(1.5rem,env(safe-area-inset-top))] pr-[max(1.25rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
      <p className="text-xs font-semibold tracking-wide text-ember uppercase">Match over</p>
      {team ? (
        <div className="grid w-full grid-cols-2 gap-3">
          {team.map((p) => (
            <Portrait key={p} id={commanderOf(world, p)} />
          ))}
        </div>
      ) : co ? (
        <Portrait id={co.id} large />
      ) : null}
      <h1 className="ui-title text-4xl">{victoryTitle(world)}</h1>
      <p className="text-lg text-fg-soft">{world.winReason}</p>
      <p className="text-sm text-muted">
        Day {world.day}
        {world.losses.map((n, i) => ` · ${SEAT_NAME[(i + 1) as PlayerId]} ${n}`).join("")}
      </p>
      <div className="flex w-full max-w-sm flex-col gap-2 sm:flex-row sm:justify-center">
        <Btn className="min-h-14 flex-1" onClick={() => rematch()}>
          Rematch
        </Btn>
        <Btn tone="line" className="min-h-14 flex-1" onClick={() => setPhase("title")}>
          Menu
        </Btn>
      </div>
    </main>
  );
}

function Manual({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/50 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="manual-title">
      <div className="war-panel max-h-[86dvh] w-full max-w-lg overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <h2 id="manual-title" className="ui-title text-3xl">
            Rules
          </h2>
          <Btn tone="ghost" onClick={onClose}>
            Close
          </Btn>
        </div>
        <div className="manual-copy mt-4 space-y-4 text-sm leading-relaxed text-fg-soft">
          <p>Pass the device at the end of each day. The map hides between turns.</p>
          <p>Every town, works, airfield, and keep you hold pays 1,000 at dawn. Repairs on your own ground cost a little of that.</p>
          <p>Huscarls, riflemen, starblades, gnashes, and cherubs seize property, and so do their heavy cousins. A healthy soldier takes most holdings in two days. Taking a keep knocks that army out. In a two-banner battle, that wins.</p>
          <p>Three or four banners can share a larger map. The last seat standing wins, and a fallen army leaves its other holdings abandoned. In a paired battle, Ember stands with Flint and Gale with Tide. You share sight, not funds, and you cannot strike or seize an ally.</p>
          <p>Move, then strike, or strike where you stand. Blue ground is a march, red ground is a shot. The forecast is the spread before luck. Indirect guns cannot fire after moving unless Gore Rain is active, and they only shoot targets someone on your side can see.</p>
          <p>Works build ground units. Airfields build aircraft. The building has to be empty. New units may act the day they arrive.</p>
          <p>Aircraft burn fuel every dawn and fall if they run dry. Parking on your airfield refuels them. Haulers and kites carry one soldier and can resupply neighbors.</p>
          <p>Powers charge as damage is dealt and taken. They last until you end the day. Ascendant Hymn lifts infantry and aircraft one tile farther and makes them hit harder. Each banner's captain grows to rank 6 by defeating enemies. Heal spends their action to mend themselves and anyone beside them. Calling a fallen captain back costs 5,000, plus 1,000 for each rank, up to 10,000.</p>
          <p>Mountains block every unit, including aircraft. Forests can be marched — wheels and treads are slower there — and under fog they hide units until a friend stands beside them.</p>
          <p>You win by taking the enemy keep, or if the other army cannot field a unit. Days do not run out. Undo rewinds your last order this day. On a phone or tablet, tap a unit, then tap a blue tile to move or a red tile to aim. Drag to pan and pinch to zoom. Wait, Seize, Strike, and Build sit on the bar at the bottom. Details opens the log and resign. On a keyboard, arrows move the cursor, Enter confirms, and E ends the day.</p>
          <p>Music changes with the screen and the map, and it quiets while you pass the device. Mute silences the music and the cues together.</p>
        </div>
      </div>
    </div>
  );
}
