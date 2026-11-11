import { NextRequest, NextResponse } from "next/server";
import { ChatMessage, FloatingReaction } from "@/types/cinema";

interface RoleSignal {
  peerId: string;
  isSharing: boolean;
  lastSeen: number;
}

// In-memory room state on Vercel Serverless container
const roomSignals: Record<string, RoleSignal> = {};
const roomMessages: ChatMessage[] = [];
const roomReactions: FloatingReaction[] = [];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { role, peerId, isSharing, newMessage, newReaction } = body;

    if (!role || (role !== "nguyen" && role !== "crabie")) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const partnerRole = role === "nguyen" ? "crabie" : "nguyen";

    // Update presence
    if (peerId) {
      roomSignals[role] = {
        peerId,
        isSharing: !!isSharing,
        lastSeen: Date.now(),
      };
    }

    // Append new chat message if sent via API
    if (newMessage && newMessage.id) {
      const exists = roomMessages.some((m) => m.id === newMessage.id);
      if (!exists) {
        roomMessages.push(newMessage);
        // Keep last 60 messages in memory
        if (roomMessages.length > 60) {
          roomMessages.splice(0, roomMessages.length - 60);
        }
      }
    }

    // Append new floating reaction if sent via API
    if (newReaction && newReaction.id) {
      const exists = roomReactions.some((r) => r.id === newReaction.id);
      if (!exists) {
        roomReactions.push(newReaction);
        if (roomReactions.length > 20) {
          roomReactions.splice(0, roomReactions.length - 20);
        }
      }
    }

    const partner = roomSignals[partnerRole];
    const isPartnerOnline = partner ? Date.now() - partner.lastSeen < 12000 : false;

    return NextResponse.json({
      success: true,
      partner: {
        role: partnerRole,
        peerId: isPartnerOnline && partner ? partner.peerId : null,
        isOnline: isPartnerOnline,
        isSharing: isPartnerOnline && partner ? partner.isSharing : false,
      },
      messages: roomMessages,
      recentReactions: roomReactions.filter((r) => Date.now() - Number(r.id.split("-")[0] || 0) < 6000),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const role = searchParams.get("role");

  if (!role || (role !== "nguyen" && role !== "crabie")) {
    return NextResponse.json({ error: "Invalid role parameter" }, { status: 400 });
  }

  const partnerRole = role === "nguyen" ? "crabie" : "nguyen";
  const partner = roomSignals[partnerRole];
  const isPartnerOnline = partner ? Date.now() - partner.lastSeen < 12000 : false;

  return NextResponse.json({
    partner: {
      role: partnerRole,
      peerId: isPartnerOnline && partner ? partner.peerId : null,
      isOnline: isPartnerOnline,
      isSharing: isPartnerOnline && partner ? partner.isSharing : false,
    },
    messages: roomMessages,
  });
}
