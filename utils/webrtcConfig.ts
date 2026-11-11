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
 * Strictly enforces H.264 ONLY on a transceiver (removes VP8, VP9, AV1 completely).
 * Retains RTX/RED/ULPFEC repair codecs so packet loss recovery remains intact.
 */
export const prioritizeVideoCodecs = (transceiver: RTCRtpTransceiver) => {
  if (!transceiver || !("setCodecPreferences" in transceiver)) return;
  if (typeof RTCRtpReceiver === "undefined" || !RTCRtpReceiver.getCapabilities) return;

  try {
    const capabilities = RTCRtpReceiver.getCapabilities("video");
    if (!capabilities || !capabilities.codecs) return;

    const h264Codecs = capabilities.codecs.filter(
      (c) => c.mimeType.toLowerCase() === "video/h264"
    );

    const repairCodecs = capabilities.codecs.filter((c) => {
      const mime = c.mimeType.toLowerCase();
      return mime === "video/rtx" || mime === "video/red" || mime === "video/ulpfec";
    });

    if (h264Codecs.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (transceiver as any).setCodecPreferences([...h264Codecs, ...repairCodecs]);
    }
  } catch (err) {
    console.warn("Unable to set H.264-only codec preferences:", err);
  }
};

/**
 * Strips VP8, VP9, and AV1 from the video m-line in SDP, keeping ONLY H.264
 * and its associated RTX/RED/ULPFEC repair payload types.
 */
