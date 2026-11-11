import { BitrateTier, DegradationPreference } from "@/types/cinema";

export const getIceServers = (): RTCIceServer[] => {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
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

/**
 * Injects Google-specific high-bandwidth parameters and b=AS/b=TIAS lines
 * into SDP to bypass Chrome's default 1.5 - 2 Mbps bandwidth cap.
 */
export const enhanceSdpBitrate = (sdp: string, bitrateMbps: number = 15): string => {
  const targetKbps = bitrateMbps * 1000;
  const targetBps = bitrateMbps * 1_000_000;
  const minKbps = Math.min(8000, Math.floor(targetKbps * 0.6));
  const startKbps = targetKbps;
  const maxKbps = Math.max(25000, targetKbps);

  const lines = sdp.split("\r\n");
  const result: string[] = [];
  let inVideoSection = false;
  let hasBandwidthLine = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (line.startsWith("m=video")) {
      inVideoSection = true;
      hasBandwidthLine = false;
      result.push(line);
      continue;
    } else if (inVideoSection && line.startsWith("m=")) {
      inVideoSection = false;
    }

    // Inject bandwidth lines under m=video before attributes
    if (inVideoSection && !hasBandwidthLine && (line.startsWith("c=") || line.startsWith("a="))) {
      result.push(`b=AS:${targetKbps}`);
      result.push(`b=TIAS:${targetBps}`);
      hasBandwidthLine = true;
    }

    // Enhance fmtp lines for video codecs (VP9, H264, VP8) with Chrome BWE parameters
    if (inVideoSection && line.startsWith("a=fmtp:")) {
      const googleBitrateParams = `;x-google-min-bitrate=${minKbps};x-google-max-bitrate=${maxKbps};x-google-start-bitrate=${startKbps}`;
      if (!line.includes("x-google-min-bitrate")) {
        line += googleBitrateParams;
      }
    }

    result.push(line);
  }

  return result.join("\r\n");
};

/**
 * Patches RTCPeerConnection to enforce high-bitrate SDP negotiation on both Offer and Answer
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
    const origCreateOffer = pc.createOffer.bind(pc);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pc as any).createOffer = async function (...args: any[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const offer: any = await (origCreateOffer as any)(...args);
      if (offer && offer.sdp) {
        offer.sdp = enhanceSdpBitrate(offer.sdp, targetBitrateMbps);
      }
      return offer;
    };

    const origCreateAnswer = pc.createAnswer.bind(pc);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pc as any).createAnswer = async function (...args: any[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const answer: any = await (origCreateAnswer as any)(...args);
      if (answer && answer.sdp) {
        answer.sdp = enhanceSdpBitrate(answer.sdp, targetBitrateMbps);
      }
      return answer;
    };

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
    const minBitrateBps = Math.min(8_000_000, Math.floor(maxBitrateBps * 0.6)); // Force high floor

    parameters.encodings[0].maxBitrate = maxBitrateBps;
    (parameters.encodings[0] as any).minBitrate = minBitrateBps;
    (parameters.encodings[0] as any).maxFramerate = 60;
    (parameters.encodings[0] as any).scaleResolutionDownBy = 1.0; // Never downscale
    (parameters.encodings[0] as any).networkPriority = "high";
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

    (transceiver as any).setCodecPreferences(sorted);
  } catch (err) {
    console.warn("Unable to set codec preferences:", err);
  }
};
