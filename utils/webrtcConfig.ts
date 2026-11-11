import { BitrateTier, DegradationPreference } from "@/types/cinema";

export const getIceServers = (): RTCIceServer[] => {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "stun:stun.services.mozilla.com:3478" },
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

/**
 * Universal, fixed Peer IDs for the cinema couple.
 * Always predictable so desktop and mobile 4G always find each other directly.
 */
export const getPeerIdForRole = (role: "nguyen" | "crabie") => {
  return `nguyen-crabie-cinema-${role}`;
};

/**
 * Checks if the current browser environment is Safari / WebKit on iOS
 */
export const isSafariIOS = (): boolean => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isWebKit = /WebKit/i.test(ua) && !/CriOS|FxiOS|OPiOS|mercury/i.test(ua);
  return isIOS || isWebKit;
};

/**
 * Injects clean b=AS/b=TIAS lines into SDP in strict RFC 4566 compliance:
 * - NEVER applied on Safari iOS
 * - ONLY applied on Offer descriptions (never modify Answer descriptions)
 * - DOES NOT mutate a=fmtp lines to avoid breaking H.264/VP9 decoder parsers
 */
export const enhanceSdpBitrate = (sdp: string, bitrateMbps: number = 15): string => {
  if (!sdp) return sdp;

  // On Safari iOS, keep SDP pristine to ensure WebKit hardware decoding passes
  if (isSafariIOS()) {
    return sdp;
  }

  // Do not alter Answer SDPs
  if (sdp.includes("a=setup:active")) {
    return sdp;
  }

  const targetKbps = bitrateMbps * 1000;
  const targetBps = bitrateMbps * 1_000_000;

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
      if (line.startsWith("b=AS:") || line.startsWith("b=TIAS:")) {
        continue;
      }

      // RFC 4566 sequence: m= -> c= -> b= -> a=
      if (line.startsWith("c=")) {
        result.push(line);
        if (!bandwidthInjected) {
          result.push(`b=AS:${targetKbps}`);
          result.push(`b=TIAS:${targetBps}`);
          bandwidthInjected = true;
        }
        continue;
      }

      if (line.startsWith("a=") && !bandwidthInjected) {
        result.push(`b=AS:${targetKbps}`);
        result.push(`b=TIAS:${targetBps}`);
        bandwidthInjected = true;
      }
    }

    result.push(line);
  }

  return result.join("\r\n");
};

/**
 * Patches RTCPeerConnection to safely enforce high-bitrate SDP negotiation
 * upon setLocalDescription without causing malformed SDP or repeated mutations.
 * Protected: NEVER touches Safari iOS and NEVER touches Answer descriptions.
 */
export const patchPeerConnectionForBitrate = (
  pc: RTCPeerConnection,
  targetBitrateMbps: number = 15
) => {
  if (isSafariIOS()) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyPc = pc as any;
  if (anyPc._bitratePatched) return;
  anyPc._bitratePatched = true;

  try {
    const origSetLocalDescription = pc.setLocalDescription.bind(pc);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pc as any).setLocalDescription = async function (...args: any[]) {
      const desc = args[0];
      if (desc && desc.sdp && desc.type === "offer") {
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
 * Adaptable for cellular 4G networks without strict high floors.
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

    parameters.encodings[0].maxBitrate = maxBitrateBps;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (parameters.encodings[0] as any).maxFramerate = 60;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (parameters.encodings[0] as any).scaleResolutionDownBy = 1.0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (parameters.encodings[0] as any).networkPriority = "high";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (parameters as any).degradationPreference = degradation;

    await sender.setParameters(parameters);
  } catch (err) {
    console.warn("Unable to set video sender parameters:", err);
  }
};

/**
 * Naturally prioritizes modern, high-efficiency WebRTC codecs:
 * 1. VP9 (Native hardware YouTube/Netflix codec)
 * 2. H.264 (Universal Apple & PC hardware decode)
 * 3. VP8
 */
export const prioritizeVideoCodecs = (transceiver: RTCRtpTransceiver) => {
  if (!("setCodecPreferences" in transceiver)) return;
  if (!RTCRtpReceiver.getCapabilities) return;

  try {
    const capabilities = RTCRtpReceiver.getCapabilities("video");
    if (!capabilities || !capabilities.codecs) return;

    const preferredCodecs = ["video/VP9", "video/H264", "video/VP8"];
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
