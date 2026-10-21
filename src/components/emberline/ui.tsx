import { clsx, type ClassValue } from "clsx";
import {
  Factory,
  Flag,
  Package,
  Plane,
  Swords,
  Timer,
  Undo2,
  ArrowDownToLine,
} from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ICONS = {
  wait: Timer,
  seize: Flag,
  strike: Swords,
  supply: Package,
  drop: ArrowDownToLine,
  undo: Undo2,
  works: Factory,
  air: Plane,
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name }: { name: IconName }) {
  const Glyph = ICONS[name];
  return <Glyph className="game-icon" aria-hidden />;
}

export function Btn({
  tone = "solid",
  align = "center",
  className,
  type = "button",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "solid" | "ghost" | "gale" | "line";
  align?: "center" | "start";
  children?: ReactNode;
}) {
  return (
    <button
      type={type}
      className={cn("game-btn", `game-btn-${tone}`, align === "start" && "is-start", className)}
      {...props}
    >
      <span className="game-btn-label">{children}</span>
    </button>
  );
}
