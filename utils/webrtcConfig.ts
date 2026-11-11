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
 * Strips VP8, VP9, and AV1 from the video m-line in SDP, keeping only H.264
 * and its associated RTX/RED/ULPFEC repair payload types.
 */
export const enforceH264OnlyInSdp = (sdp: string): string => {
  if (!sdp) return sdp;

  try {
    const lines = sdp.split(/\r?\n/);
    const h264PtSet = new Set<string>();
    const forbiddenPtSet = new Set<string>();

    // First pass: identify H264 payload types vs VP8/VP9/AV1 payload types
    for (const line of lines) {
      const rtpmapMatch = line.match(/^a=rtpmap:(\d+)\s+([a-zA-Z0-9.-]+)\//i);
      if (rtpmapMatch) {
        const pt = rtpmapMatch[1];
        const codecName = rtpmapMatch[2].toUpperCase();
        if (codecName === "H264") {
          h264PtSet.add(pt);
        } else if (codecName === "VP8" || codecName === "VP9" || codecName === "AV1") {
          forbiddenPtSet.add(pt);
        }
      }
    }

    // Safety check: if browser has no H264 in SDP at all, return unmodified SDP
    if (h264PtSet.size === 0) {
      return sdp;
    }

    // Second pass: find RTX payload types linked to forbidden codecs (apt=...)
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

    // Third pass: filter m=video line and drop a=rtpmap / a=fmtp / a=rtcp-fb for forbidden PTs
    const filteredLines: string[] = [];
    let inVideoSection = false;

    for (const line of lines) {
      if (line.startsWith("m=video ")) {
        inVideoSection = true;
        const parts = line.trim().split(/\s+/);
        // m=video <port> <proto> <pt1> <pt2> ...
        const headerParts = parts.slice(0, 3);
        const payloadTypes = parts.slice(3);

        // Keep only non-forbidden PTs, placing H264 PTs first
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
          continue; // Strip VP8/VP9/AV1 attribute line
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
 * Enforces H.264 only and injects clean b=AS/b=TIAS lines into SDP in strict RFC 4566 compliance:
 * - NEVER mutates Answer descriptions on Safari iOS
 * - Strips VP8/VP9 and keeps H.264
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

  // First strip VP8/VP9 so only H.264 is negotiated
  const h264Sdp = enforceH264OnlyInSdp(sdp);

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
 * Patches RTCPeerConnection to safely enforce H.264-only + high-bitrate SDP negotiation
 * upon setLocalDescription without causing malformed SDP or repeated mutations.
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
 * Strictly enforces H.264 ONLY (removes VP8, VP9, AV1 completely).
 * Retains RTX/RED/ULPFEC repair codecs so packet loss recovery remains intact.
 */
export const prioritizeVideoCodecs = (transceiver: RTCRtpTransceiver) => {
  if (!("setCodecPreferences" in transceiver)) return;
  if (typeof RTCRtpReceiver === "undefined" || !RTCRtpReceiver.getCapabilities) return;

  try {
    const capabilities = RTCRtpReceiver.getCapabilities("video");
    if (!capabilities || !capabilities.codecs) return;

    const h264Codecs = capabilities.codecs.filter(
      (c) => c.mimeType.toLowerCase() === "video/h264"
    );

    // Keep repair/retransmission mechanisms required by WebRTC video transport
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
