import { useEffect, useRef, useState } from "react";
import { getHints, type Hints, type World } from "@/game/rules";
import { useGame } from "@/game/store";
import { useArt } from "./art";
import { TILE, paint, type Camera } from "./paint";
import { Btn } from "./ui";

const emptyHints: Hints = {
  moves: [],
  attacks: [],
  drops: [],
  canCapture: false,
  canSupply: false,
  board: null,
  canWait: false,
};

const MIN_SCALE = 0.45;
const MAX_SCALE = 2.4;

function clampScale(n: number) {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, n));
}

export function MapView({ dock = "peek" }: { dock?: "peek" | "open" }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const art = useArt();
  const [banner, setBanner] = useState<string | null>(null);
  const cam = useRef<Camera>({ x: 0, y: 0, scale: 1 });
  const wantFit = useRef<"keep" | "board" | null>("keep");
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<
    | { kind: "drag"; x: number; y: number; cx: number; cy: number; moved: boolean }
    | { kind: "pinch"; dist: number; scale: number; wx: number; wy: number }
    | null
  >(null);
  const dockShift = useRef(0);

  useEffect(() => {
    if (dock !== "open") {
      if (dockShift.current) {
        cam.current.y += dockShift.current;
        dockShift.current = 0;
      }
      return;
    }
    const canvas = canvasRef.current;
    const sheet = document.querySelector("[data-dock='sheet']");
    if (!canvas || !sheet) return;
    const id = requestAnimationFrame(() => {
      const map = canvas.getBoundingClientRect();
      const panel = sheet.getBoundingClientRect();
      const overlap = Math.max(0, map.bottom - panel.top - 12) * 0.7;
      cam.current.y -= overlap - dockShift.current;
      dockShift.current = overlap;
    });
    return () => cancelAnimationFrame(id);
  }, [dock]);

  const localPoint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { px: 0, py: 0 };
    const rect = canvas.getBoundingClientRect();
    return { px: clientX - rect.left, py: clientY - rect.top };
  };

  const zoomAt = (px: number, py: number, next: number) => {
    const scale = clampScale(next);
    const wx = (px - cam.current.x) / cam.current.scale;
    const wy = (py - cam.current.y) / cam.current.scale;
    cam.current.scale = scale;
    cam.current.x = px - wx * scale;
    cam.current.y = py - wy * scale;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    let sizedW = 0;
    let sizedH = 0;
    let hintWorld: World | null = null;
    let hintKey = "";
    let hintVal = emptyHints;
    const styles = getComputedStyle(document.documentElement);
    const colors = {
      ember: styles.getPropertyValue("--color-ember").trim() || "#c4491d",
      gale: styles.getPropertyValue("--color-gale").trim() || "#1b6b66",
      flint: styles.getPropertyValue("--color-flint").trim() || "#a16207",
      tide: styles.getPropertyValue("--color-tide").trim() || "#2a4e8f",
      ink: styles.getPropertyValue("--color-ink").trim() || "#10141a",
    };
    const frame = () => {
      const state = useGame.getState();
      const current = state.world;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const viewW = Math.max(1, rect.width);
      const viewH = Math.max(1, rect.height);
      const bufW = Math.floor(viewW * dpr);
      const bufH = Math.floor(viewH * dpr);
      if (sizedW !== bufW || sizedH !== bufH) {
        canvas.width = bufW;
        canvas.height = bufH;
        sizedW = bufW;
        sizedH = bufH;
      }
      const ctx = canvas.getContext("2d");
      if (ctx && current) {
        if (wantFit.current && viewW > 40 && viewH > 40) {
          const mode = wantFit.current;
          wantFit.current = null;
          const narrow = Math.min(viewW, viewH) < 520 || viewW < 700;
          const coarse = window.matchMedia("(pointer: coarse)").matches;
          if (mode === "keep" && (narrow || coarse)) {
            const keep = current.homeKeep[current.turn - 1] ?? current.homeKeep[0];
            const towardX = Math.sign((current.width - 1) / 2 - keep.x) || 1;
            const towardY = Math.sign((current.height - 1) / 2 - keep.y) || -1;
            const fx = keep.x + towardX * (narrow ? 2.5 : 4) + 0.5;
            const fy = keep.y + towardY * (narrow ? 1.6 : 2.5) + 0.5;
            const across = narrow ? 6.4 : 12;
            const cap = narrow ? 1.15 : 1;
            const scale = clampScale(Math.max(44 / TILE, Math.min(cap, viewW / (across * TILE))));
            cam.current.scale = scale;
            cam.current.x = viewW / 2 - fx * TILE * scale;
            cam.current.y = viewH / 2 - fy * TILE * scale;
          } else {
            const scale = Math.min(viewW / (current.width * TILE), viewH / (current.height * TILE));
            cam.current.scale = clampScale(scale);
            cam.current.x = (viewW - current.width * TILE * cam.current.scale) / 2;
            cam.current.y = (viewH - current.height * TILE * cam.current.scale) / 2;
          }
        }
        const pending = state.pending;
        const hintKeyNext = `${state.selectedId ?? ""}:${pending ? `${pending.unitId}@${pending.x},${pending.y}` : ""}`;
        if (hintWorld !== current || hintKey !== hintKeyNext) {
          hintWorld = current;
          hintKey = hintKeyNext;
          hintVal = state.selectedId ? getHints(current, state.selectedId, pending) : emptyHints;
        }
        paint({
          ctx,
          world: current,
          cam: cam.current,
          art,
          hints: hintVal,
          pending,
          selectedId: state.selectedId,
          cursor: state.cursor,
          fx: state.fx,
          now: performance.now(),
          viewW,
          viewH,
          dpr,
          ember: colors.ember,
          gale: colors.gale,
          flint: colors.flint,
          tide: colors.tide,
          ink: colors.ink,
        });
        const now = performance.now();
        const text = state.fx.find((f) => f.kind === "banner" && now < f.t0 + f.dur)?.text ?? null;
        setBanner((prev) => (prev === text ? prev : text));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [art]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useGame.getState();
      if (!s.world || s.phase !== "play") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((tag === "BUTTON" || tag === "A") && (e.key === "Enter" || e.key === " ")) return;
      if (e.key === "Escape") {
        s.cancelPending();
        return;
      }
      if (e.key === "u" || e.key === "U") {
        s.undo();
        return;
      }
      if (e.key === "e" || e.key === "E") {
        s.endDay();
        return;
      }
      const dir =
        e.key === "ArrowUp"
          ? [0, -1]
          : e.key === "ArrowDown"
            ? [0, 1]
            : e.key === "ArrowLeft"
              ? [-1, 0]
              : e.key === "ArrowRight"
                ? [1, 0]
                : null;
      if (dir) {
        e.preventDefault();
        s.setCursor({
          x: Math.max(0, Math.min(s.world.width - 1, s.cursor.x + dir[0])),
          y: Math.max(0, Math.min(s.world.height - 1, s.cursor.y + dir[1])),
        });
      }
      if (e.key === "Enter") {
        e.preventDefault();
        s.pressTile(s.cursor.x, s.cursor.y);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, cam.current.scale * (e.deltaY > 0 ? 0.92 : 1.08));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  const toTile = (e: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current;
    const state = useGame.getState().world;
    if (!canvas || !state) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - cam.current.x) / cam.current.scale;
    const y = (e.clientY - rect.top - cam.current.y) / cam.current.scale;
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= state.width || ty >= state.height) return null;
    return { x: tx, y: ty };
  };

  const beginGesture = () => {
    const pts = [...pointers.current.values()];
    if (pts.length >= 2) {
      const [a, b] = pts;
      const { px, py } = localPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      gesture.current = {
        kind: "pinch",
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        scale: cam.current.scale,
        wx: (px - cam.current.x) / cam.current.scale,
        wy: (py - cam.current.y) / cam.current.scale,
      };
      return;
    }
    if (pts.length === 1) {
      const p = pts[0];
      gesture.current = { kind: "drag", x: p.x, y: p.y, cx: cam.current.x, cy: cam.current.y, moved: false };
    }
  };

  return (
    <div className="relative h-full min-h-48 w-full touch-none">
      <canvas
        ref={canvasRef}
        className="h-full w-full touch-none"
        aria-label="Battle map"
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* synthetic or already released */
          }
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          beginGesture();
        }}
        onPointerMove={(e) => {
          if (!pointers.current.has(e.pointerId)) return;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const g = gesture.current;
          if (!g) return;
          if (g.kind === "pinch") {
            const pts = [...pointers.current.values()];
            if (pts.length < 2) return;
            const [a, b] = pts;
            const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
            const { px, py } = localPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
            const scale = clampScale(g.scale * (d / g.dist));
            cam.current.scale = scale;
            cam.current.x = px - g.wx * scale;
            cam.current.y = py - g.wy * scale;
            return;
          }
          const dx = e.clientX - g.x;
          const dy = e.clientY - g.y;
          if (dx * dx + dy * dy > 324) g.moved = true;
          if (g.moved) {
            cam.current.x = g.cx + dx;
            cam.current.y = g.cy + dy;
          }
        }}
        onPointerUp={(e) => {
          const was = gesture.current;
          pointers.current.delete(e.pointerId);
          if (pointers.current.size > 0) {
            beginGesture();
            if (gesture.current?.kind === "drag") gesture.current.moved = true;
            return;
          }
          gesture.current = null;
          if (was?.kind === "drag" && !was.moved) {
            const tile = toTile(e);
            if (tile) useGame.getState().pressTile(tile.x, tile.y);
          }
        }}
        onPointerCancel={() => {
          pointers.current.clear();
          gesture.current = null;
        }}
      />
      {banner ? (
        <p className="pointer-events-none absolute inset-x-0 top-4 text-center">
          <span className="hud-chip text-lg">{banner}</span>
        </p>
      ) : null}
      <div className="absolute top-2 right-[max(0.5rem,env(safe-area-inset-right))] flex gap-1.5">
        <Btn
          tone="line"
          className="square"
          aria-label="Zoom in"
          onClick={() => {
            const canvas = canvasRef.current;
            const rect = canvas?.getBoundingClientRect();
            zoomAt((rect?.width ?? 0) / 2, (rect?.height ?? 0) * 0.42, cam.current.scale * 1.15);
          }}
        >
          +
        </Btn>
        <Btn
          tone="line"
          className="square"
          aria-label="Zoom out"
          onClick={() => {
            const canvas = canvasRef.current;
            const rect = canvas?.getBoundingClientRect();
            zoomAt((rect?.width ?? 0) / 2, (rect?.height ?? 0) * 0.42, cam.current.scale / 1.15);
          }}
        >
          −
        </Btn>
        <Btn
          tone="line"
          className="compact"
          onClick={() => {
            wantFit.current = "keep";
          }}
        >
          Base
        </Btn>
        <Btn
          tone="line"
          className="compact"
          onClick={() => {
            wantFit.current = "board";
          }}
        >
          Fit
        </Btn>
      </div>
    </div>
  );
}
