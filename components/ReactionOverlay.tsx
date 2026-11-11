"use client";

import React from "react";
import { FloatingReaction } from "@/types/cinema";

interface ReactionOverlayProps {
  reactions: FloatingReaction[];
}

export const ReactionOverlay: React.FC<ReactionOverlayProps> = ({ reactions }) => {
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {reactions.map((r) => (
        <div
          key={r.id}
          style={{ left: `${r.xPercent}%`, bottom: "100px" }}
          className="absolute animate-float-up text-4xl select-none filter drop-shadow-lg"
        >
          {r.emoji}
        </div>
      ))}
    </div>
  );
};
