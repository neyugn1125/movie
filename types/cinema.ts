export type UserRole = "nguyen" | "crabie";

export type BitrateTier = 8 | 15 | 25; // Mbps

export type DegradationPreference = "maintain-framerate" | "maintain-resolution";

export interface StreamStats {
  resolution: string;
  fps: number;
  bitrateMbps: number;
  pingMs: number;
  codec: string;
}

export interface ChatMessage {
  id: string;
  sender: UserRole;
  text: string;
  timestamp: number;
}

export interface FloatingReaction {
  id: string;
  emoji: string;
  sender: UserRole;
  xPercent: number;
}

export type DataChannelMessage =
  | { type: "chat"; payload: ChatMessage }
  | { type: "reaction"; payload: { emoji: string; sender: UserRole } }
  | { type: "heartbeat"; payload: { sender: UserRole; isSharing: boolean } }
  | { type: "stream-state"; payload: { isSharing: boolean } };

export interface CinemaTheme {
  name: UserRole;
  displayName: string;
  partnerName: string;
  myPeerId: string;
  partnerPeerId: string;
  primaryColor: string;
  accentColor: string;
}
