import { BitrateTier, DegradationPreference } from "@/types/cinema";

export const getIceServers = (): RTCIceServer[] => {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "stun:global.stun.twilio.com:3478" },
  ];

  if (process.env.NEXT_PUBLIC_TURN_URL) {
    servers.push({
      urls: process.env.NEXT_PUBLIC_TURN_URL,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  }

  return servers;
};

export const getPeerIdForRole = (role: "nguyen" | "crabie") => {
  let domainPrefix = "cinema-room";
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1") {
      domainPrefix = hostname.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
    }
  }
  return `${domainPrefix}-${role}`;
};

export const getRandomSessionPeerId = (role: "nguyen" | "crabie") => {
  const base = getPeerIdForRole(role);
  const randomSuffix = Math.random().toString(36).substring(2, 7);
  return `${base}-${randomSuffix}`;
};

/**
 * Injects Google-specific high-bandwidth parameters and b=AS/b=TIAS lines
 * into SDP in strict RFC 4566 compliance:
 * In media section m=video, b= lines MUST be placed AFTER c= line (if present)
 * and BEFORE any a= attribute lines.
 */
export const enhanceSdpBitrate = (sdp: string, bitrateMbps: number = 15): string => {
  if (!sdp) return sdp;

  const targetKbps = bitrateMbps * 1000;
  const targetBps = bitrateMbps * 1_000_000;
  const minKbps = Math.min(8000, Math.floor(targetKbps * 0.6));
  const startKbps = targetKbps;
  const maxKbps = Math.max(25000, targetKbps);

  const lines = sdp.split(/\r?\n/);
  const result: string[] = [];
  let inVideoSection = false;
  let bandwidthInjected = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("m=video")) {
      inVideoSection = true;
      bandwidthInjected = false;
      result.push(line);
      continue;
    } else if (inVideoSection && line.startsWith("m=")) {
      inVideoSection = false;
    }

    if (inVideoSection) {
      // Remove any pre-existing bandwidth lines to prevent duplicates
      if (line.startsWith("b=AS:") || line.startsWith("b=TIAS:")) {
        continue;
      }

      // RFC 4566 sequence: m= -> c= -> b= -> a=
      // If c= line exists, append it first, then inject b= lines immediately
      if (line.startsWith("c=")) {
        result.push(line);
        if (!bandwidthInjected) {
          result.push(`b=AS:${targetKbps}`);
          result.push(`b=TIAS:${targetBps}`);
          bandwidthInjected = true;
        }
        continue;
      }

      // If there is no c= line in this media block, inject b= before the first a= line
      if (line.startsWith("a=") && !bandwidthInjected) {
        result.push(`b=AS:${targetKbps}`);
        result.push(`b=TIAS:${targetBps}`);
        bandwidthInjected = true;
      }

      // Enhance fmtp lines for video codecs (VP9, H264, VP8) with Chrome BWE parameters
      if (line.startsWith("a=fmtp:")) {
        let enhancedLine = line;
        if (!enhancedLine.includes("x-google-min-bitrate")) {
          enhancedLine += `;x-google-min-bitrate=${minKbps};x-google-max-bitrate=${maxKbps};x-google-start-bitrate=${startKbps}`;
        }
        result.push(enhancedLine);
        continue;
      }
    }

    result.push(line);
  }

  return result.join("\r\n");
};

/**
 * Patches RTCPeerConnection to safely enforce high-bitrate SDP negotiation
 * upon setLocalDescription without causing malformed SDP or repeated mutations.
 */
export const patchPeerConnectionForBitrate = (
  pc: RTCPeerConnection,
  targetBitrateMbps: number = 15
) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyPc = pc as any;
  if (anyPc._bitratePatched) return;
  anyPc._bitratePatched = true;

  try {
    const origSetLocalDescription = pc.setLocalDescription.bind(pc);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pc as any).setLocalDescription = async function (...args: any[]) {
      const desc = args[0];
      if (desc && desc.sdp) {
        desc.sdp = enhanceSdpBitrate(desc.sdp, targetBitrateMbps);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (origSetLocalDescription as any)(...args);
    };
  } catch (err) {
    console.warn("Could not patch RTCPeerConnection for SDP bitrate:", err);
  }
};

/**
 * Configure RTCRtpSender to unlock 15-25 Mbps bitrate and maintain 60fps
 */
export const configureVideoSender = async (
  sender: RTCRtpSender,
  bitrateMbps: BitrateTier = 15,
  degradation: DegradationPreference = "maintain-framerate"
) => {
  try {
    const parameters = sender.getParameters();
    if (!parameters.encodings || parameters.encodings.length === 0) {
      parameters.encodings = [{}];
    }

    const maxBitrateBps = bitrateMbps * 1_000_000;
    const minBitrateBps = Math.min(8_000_000, Math.floor(maxBitrateBps * 0.6)); // High floor for clarity

    parameters.encodings[0].maxBitrate = maxBitrateBps;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (parameters.encodings[0] as any).minBitrate = minBitrateBps;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (parameters.encodings[0] as any).maxFramerate = 60;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (parameters.encodings[0] as any).scaleResolutionDownBy = 1.0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (parameters.encodings[0] as any).networkPriority = "high";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (parameters as any).degradationPreference = degradation; // Solid 60fps

    await sender.setParameters(parameters);
  } catch (err) {
    console.warn("Unable to set video sender parameters:", err);
  }
};

/**
 * Prioritize hardware-accelerated VP9 or H.264 codecs
 */
export const prioritizeVideoCodecs = (transceiver: RTCRtpTransceiver) => {
  if (!("setCodecPreferences" in transceiver)) return;
  if (!RTCRtpReceiver.getCapabilities) return;

  try {
    const capabilities = RTCRtpReceiver.getCapabilities("video");
    if (!capabilities || !capabilities.codecs) return;

    const preferredCodecs = ["video/VP9", "video/H264"];
    const sorted = [...capabilities.codecs].sort((a, b) => {
      const aIndex = preferredCodecs.indexOf(a.mimeType);
      const bIndex = preferredCodecs.indexOf(b.mimeType);
      if (aIndex !== -1 && bIndex === -1) return -1;
      if (aIndex === -1 && bIndex !== -1) return 1;
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      return 0;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (transceiver as any).setCodecPreferences(sorted);
  } catch (err) {
    console.warn("Unable to set codec preferences:", err);
  }
};
