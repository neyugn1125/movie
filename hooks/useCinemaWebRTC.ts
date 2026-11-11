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
  installGlobalH264AndBitrateInterceptor,
} from "@/utils/webrtcConfig";

interface UseCinemaWebRTCProps {
  myRole: UserRole;
}

export function useCinemaWebRTC({ myRole }: UseCinemaWebRTCProps) {
  const partnerRole: UserRole = myRole === "nguyen" ? "crabie" : "nguyen";

  // Connection states
  const [isPeerReady, setIsPeerReady] = useState(false);
  const [isPartnerConnected, setIsPartnerConnected] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [isPartnerSharing, setIsPartnerSharing] = useState(false);
  const [connectionStatusText, setConnectionStatusText] = useState("Đang kết nối rạp phim...");

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
  const outgoingVoiceCallRef = useRef<MediaConnection | null>(null);
  const incomingVoiceCallRef = useRef<MediaConnection | null>(null);
  const activePeerConnectionRef = useRef<RTCPeerConnection | null>(null);

  const currentMyPeerIdRef = useRef<string>(getPeerIdForRole(myRole));
  const partnerActualPeerIdRef = useRef<string>(getPeerIdForRole(partnerRole));

  const localMicStreamRef = useRef<MediaStream | null>(null);
  const localScreenStreamRef = useRef<MediaStream | null>(null);
  const remoteScreenStreamRef = useRef<MediaStream | null>(null);
  const isSharingScreenRef = useRef<boolean>(false);
  const isPartnerSharingRef = useRef<boolean>(false);
  const isConnectingRef = useRef<boolean>(false);

  const bitrateRef = useRef<BitrateTier>(15);
  const degradationRef = useRef<DegradationPreference>("maintain-framerate");

  // Stats & Deduplication refs
  const prevBytesRef = useRef<number>(0);
  const prevTimestampRef = useRef<number>(0);
  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastHeartbeatReceivedRef = useRef<number>(0);
  const lastScreenCallTimestampRef = useRef<number>(0);
  const needsStreamRequestRef = useRef<boolean>(false);
  const processedReactionIdsRef = useRef<Set<string>>(new Set());

  // Sync state to refs
  useEffect(() => {
    localMicStreamRef.current = localMicStream;
  }, [localMicStream]);

  useEffect(() => {
    localScreenStreamRef.current = localScreenStream;
  }, [localScreenStream]);

  useEffect(() => {
    remoteScreenStreamRef.current = remoteScreenStream;
  }, [remoteScreenStream]);

  useEffect(() => {
    isSharingScreenRef.current = isSharingScreen;
  }, [isSharingScreen]);

  useEffect(() => {
    isPartnerSharingRef.current = isPartnerSharing;
  }, [isPartnerSharing]);

  useEffect(() => {
    bitrateRef.current = bitrate;
    degradationRef.current = degradation;

    // Dynamically update active video sender if already sharing
    const pc = activePeerConnectionRef.current;
    if (pc && isSharingScreenRef.current) {
      const transceivers = pc.getTransceivers?.() || [];
      const videoTransceiver = transceivers.find(
        (t: RTCRtpTransceiver) => t.sender?.track?.kind === "video"
      );
      if (videoTransceiver) {
        configureVideoSender(videoTransceiver.sender, bitrate, degradation);
      }
    }
  }, [bitrate, degradation]);

  useEffect(() => {
    installGlobalH264AndBitrateInterceptor(() => bitrateRef.current);
  }, []);

  // Trigger floating reaction locally with deduplication
  const addReactionAnimation = useCallback(
    (emoji: string, sender: UserRole, customId?: string) => {
      const reactionId = customId || `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      if (processedReactionIdsRef.current.has(reactionId)) return;
      processedReactionIdsRef.current.add(reactionId);

      const newReaction: FloatingReaction = {
        id: reactionId,
        emoji,
        sender,
        xPercent: Math.floor(Math.random() * 70) + 15,
      };
      setReactions((prev) => [...prev, newReaction]);

      setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.id !== reactionId));
      }, 2600);
    },
    []
  );

  // Call partner with current screen stream if sharing
  const callPartnerWithScreenStream = useCallback(
    (targetPeerId?: string, forceCall: boolean = false) => {
      const peer = peerRef.current;
      const stream = localScreenStreamRef.current;
      if (!peer || peer.destroyed || !stream) return;

      const now = Date.now();
      if (!forceCall && now - lastScreenCallTimestampRef.current < 4500) {
        console.log("[WebRTC] Call skipped: debounce active to let WebRTC ICE establish");
        return;
      }
      lastScreenCallTimestampRef.current = now;

      const destId =
        targetPeerId || partnerActualPeerIdRef.current || getPeerIdForRole(partnerRole);
      console.log(`[WebRTC] Initiating video screen call to: ${destId}`);

      try {
        if (screenCallRef.current) {
          try {
            screenCallRef.current.close();
          } catch (e) {
            console.warn("Could not close previous screen call:", e);
          }
          screenCallRef.current = null;
        }

        const currentBitrate = bitrateRef.current;
        const currentDegradation = degradationRef.current;

        const call = peer.call(destId, stream, {
          metadata: { type: "screen", role: myRole },
        });

        if (!call) return;

        screenCallRef.current = call;
        activePeerConnectionRef.current = call.peerConnection;

        if (call.peerConnection) {
          patchPeerConnectionForBitrate(call.peerConnection, currentBitrate);
        }

        const applyOptimizations = async () => {
          const pc = call.peerConnection;
          if (pc && pc.getTransceivers) {
            const transceivers = pc.getTransceivers();
            const videoTransceiver = transceivers.find(
              (t: RTCRtpTransceiver) => t.sender?.track?.kind === "video"
            );
            if (videoTransceiver) {
              prioritizeVideoCodecs(videoTransceiver);
              await configureVideoSender(
                videoTransceiver.sender,
                bitrateRef.current,
                degradationRef.current
              );
            }
          }
        };

        applyOptimizations();
        setTimeout(applyOptimizations, 800);
        setTimeout(applyOptimizations, 2500);

        call.on("close", () => {
          if (screenCallRef.current === call) {
            screenCallRef.current = null;
          }
        });
      } catch (err) {
        console.warn("[WebRTC] Error calling partner with screen:", err);
      }
    },
    [myRole, partnerRole]
  );

  // Handle incoming data channel messages
  const handleDataMessage = useCallback(
    (msg: DataChannelMessage) => {
      if (msg.type === "chat") {
        setChatMessages((prev) => {
          if (prev.some((m) => m.id === msg.payload.id)) return prev;
          return [...prev, msg.payload];
        });
      } else if (msg.type === "reaction") {
        addReactionAnimation(msg.payload.emoji, msg.payload.sender);
      } else if (msg.type === "heartbeat") {
        lastHeartbeatReceivedRef.current = Date.now();
        setIsPartnerConnected(true);
        if (msg.payload.isSharing !== isPartnerSharingRef.current) {
          setIsPartnerSharing(msg.payload.isSharing);
        }
      } else if (msg.type === "stream-state") {
        setIsPartnerSharing(msg.payload.isSharing);
        if (!msg.payload.isSharing) {
          setRemoteScreenStream(null);
        } else if (!remoteScreenStreamRef.current) {
          if (dataConnRef.current && dataConnRef.current.open) {
            dataConnRef.current.send(JSON.stringify({ type: "stream-request" }));
          }
        }
      } else if (msg.type === "stream-request") {
        if (localScreenStreamRef.current) {
          callPartnerWithScreenStream(undefined, true);
        }
      }
    },
    [addReactionAnimation, callPartnerWithScreenStream]
  );

  // Setup data connection handlers
  const setupDataConnection = useCallback(
    (conn: DataConnection) => {
      const handleOpen = () => {
        console.log("[WebRTC] DataConnection OPEN with", conn.peer);
        dataConnRef.current = conn;
        partnerActualPeerIdRef.current = conn.peer;
        setIsPartnerConnected(true);
        setConnectionStatusText(
          `Đã kết nối với ${partnerRole === "nguyen" ? "Nguyen" : "Crabie"}`
        );
        isConnectingRef.current = false;
        lastHeartbeatReceivedRef.current = Date.now();

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

        if (localScreenStreamRef.current && peerRef.current) {
          callPartnerWithScreenStream(conn.peer, true);
        }

        if (localMicStreamRef.current && peerRef.current) {
          const call = peerRef.current.call(conn.peer, localMicStreamRef.current, {
            metadata: { type: "voice", role: myRole },
          });
          if (call) {
            outgoingVoiceCallRef.current = call;
            call.on("stream", (remoteStream: MediaStream) => {
              setRemoteVoiceStream(remoteStream);
            });
          }
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
        }
        isConnectingRef.current = false;
      });

      conn.on("error", (err) => {
        console.warn("[WebRTC] DataConnection error:", err);
        isConnectingRef.current = false;
      });
    },
    [callPartnerWithScreenStream, handleDataMessage, myRole, partnerRole]
  );

  // Connect to partner safely
  const connectToPartner = useCallback(
    (overrideTargetId?: string) => {
      const peer = peerRef.current;
      if (!peer || peer.destroyed || peer.disconnected) return;
      if (dataConnRef.current && dataConnRef.current.open) return;
      if (isConnectingRef.current) return;

      const targetPeerId =
        overrideTargetId || partnerActualPeerIdRef.current || getPeerIdForRole(partnerRole);

      if (!targetPeerId || targetPeerId === currentMyPeerIdRef.current) return;

      isConnectingRef.current = true;
      console.log(`[WebRTC] Connecting to partner: ${targetPeerId}`);

      try {
        const conn = peer.connect(targetPeerId, {
          reliable: true,
        });
        if (conn) {
          setupDataConnection(conn);
        }

        setTimeout(() => {
          isConnectingRef.current = false;
        }, 3000);
      } catch (err) {
        console.warn("[WebRTC] Connect attempt error:", err);
        isConnectingRef.current = false;
      }
    },
    [partnerRole, setupDataConnection]
  );

  // Keep latest callbacks in refs so main Peer useEffect NEVER re-runs and destroys Peer
  const callPartnerRef = useRef(callPartnerWithScreenStream);
  const connectToPartnerRef = useRef(connectToPartner);
  const setupDataConnectionRef = useRef(setupDataConnection);
  const addReactionAnimationRef = useRef(addReactionAnimation);

  useEffect(() => {
    callPartnerRef.current = callPartnerWithScreenStream;
    connectToPartnerRef.current = connectToPartner;
    setupDataConnectionRef.current = setupDataConnection;
    addReactionAnimationRef.current = addReactionAnimation;
  }, [
    callPartnerWithScreenStream,
    connectToPartner,
    setupDataConnection,
    addReactionAnimation,
  ]);

  // Main Peer Lifecycle — Runs STRICTLY ONCE per role mount
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let peerInstance: any = null;
    let isDisposed = false;

    const startPeer = async (customId?: string) => {
      if (isDisposed) return;

      try {
        const PeerModule = (await import("peerjs")).default;
        const targetId = customId || getPeerIdForRole(myRole);

        console.log(`[WebRTC] Starting Peer with ID: ${targetId}`);
        setConnectionStatusText("Đang kết nối rạp phim...");

        peerInstance = new PeerModule(targetId, {
          config: {
            iceServers: getIceServers(),
          },
          debug: 1,
        });

        peerRef.current = peerInstance;

        peerInstance.on("open", (id: string) => {
          if (isDisposed) return;
          console.log(`[WebRTC] Peer registered on server as: ${id}`);
          currentMyPeerIdRef.current = id;
          setIsPeerReady(true);
          setConnectionStatusText("Đang chờ đối phương vào rạp...");

          // 1. Immediately try connecting to default partner fixed ID
          connectToPartnerRef.current(getPeerIdForRole(partnerRole));

          // 2. Also announce online peer ID to serverless hub
          fetch("/api/cinema-signal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              role: myRole,
              peerId: id,
              isSharing: isSharingScreenRef.current,
            }),
          })
            .then((res) => res.json())
            .then((data) => {
              if (data?.partner?.peerId) {
                partnerActualPeerIdRef.current = data.partner.peerId;
                connectToPartnerRef.current(data.partner.peerId);
              }
            })
            .catch(() => {});
        });

        // Incoming DataConnection from partner
        peerInstance.on("connection", (conn: DataConnection) => {
          if (isDisposed) return;
          console.log("[WebRTC] Received incoming DataConnection from:", conn.peer);
          setupDataConnectionRef.current(conn);
        });

        // Incoming Call (Screen or Voice)
        peerInstance.on("call", async (call: MediaConnection) => {
          if (isDisposed) return;
          const metadata = call.metadata || {};
          console.log("[WebRTC] Incoming call:", metadata.type, "from", call.peer);

          if (metadata.type === "screen") {
            if (screenCallRef.current && screenCallRef.current !== call) {
              try {
                screenCallRef.current.close();
              } catch (e) {}
            }
            screenCallRef.current = call;
            activePeerConnectionRef.current = call.peerConnection;

            const pc = call.peerConnection;
            if (pc && pc.addEventListener) {
              const composedStream = new MediaStream();
              pc.addEventListener("track", (event: RTCTrackEvent) => {
                console.log("[WebRTC] Native track event received:", event.track.kind);
                composedStream.addTrack(event.track);

                const streamToSet =
                  event.streams && event.streams[0]
                    ? event.streams[0]
                    : composedStream;

                setRemoteScreenStream(streamToSet);
                setIsPartnerSharing(true);
              });
            }

            call.answer();

            call.on("stream", (incomingStream: MediaStream) => {
              console.log("[WebRTC] PeerJS call.on('stream') received remote screen stream!");
              setRemoteScreenStream(incomingStream);
              setIsPartnerSharing(true);
            });

            call.on("close", () => {
              console.log("[WebRTC] Remote screen call closed");
              setRemoteScreenStream(null);
              if (screenCallRef.current === call) {
                screenCallRef.current = null;
              }
            });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            call.on("error", (err: any) => {
              console.warn("[WebRTC] Remote screen call error:", err);
            });
          } else {
            incomingVoiceCallRef.current = call;
            call.answer(localMicStreamRef.current || undefined);

            call.on("stream", (incomingVoiceStream: MediaStream) => {
              console.log("[WebRTC] Received remote voice stream!");
              setRemoteVoiceStream(new MediaStream(incomingVoiceStream.getTracks()));
            });

            call.on("close", () => {
              setRemoteVoiceStream(null);
              if (incomingVoiceCallRef.current === call) {
                incomingVoiceCallRef.current = null;
              }
            });
          }
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        peerInstance.on("error", (err: any) => {
          if (err.type === "peer-unavailable") {
            isConnectingRef.current = false;
          } else if (err.type === "unavailable-id") {
            console.warn(`[WebRTC] Peer ID "${targetId}" in use. Auto-generating fresh unique ID...`);
            if (peerInstance && !peerInstance.destroyed) {
              peerInstance.destroy();
            }
            const uniqueId = `nc-${myRole}-${Math.random().toString(36).substring(2, 8)}`;
            currentMyPeerIdRef.current = uniqueId;
            setTimeout(() => {
              if (!isDisposed) {
                startPeer(uniqueId);
              }
            }, 600);
          } else {
            console.warn("[WebRTC] Peer error:", err);
            isConnectingRef.current = false;
          }
        });

        peerInstance.on("disconnected", () => {
          console.log("[WebRTC] Peer disconnected from signaling server. Reconnecting...");
          if (!isDisposed && peerInstance && !peerInstance.destroyed) {
            peerInstance.reconnect();
          }
        });
      } catch (err) {
        console.error("[WebRTC] Failed to initialize PeerJS:", err);
      }
    };

    startPeer();

    const handleUnload = () => {
      if (peerInstance && !peerInstance.destroyed) {
        peerInstance.destroy();
      }
    };
    window.addEventListener("beforeunload", handleUnload);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (peerInstance && peerInstance.disconnected && !peerInstance.destroyed) {
          peerInstance.reconnect();
        }
        if (partnerActualPeerIdRef.current) {
          connectToPartnerRef.current(partnerActualPeerIdRef.current);
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Continuous Dual-Sync Loop every 1.8s
    syncIntervalRef.current = setInterval(async () => {
      if (isDisposed) return;

      // 1. Direct DataConnection Heartbeat (if P2P is established)
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
      } else {
        // Fallback: If DataChannel is not open, attempt connecting to default fixed ID
        connectToPartnerRef.current(partnerActualPeerIdRef.current || getPeerIdForRole(partnerRole));
      }

      // 2. Serverless Signal Hub Sync
      try {
        const shouldRequestScreen = needsStreamRequestRef.current;
        needsStreamRequestRef.current = false;

        const res = await fetch("/api/cinema-signal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: myRole,
            peerId: currentMyPeerIdRef.current,
            isSharing: isSharingScreenRef.current,
            requestScreen: shouldRequestScreen,
          }),
        });
        const data = await res.json();

        if (data?.partner) {
          const {
            peerId: pPeerId,
            isOnline: pOnline,
            isSharing: pSharing,
            requestScreen: pRequestedScreen,
          } = data.partner;

          if (pOnline) {
            setIsPartnerConnected(true);
            setConnectionStatusText(
              `Đã kết nối với ${partnerRole === "nguyen" ? "Nguyen" : "Crabie"}`
            );

            if (pPeerId && pPeerId !== partnerActualPeerIdRef.current) {
              partnerActualPeerIdRef.current = pPeerId;
            }

            if (!dataConnRef.current || !dataConnRef.current.open) {
              if (pPeerId) {
                connectToPartnerRef.current(pPeerId);
              }
            }

            if (pSharing !== isPartnerSharingRef.current) {
              setIsPartnerSharing(pSharing);
            }

            if (isSharingScreenRef.current && localScreenStreamRef.current && pPeerId) {
              if (pRequestedScreen) {
                callPartnerRef.current(pPeerId, true);
              } else if (!screenCallRef.current) {
                callPartnerRef.current(pPeerId, false);
              }
            }
          } else {
            if (!dataConnRef.current?.open) {
              const timeSinceLastHb = Date.now() - lastHeartbeatReceivedRef.current;
              if (timeSinceLastHb > 10000) {
                setIsPartnerConnected(false);
                setConnectionStatusText(
                  `Đang chờ ${partnerRole === "nguyen" ? "Nguyen" : "Crabie"} vào rạp...`
                );
              }
            }
          }
        }

        // Sync room messages from serverless hub
        if (data?.messages && Array.isArray(data.messages)) {
          setChatMessages((prev) => {
            const map = new Map<string, ChatMessage>();
            prev.forEach((m) => map.set(m.id, m));
            data.messages.forEach((m: ChatMessage) => map.set(m.id, m));
            return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
          });
        }

        // Sync recent reactions from serverless hub
        if (data?.recentReactions && Array.isArray(data.recentReactions)) {
          data.recentReactions.forEach((r: FloatingReaction) => {
            if (r.sender !== myRole) {
              addReactionAnimationRef.current(r.emoji, r.sender, r.id);
            }
          });
        }
      } catch (err) {
        console.warn("Signal hub sync error:", err);
      }
    }, 1800);

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
      outgoingVoiceCallRef.current = null;
      incomingVoiceCallRef.current = null;
      setIsPeerReady(false);
      setIsPartnerConnected(false);
    };
  }, [myRole, partnerRole]);

  // Realtime Stats monitoring (Matches exact active video RTP codecId)
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
        let activeVideoCodecId = "";
        let currentCodec = "H264";

        reports.forEach((report) => {
          if (report.type === "inbound-rtp" && report.kind === "video") {
            currentWidth = report.frameWidth || currentWidth;
            currentHeight = report.frameHeight || currentHeight;
            currentFps = report.framesPerSecond || currentFps;
            currentBytes = report.bytesReceived || currentBytes;
            if (report.codecId) {
              activeVideoCodecId = report.codecId;
            }
          }
          if (report.type === "outbound-rtp" && report.kind === "video") {
            currentWidth = report.frameWidth || currentWidth;
            currentHeight = report.frameHeight || currentHeight;
            currentFps = report.framesPerSecond || currentFps;
            currentBytes = report.bytesSent || currentBytes;
            if (report.codecId) {
              activeVideoCodecId = report.codecId;
            }
          }
          if (
            report.type === "candidate-pair" &&
            (report.state === "succeeded" || report.nominated)
          ) {
            currentRtt = Math.round((report.currentRoundTripTime || 0) * 1000);
          }
        });

        // Look up the exact codec report bound to the active video RTP stream
        if (activeVideoCodecId && reports.has(activeVideoCodecId)) {
          const codecReport = reports.get(activeVideoCodecId);
          if (codecReport && codecReport.mimeType) {
            currentCodec = codecReport.mimeType.replace(/^video\//i, "").toUpperCase();
          }
        }

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
          fps: Math.round(currentFps) || 60,
          bitrateMbps: calculatedBitrate || bitrateRef.current,
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
  }, []);

  // Start Screen Sharing with Multi-Tier Fallback
  const startScreenShare = useCallback(
    async (
      targetBitrate: BitrateTier = bitrateRef.current,
      targetDegradation: DegradationPreference = degradationRef.current
    ) => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
        alert(
          "Trình duyệt hoặc thiết bị này không hỗ trợ chia sẻ màn hình trực tiếp. Bạn hãy dùng máy tính để phát và điện thoại để xem!"
        );
        return;
      }

      // Save chosen bitrate & degradation preference immediately
      setBitrate(targetBitrate);
      setDegradation(targetDegradation);
      bitrateRef.current = targetBitrate;
      degradationRef.current = targetDegradation;

      let stream: MediaStream | null = null;

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
          return;
        }

        try {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true,
          });
        } catch (tier2Err: any) {
          if (tier2Err.name === "NotAllowedError" || tier2Err.name === "AbortError") {
            return;
          }

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

      // Broadcast screen call to partner immediately
      callPartnerWithScreenStream(undefined, true);

      // Notify partner via data channel & serverless hub
      if (dataConnRef.current && dataConnRef.current.open) {
        dataConnRef.current.send(
          JSON.stringify({
            type: "stream-state",
            payload: { isSharing: true },
          })
        );
      }

      fetch("/api/cinema-signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: myRole,
          peerId: currentMyPeerIdRef.current,
          isSharing: true,
        }),
      }).catch(() => {});

      videoTrack.onended = () => {
        stopScreenShare();
      };
    },
    [callPartnerWithScreenStream, myRole]
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

    fetch("/api/cinema-signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: myRole,
        peerId: currentMyPeerIdRef.current,
        isSharing: false,
      }),
    }).catch(() => {});
  }, [myRole]);

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

        if (peerRef.current && !peerRef.current.destroyed) {
          const targetPeerId =
            partnerActualPeerIdRef.current || getPeerIdForRole(partnerRole);
          const call = peerRef.current.call(targetPeerId, stream, {
            metadata: { type: "voice", role: myRole },
          });
          if (call) {
            outgoingVoiceCallRef.current = call;
            call.on("stream", (remoteStream: MediaStream) => {
              setRemoteVoiceStream(new MediaStream(remoteStream.getTracks()));
            });
          }
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
  }, [myRole, partnerRole]);

  // Send Chat message
  const sendChatMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return;

      const newMsg: ChatMessage = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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

      fetch("/api/cinema-signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: myRole,
          peerId: currentMyPeerIdRef.current,
          isSharing: isSharingScreenRef.current,
          newMessage: newMsg,
        }),
      }).catch((e) => {
        console.warn("Message sync error:", e);
      });
    },
    [myRole]
  );

  // Send Floating Reaction
  const sendReaction = useCallback(
    (emoji: string) => {
      const reactionId = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      addReactionAnimation(emoji, myRole, reactionId);

      if (dataConnRef.current && dataConnRef.current.open) {
        dataConnRef.current.send(
          JSON.stringify({
            type: "reaction",
            payload: { emoji, sender: myRole },
          })
        );
      }

      fetch("/api/cinema-signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: myRole,
          peerId: currentMyPeerIdRef.current,
          isSharing: isSharingScreenRef.current,
          newReaction: { id: reactionId, emoji, sender: myRole, xPercent: 50 },
        }),
      }).catch(() => {});
    },
    [addReactionAnimation, myRole]
  );

  // Force Reconnect
  const reconnect = useCallback(() => {
    if (dataConnRef.current) {
      try {
        dataConnRef.current.close();
      } catch (e) {}
      dataConnRef.current = null;
    }
    isConnectingRef.current = false;
    if (peerRef.current && peerRef.current.disconnected && !peerRef.current.destroyed) {
      peerRef.current.reconnect();
    }
    connectToPartner();
    if (localScreenStreamRef.current) {
      callPartnerWithScreenStream(undefined, true);
    }
  }, [callPartnerWithScreenStream, connectToPartner]);

  // Manually Request Screen Stream
  const requestScreenStream = useCallback(() => {
    console.log("[WebRTC] Manually requesting screen stream from partner...");
    needsStreamRequestRef.current = true;
    if (dataConnRef.current && dataConnRef.current.open) {
      try {
        dataConnRef.current.send(JSON.stringify({ type: "stream-request" }));
      } catch (e) {
        console.warn("DataChannel send stream-request error:", e);
      }
    } else {
      connectToPartner();
    }
    fetch("/api/cinema-signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: myRole,
        peerId: currentMyPeerIdRef.current,
        isSharing: isSharingScreenRef.current,
        requestScreen: true,
      }),
    }).catch(() => {});
  }, [connectToPartner, myRole]);

  return {
    isPeerReady,
    isPartnerConnected,
    connectionStatusText,
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
    requestScreenStream,
    myPeerId: currentMyPeerIdRef.current,
    partnerPeerId: partnerActualPeerIdRef.current,
  };
}
