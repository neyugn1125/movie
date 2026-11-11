import { NextRequest, NextResponse } from "next/server";

interface RoleSignal {
  peerId: string;
  isSharing: boolean;
  lastSeen: number;
}

// Memory cache for active roles within the serverless environment
const roomSignals: Record<string, RoleSignal> = {};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { role, peerId, isSharing } = body;

    if (!role || (role !== "nguyen" && role !== "crabie")) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const partnerRole = role === "nguyen" ? "crabie" : "nguyen";

    if (peerId) {
      roomSignals[role] = {
        peerId,
        isSharing: !!isSharing,
        lastSeen: Date.now(),
      };
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
  });
}
