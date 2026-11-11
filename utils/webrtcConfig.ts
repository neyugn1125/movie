import { BitrateTier, DegradationPreference } from "@/types/cinema";

export const getIceServers = (): RTCIceServer[] => {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ];

  // Optional custom TURN servers via environment variables (e.g. Metered or Cloudflare Calls)
  if (process.env.NEXT_PUBLIC_TURN_URL) {
    servers.push({
      urls: process.env.NEXT_PUBLIC_TURN_URL,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  }

  return servers;
};

export const PEER_ID_PREFIX = "cinema-room-";
export const getPeerIdForRole = (role: "nguyen" | "crabie") => `${PEER_ID_PREFIX}${role}`;

/**
 * Configure RTCRtpSender to optimize bitrate and degradation preference
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
    (parameters as any).degradationPreference = degradation;

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

    transceiver.setCodecPreferences(sorted);
  } catch (err) {
    console.warn("Unable to set codec preferences:", err);
  }
};
