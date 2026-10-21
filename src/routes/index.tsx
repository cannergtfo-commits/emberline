import { createFileRoute } from "@tanstack/react-router";
import { GameApp } from "@/components/emberline/GameApp";

export const Route = createFileRoute("/")({
  component: GameApp,
});