export const enforceH264OnlyInSdp = (sdp: string): string => {
  if (!sdp) return sdp;

  try {
    const lines = sdp.split(/\r?\n/);
    const h264PtSet = new Set<string>();
    const forbiddenPtSet = new Set<string>();

    // Pass 1: Identify H264 payload types vs VP8/VP9/AV1 payload types
    for (const line of lines) {
      const rtpmapMatch = line.match(/^a=rtpmap:(\d+)\s+([a-zA-Z0-9._-]+)\//i);
      if (rtpmapMatch) {
        const pt = rtpmapMatch[1];
        const codecName = rtpmapMatch[2].toUpperCase();
        if (codecName === "H264") {
          h264PtSet.add(pt);
        } else if (
          codecName === "VP8" ||
          codecName === "VP9" ||
          codecName === "AV1" ||
          codecName === "AV1X"
        ) {
          forbiddenPtSet.add(pt);
        }
      }
    }

    // If browser has no H264 in SDP at all, return unmodified SDP to avoid breaking video
    if (h264PtSet.size === 0) {
      return sdp;
    }

    // Pass 2: Find RTX payload types linked to forbidden codecs (apt=...)
    for (const line of lines) {
      const fmtpMatch = line.match(/^a=fmtp:(\d+)\s+.*apt=(\d+)/i);
      if (fmtpMatch) {
        const rtxPt = fmtpMatch[1];
        const associatedPt = fmtpMatch[2];
        if (forbiddenPtSet.has(associatedPt)) {
          forbiddenPtSet.add(rtxPt);
        }
      }
    }

    // Pass 3: Filter m=video line and remove a=rtpmap / a=fmtp / a=rtcp-fb for forbidden PTs
    const filteredLines: string[] = [];
    let inVideoSection = false;

    for (const line of lines) {
      if (line.startsWith("m=video ")) {
        inVideoSection = true;
        const parts = line.trim().split(/\s+/);
        const headerParts = parts.slice(0, 3);
        const payloadTypes = parts.slice(3);

        const allowedPts = payloadTypes.filter((pt) => !forbiddenPtSet.has(pt));
        const h264Pts = allowedPts.filter((pt) => h264PtSet.has(pt));
        const otherAllowedPts = allowedPts.filter((pt) => !h264PtSet.has(pt));

        if (h264Pts.length > 0) {
          filteredLines.push([...headerParts, ...h264Pts, ...otherAllowedPts].join(" "));
          continue;
        }
      } else if (inVideoSection && line.startsWith("m=")) {
        inVideoSection = false;
      }

      if (inVideoSection) {
        const attrPtMatch = line.match(/^a=(?:rtpmap|fmtp|rtcp-fb):(\d+)\b/);
        if (attrPtMatch && forbiddenPtSet.has(attrPtMatch[1])) {
          continue;
        }
      }

      filteredLines.push(line);
    }

    return filteredLines.join("\r\n");
  } catch (err) {
    console.warn("Could not enforce H264 in SDP:", err);
    return sdp;
  }
};

/**
 * Enforces H.264 only and injects clean b=AS/b=TIAS lines into SDP in strict RFC 4566 compliance.
 */
export const enhanceSdpBitrate = (sdp: string, bitrateMbps: number = 15): string => {
  if (!sdp) return sdp;

  // Always strip VP8/VP9/AV1 first so H.264 is strictly used
  const h264Sdp = enforceH264OnlyInSdp(sdp);

  // On Safari iOS, do not inject custom b=AS lines to keep WebKit parser happy
  if (isSafariIOS()) {
    return h264Sdp;
  }

  // Do not inject b=AS on Answer SDPs
  if (h264Sdp.includes("a=setup:active")) {
    return h264Sdp;
  }

  const targetKbps = bitrateMbps * 1000;
  const targetBps = bitrateMbps * 1_000_000;

  const lines = h264Sdp.split(/\r?\n/);
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
 * Globally intercepts RTCPeerConnection.prototype.createOffer, createAnswer, and setLocalDescription
 * BEFORE PeerJS calls them synchronously inside peer.call().
 * This guarantees 100% H.264 negotiation and prevents VP8 from ever being offered.
 */
let globalBitrateGetter: () => number = () => 15;

export const installGlobalH264AndBitrateInterceptor = (getBitrateMbps: () => number) => {
  globalBitrateGetter = getBitrateMbps;

  if (typeof window === "undefined" || typeof RTCPeerConnection === "undefined") return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proto = RTCPeerConnection.prototype as any;
  if (proto._h264InterceptorInstalled) return;
  proto._h264InterceptorInstalled = true;

  const origCreateOffer = proto.createOffer;
  const origCreateAnswer = proto.createAnswer;
  const origSetLocalDescription = proto.setLocalDescription;

  // 1. Intercept createOffer: apply setCodecPreferences(H264) BEFORE generating SDP, then strip VP8/VP9 from SDP
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proto.createOffer = async function (...args: any[]) {
    try {
      if (this.getTransceivers) {
        this.getTransceivers().forEach((t: RTCRtpTransceiver) => {
          if (t.sender?.track?.kind === "video" || t.receiver?.track?.kind === "video") {
            prioritizeVideoCodecs(t);
          }
        });
      }
    } catch (e) {}

    const offer = await origCreateOffer.apply(this, args);
    if (offer && offer.sdp) {
      offer.sdp = enhanceSdpBitrate(offer.sdp, globalBitrateGetter());
    }
    return offer;
  };

  // 2. Intercept createAnswer: apply setCodecPreferences(H264) and strip VP8/VP9 on non-iOS
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proto.createAnswer = async function (...args: any[]) {
    try {
      if (this.getTransceivers) {
        this.getTransceivers().forEach((t: RTCRtpTransceiver) => {
          if (t.sender?.track?.kind === "video" || t.receiver?.track?.kind === "video") {
            prioritizeVideoCodecs(t);
          }
        });
      }
    } catch (e) {}

    const answer = await origCreateAnswer.apply(this, args);
    if (answer && answer.sdp && !isSafariIOS()) {
      answer.sdp = enforceH264OnlyInSdp(answer.sdp);
    }
    return answer;
  };

  // 3. Intercept setLocalDescription as a second safety net
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proto.setLocalDescription = async function (...args: any[]) {
    const desc = args[0];
    if (desc && desc.sdp) {
      if (desc.type === "offer") {
        desc.sdp = enhanceSdpBitrate(desc.sdp, globalBitrateGetter());
      } else if (desc.type === "answer" && !isSafariIOS()) {
        desc.sdp = enforceH264OnlyInSdp(desc.sdp);
      }
    }
    return origSetLocalDescription.apply(this, args);
  };
};

export const patchPeerConnectionForBitrate = (
  pc: RTCPeerConnection,
  targetBitrateMbps: number = 15
) => {
  installGlobalH264AndBitrateInterceptor(() => targetBitrateMbps);
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
