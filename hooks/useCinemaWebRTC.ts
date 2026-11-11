"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { DataConnection, MediaConnection } from "peerjs";
import {
  UserRole,
  BitrateTier,
  DegradationPreference,
  StreamStats,
  ChatMessage,
  FloatingReaction,
  DataChannelMessage,
} from "@/types/cinema";
import {
  getIceServers,
  getPeerIdForRole,
  configureVideoSender,
  prioritizeVideoCodecs,
  patchPeerConnectionForBitrate,
} from "@/utils/webrtcConfig";

interface UseCinemaWebRTCProps {
  myRole: UserRole;
}

export function useCinemaWebRTC({ myRole }: UseCinemaWebRTCProps) {
  const partnerRole: UserRole = myRole === "nguyen" ? "crabie" : "nguyen";
  const myPeerId = getPeerIdForRole(myRole);
  const partnerPeerId = getPeerIdForRole(partnerRole);

  // Connection states
  const [isPeerReady, setIsPeerReady] = useState(false);
  const [isPartnerConnected, setIsPartnerConnected] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [isPartnerSharing, setIsPartnerSharing] = useState(false);

  // Media Streams
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null);
  const [localMicStream, setLocalMicStream] = useState<MediaStream | null>(null);
  const [remoteVoiceStream, setRemoteVoiceStream] = useState<MediaStream | null>(null);

  // Settings
  const [isMicMuted, setIsMicMuted] = useState(true);
  const [bitrate, setBitrate] = useState<BitrateTier>(15);
  const [degradation, setDegradation] = useState<DegradationPreference>("maintain-framerate");

  // Chat & Reactions
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);

  // Realtime Stats
  const [stats, setStats] = useState<StreamStats | null>(null);

  // Refs for stable instances and preventing race conditions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const peerRef = useRef<any>(null);
  const dataConnRef = useRef<DataConnection | null>(null);
  const screenCallRef = useRef<MediaConnection | null>(null);
  const voiceCallRef = useRef<MediaConnection | null>(null);
  const activePeerConnectionRef = useRef<RTCPeerConnection | null>(null);

  const localMicStreamRef = useRef<MediaStream | null>(null);
  const localScreenStreamRef = useRef<MediaStream | null>(null);
  const isSharingScreenRef = useRef<boolean>(false);
  const isConnectingRef = useRef<boolean>(false);

  // Stats calculation refs
  const prevBytesRef = useRef<number>(0);
  const prevTimestampRef = useRef<number>(0);
  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastHeartbeatReceivedRef = useRef<number>(0);

  // Sync state to refs
  useEffect(() => {
    localMicStreamRef.current = localMicStream;
  }, [localMicStream]);

  useEffect(() => {
    localScreenStreamRef.current = localScreenStream;
  }, [localScreenStream]);

  useEffect(() => {
    isSharingScreenRef.current = isSharingScreen;
  }, [isSharingScreen]);

  // Trigger floating reaction locally
  const addReactionAnimation = useCallback((emoji: string, sender: UserRole) => {
    const newReaction: FloatingReaction = {
      id: `${Date.now()}-${Math.random()}`,
      emoji,
      sender,
      xPercent: Math.floor(Math.random() * 70) + 15,
    };
    setReactions((prev) => [...prev, newReaction]);

    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== newReaction.id));
    }, 2600);
  }, []);

  // Call partner with current screen stream if sharing
  const callPartnerWithScreenStream = useCallback(() => {
    const peer = peerRef.current;
    const stream = localScreenStreamRef.current;
    if (!peer || !stream) return;

    console.log(`[WebRTC] Sending screen stream call to: ${partnerPeerId}`);

    try {
      const call = peer.call(partnerPeerId, stream, {
        metadata: { type: "screen", role: myRole },
      });

      screenCallRef.current = call;
      activePeerConnectionRef.current = call.peerConnection;

      if (call.peerConnection) {
        patchPeerConnectionForBitrate(call.peerConnection, bitrate);
      }

      const applyOptimizations = async () => {
        const pc = call.peerConnection;
        if (pc) {
          const transceivers = pc.getTransceivers();
          const videoTransceiver = transceivers.find(
            (t: RTCRtpTransceiver) => t.sender.track?.kind === "video"
          );
          if (videoTransceiver) {
            prioritizeVideoCodecs(videoTransceiver);
            await configureVideoSender(videoTransceiver.sender, bitrate, degradation);
          }
        }
      };

      applyOptimizations();
      setTimeout(applyOptimizations, 600);
      setTimeout(applyOptimizations, 2500);

      call.on("close", () => {
        screenCallRef.current = null;
      });
    } catch (err) {
      console.warn("[WebRTC] Error calling partner with screen:", err);
    }
  }, [bitrate, degradation, myRole, partnerPeerId]);

  // Handle incoming data channel messages
  const handleDataMessage = useCallback(
    (msg: DataChannelMessage) => {
      if (msg.type === "chat") {
        setChatMessages((prev) => [...prev, msg.payload]);
      } else if (msg.type === "reaction") {
        addReactionAnimation(msg.payload.emoji, msg.payload.sender);
      } else if (msg.type === "heartbeat") {
        lastHeartbeatReceivedRef.current = Date.now();
        setIsPartnerConnected(true);
        if (msg.payload.isSharing !== isPartnerSharing) {
          setIsPartnerSharing(msg.payload.isSharing);
        }
      } else if (msg.type === "stream-state") {
        setIsPartnerSharing(msg.payload.isSharing);
        if (!msg.payload.isSharing) {
          setRemoteScreenStream(null);
        } else if (!remoteScreenStream) {
          if (dataConnRef.current && dataConnRef.current.open) {
            dataConnRef.current.send(JSON.stringify({ type: "stream-request" }));
          }
        }
      } else if (msg.type === "stream-request") {
        if (localScreenStreamRef.current) {
          callPartnerWithScreenStream();
        }
      }
    },
    [addReactionAnimation, callPartnerWithScreenStream, isPartnerSharing, remoteScreenStream]
  );

  // Setup data connection handlers
  const setupDataConnection = useCallback(
    (conn: DataConnection) => {
      const handleOpen = () => {
        console.log("[WebRTC] DataConnection OPEN with", conn.peer);
        dataConnRef.current = conn;
        setIsPartnerConnected(true);
        isConnectingRef.current = false;
        lastHeartbeatReceivedRef.current = Date.now();

        // Send immediate heartbeat response
        try {
          conn.send(
            JSON.stringify({
              type: "heartbeat",
              payload: { sender: myRole, isSharing: isSharingScreenRef.current },
            })
          );
        } catch (e) {
          console.warn("Could not send initial heartbeat:", e);
        }

        // If we are currently sharing screen, call partner immediately
        if (localScreenStreamRef.current && peerRef.current) {
          callPartnerWithScreenStream();
        }

        // If we are currently speaking, call partner with mic stream
        if (localMicStreamRef.current && peerRef.current) {
          const call = peerRef.current.call(partnerPeerId, localMicStreamRef.current, {
            metadata: { type: "voice", role: myRole },
          });
          voiceCallRef.current = call;
          call.on("stream", (remoteStream: MediaStream) => {
            setRemoteVoiceStream(remoteStream);
          });
        }
      };

      if (conn.open) {
        handleOpen();
      } else {
        conn.on("open", handleOpen);
      }

      conn.on("data", (data) => {
        try {
          const parsed = typeof data === "string" ? JSON.parse(data) : data;
          handleDataMessage(parsed as DataChannelMessage);
        } catch (e) {
          console.warn("Invalid data message received:", e);
        }
      });

      conn.on("close", () => {
        console.log("[WebRTC] DataConnection CLOSED");
        if (dataConnRef.current === conn) {
          dataConnRef.current = null;
          setIsPartnerConnected(false);
        }
        isConnectingRef.current = false;
      });

      conn.on("error", (err) => {
        console.warn("[WebRTC] DataConnection error:", err);
        isConnectingRef.current = false;
      });
    },
    [callPartnerWithScreenStream, handleDataMessage, myRole, partnerPeerId]
  );

  // Connect to partner safely
  const connectToPartner = useCallback(() => {
    const peer = peerRef.current;
    if (!peer || peer.destroyed) return;
    if (dataConnRef.current && dataConnRef.current.open) return;
    if (isConnectingRef.current) return;

    isConnectingRef.current = true;
    console.log(`[WebRTC] Connecting to partner: ${partnerPeerId}`);

    try {
      const conn = peer.connect(partnerPeerId, {
        reliable: true,
      });
      setupDataConnection(conn);

      setTimeout(() => {
        isConnectingRef.current = false;
      }, 3500);
    } catch (err) {
      console.warn("[WebRTC] Connect attempt error:", err);
      isConnectingRef.current = false;
    }
  }, [partnerPeerId, setupDataConnection]);

  // Main Peer Lifecycle (Runs ONCE per myRole mount)
  useEffect(() => {
    let peerInstance: any = null;
    let isDisposed = false;

    const startPeer = async () => {
      if (isDisposed) return;

      try {
        const PeerModule = (await import("peerjs")).default;

        console.log(`[WebRTC] Starting Peer with ID: ${myPeerId}`);

        peerInstance = new PeerModule(myPeerId, {
          config: {
            iceServers: getIceServers(),
          },
          debug: 1,
        });

        peerRef.current = peerInstance;

        peerInstance.on("open", (id: string) => {
          if (isDisposed) return;
          console.log(`[WebRTC] Peer registered on server as: ${id}`);
          setIsPeerReady(true);
          // Attempt immediate connection to partner
          setTimeout(() => {
            if (!isDisposed) connectToPartner();
          }, 500);
        });

        // Incoming DataConnection from partner
        peerInstance.on("connection", (conn: DataConnection) => {
          if (isDisposed) return;
          console.log("[WebRTC] Received incoming DataConnection from:", conn.peer);
          setupDataConnection(conn);
        });

        // Incoming Call (Screen or Voice)
        peerInstance.on("call", async (call: MediaConnection) => {
          if (isDisposed) return;
          const metadata = call.metadata || {};
          console.log("[WebRTC] Incoming call:", metadata.type, "from", call.peer);

          if (metadata.type === "screen") {
            screenCallRef.current = call;
            activePeerConnectionRef.current = call.peerConnection;

            if (call.peerConnection) {
              patchPeerConnectionForBitrate(call.peerConnection, bitrate);
            }

            call.answer(); // Answer receive-only for video stream

            call.on("stream", (incomingStream: MediaStream) => {
              console.log("[WebRTC] Received remote screen stream!");
              setRemoteScreenStream(incomingStream);
              setIsPartnerSharing(true);
            });

            call.on("close", () => {
              console.log("[WebRTC] Remote screen call closed");
              setRemoteScreenStream(null);
              setIsPartnerSharing(false);
              screenCallRef.current = null;
            });
          } else {
            // Voice Call
            voiceCallRef.current = call;
            call.answer(localMicStreamRef.current || undefined);

            call.on("stream", (incomingVoiceStream: MediaStream) => {
              console.log("[WebRTC] Received remote voice stream!");
              setRemoteVoiceStream(incomingVoiceStream);
            });

            call.on("close", () => {
              setRemoteVoiceStream(null);
              voiceCallRef.current = null;
            });
          }
        });

        peerInstance.on("error", (err: any) => {
          if (err.type === "peer-unavailable") {
            setIsPartnerConnected(false);
          } else if (err.type === "unavailable-id") {
            console.warn(`[WebRTC] Peer ID "${myPeerId}" is temporarily in use. Retrying in 1.5s...`);
            if (peerInstance && !peerInstance.destroyed) {
              peerInstance.destroy();
            }
            setTimeout(() => {
              if (!isDisposed) {
                startPeer();
              }
            }, 1500);
          } else {
            console.warn("[WebRTC] Peer error:", err);
          }
        });

        peerInstance.on("disconnected", () => {
          console.log("[WebRTC] Peer disconnected from server. Reconnecting...");
          if (!isDisposed && peerInstance && !peerInstance.destroyed) {
            peerInstance.reconnect();
          }
        });
      } catch (err) {
        console.error("[WebRTC] Failed to initialize PeerJS:", err);
      }
    };

    startPeer();

    // Clean disconnect on page unload
    const handleUnload = () => {
      if (peerInstance && !peerInstance.destroyed) {
        peerInstance.destroy();
      }
    };
    window.addEventListener("beforeunload", handleUnload);

    // Reconnect on iOS Safari when switching tabs or unlocking phone
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("[WebRTC] App resumed to foreground on iOS/Mobile, checking connection...");
        if (peerInstance && peerInstance.disconnected && !peerInstance.destroyed) {
          peerInstance.reconnect();
        }
        if (!dataConnRef.current || !dataConnRef.current.open) {
          connectToPartner();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Continuous heartbeat & auto-discovery loop every 2.5s
    syncIntervalRef.current = setInterval(() => {
      if (isDisposed) return;

      if (dataConnRef.current && dataConnRef.current.open) {
        try {
          dataConnRef.current.send(
            JSON.stringify({
              type: "heartbeat",
              payload: { sender: myRole, isSharing: isSharingScreenRef.current },
            })
          );
        } catch (e) {
          console.warn("Heartbeat send error:", e);
        }

        if (
          lastHeartbeatReceivedRef.current > 0 &&
          Date.now() - lastHeartbeatReceivedRef.current > 12000
        ) {
          setIsPartnerConnected(false);
        }
      } else if (peerRef.current && !peerRef.current.destroyed) {
        // Not connected: periodically attempt connection to partner
        connectToPartner();
      }
    }, 2500);

    return () => {
      isDisposed = true;
      window.removeEventListener("beforeunload", handleUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      if (peerInstance && !peerInstance.destroyed) {
        peerInstance.destroy();
      }
      peerRef.current = null;
      dataConnRef.current = null;
      screenCallRef.current = null;
      voiceCallRef.current = null;
      setIsPeerReady(false);
      setIsPartnerConnected(false);
    };
  }, [connectToPartner, myPeerId, setupDataConnection]);

  // Realtime Stats monitoring
  useEffect(() => {
    statsIntervalRef.current = setInterval(async () => {
      const pc = activePeerConnectionRef.current;
      if (!pc) {
        setStats(null);
        return;
      }

      try {
        const reports = await pc.getStats();
        let currentWidth = 0;
        let currentHeight = 0;
        let currentFps = 0;
        let currentBytes = 0;
        let currentRtt = 0;
        let currentCodec = "H264";

        reports.forEach((report) => {
          if (report.type === "inbound-rtp" && report.kind === "video") {
            currentWidth = report.frameWidth || currentWidth;
            currentHeight = report.frameHeight || currentHeight;
            currentFps = report.framesPerSecond || currentFps;
            currentBytes = report.bytesReceived || currentBytes;
          }
          if (report.type === "outbound-rtp" && report.kind === "video") {
            currentWidth = report.frameWidth || currentWidth;
            currentHeight = report.frameHeight || currentHeight;
            currentFps = report.framesPerSecond || currentFps;
            currentBytes = report.bytesSent || currentBytes;
          }
          if (
            report.type === "candidate-pair" &&
            (report.state === "succeeded" || report.nominated)
          ) {
            currentRtt = Math.round((report.currentRoundTripTime || 0) * 1000);
          }
          if (report.type === "codec") {
            currentCodec = report.mimeType?.replace("video/", "") || currentCodec;
          }
        });

        const now = Date.now();
        let calculatedBitrate = 0;
        if (prevTimestampRef.current > 0 && currentBytes > prevBytesRef.current) {
          const timeDiff = (now - prevTimestampRef.current) / 1000;
          const bytesDiff = currentBytes - prevBytesRef.current;
          calculatedBitrate = Number(((bytesDiff * 8) / (timeDiff * 1_000_000)).toFixed(1));
        }

        prevBytesRef.current = currentBytes;
        prevTimestampRef.current = now;

        const resStr =
          currentWidth && currentHeight ? `${currentWidth}x${currentHeight}` : "2560x1440";

        setStats({
          resolution: resStr,
          fps: currentFps || 60,
          bitrateMbps: calculatedBitrate || bitrate,
          pingMs: currentRtt || 12,
          codec: currentCodec,
        });
      } catch (e) {
        console.warn("Stats error:", e);
      }
    }, 1000);

    return () => {
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    };
  }, [bitrate]);

  // Start Screen Sharing with Multi-Tier Fallback (Prevents OverconstrainedError)
  const startScreenShare = useCallback(
    async (
      targetBitrate: BitrateTier = bitrate,
      targetDegradation: DegradationPreference = degradation
    ) => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
        alert(
          "Trình duyệt hoặc thiết bị này không hỗ trợ chia sẻ màn hình trực tiếp. Bạn hãy dùng máy tính để phát và điện thoại để xem!"
        );
        return;
      }

      let stream: MediaStream | null = null;

      // Tier 1: High Profile Cinema with Ideal bounds (NEVER min to avoid OverconstrainedError)
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const displayMediaOptions: any = {
          video: {
            width: { ideal: 2560, max: 3840 },
            height: { ideal: 1440, max: 2160 },
            frameRate: { ideal: 60, max: 60 },
            cursor: "motion",
          },
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            sampleRate: 48000,
            channelCount: 2,
          },
        };
        stream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
      } catch (err: any) {
        if (err.name === "NotAllowedError" || err.name === "AbortError") {
          console.log("User dismissed screen share picker");
          return;
        }

        console.warn("High-profile getDisplayMedia failed, falling back to standard profile:", err);

        // Tier 2: Standard Profile with audio
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true,
          });
        } catch (tier2Err: any) {
          if (tier2Err.name === "NotAllowedError" || tier2Err.name === "AbortError") {
            return;
          }

          // Tier 3: Basic Video-only
          try {
            stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
          } catch (tier3Err) {
            console.error("All screen share attempts failed:", tier3Err);
            return;
          }
        }
      }

      if (!stream) return;

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && "contentHint" in videoTrack) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (videoTrack as any).contentHint = "motion";
      }

      setLocalScreenStream(stream);
      localScreenStreamRef.current = stream;
      setIsSharingScreen(true);
      isSharingScreenRef.current = true;

      // Broadcast screen call to partner
      callPartnerWithScreenStream();

      // Notify partner via data channel
      if (dataConnRef.current && dataConnRef.current.open) {
        dataConnRef.current.send(
          JSON.stringify({
            type: "stream-state",
            payload: { isSharing: true },
          })
        );
      }

      videoTrack.onended = () => {
        stopScreenShare();
      };
    },
    [bitrate, callPartnerWithScreenStream, degradation]
  );

  // Stop Screen Sharing
  const stopScreenShare = useCallback(() => {
    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach((track) => track.stop());
      localScreenStreamRef.current = null;
    }
    setLocalScreenStream(null);

    if (screenCallRef.current) {
      screenCallRef.current.close();
      screenCallRef.current = null;
    }
    activePeerConnectionRef.current = null;
    setIsSharingScreen(false);
    isSharingScreenRef.current = false;
    setStats(null);

    if (dataConnRef.current && dataConnRef.current.open) {
      dataConnRef.current.send(
        JSON.stringify({
          type: "stream-state",
          payload: { isSharing: false },
        })
      );
    }
  }, []);

  // Toggle Mic
  const toggleMic = useCallback(async () => {
    if (!localMicStreamRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });

        setLocalMicStream(stream);
        localMicStreamRef.current = stream;
        setIsMicMuted(false);

        // Initiate voice call to partner if ready
        if (peerRef.current) {
          const call = peerRef.current.call(partnerPeerId, stream, {
            metadata: { type: "voice", role: myRole },
          });
          voiceCallRef.current = call;

          call.on("stream", (remoteStream: MediaStream) => {
            setRemoteVoiceStream(remoteStream);
          });
        }
      } catch (err) {
        console.warn("Mic access error:", err);
      }
      return;
    }

    const audioTrack = localMicStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMicMuted(!audioTrack.enabled);
    }
  }, [myRole, partnerPeerId]);

  // Send Chat message
  const sendChatMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return;

      const newMsg: ChatMessage = {
        id: `${Date.now()}-${Math.random()}`,
        sender: myRole,
        text: text.trim(),
        timestamp: Date.now(),
      };

      setChatMessages((prev) => [...prev, newMsg]);

      if (dataConnRef.current && dataConnRef.current.open) {
        dataConnRef.current.send(
          JSON.stringify({
            type: "chat",
            payload: newMsg,
          })
        );
      }
    },
    [myRole]
  );

  // Send Floating Reaction
  const sendReaction = useCallback(
    (emoji: string) => {
      addReactionAnimation(emoji, myRole);

      if (dataConnRef.current && dataConnRef.current.open) {
        dataConnRef.current.send(
          JSON.stringify({
            type: "reaction",
            payload: { emoji, sender: myRole },
          })
        );
      }
    },
    [addReactionAnimation, myRole]
  );

  // Force Reconnect
  const reconnect = useCallback(() => {
    if (dataConnRef.current) {
      dataConnRef.current.close();
      dataConnRef.current = null;
    }
    isConnectingRef.current = false;
    connectToPartner();
  }, [connectToPartner]);

  return {
    isPeerReady,
    isPartnerConnected,
    isSharingScreen,
    isPartnerSharing,
    localScreenStream,
    remoteScreenStream,
    localMicStream,
    remoteVoiceStream,
    isMicMuted,
    toggleMic,
    startScreenShare,
    stopScreenShare,
    chatMessages,
    sendChatMessage,
    reactions,
    sendReaction,
    stats,
    bitrate,
    setBitrate,
    degradation,
    setDegradation,
    reconnect,
    myPeerId,
    partnerPeerId,
  };
}
