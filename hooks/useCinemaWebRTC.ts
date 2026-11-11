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
  const voiceCallRef = useRef<MediaConnection | null>(null);
  const activePeerConnectionRef = useRef<RTCPeerConnection | null>(null);

  const currentMyPeerIdRef = useRef<string>(getPeerIdForRole(myRole));
  const partnerActualPeerIdRef = useRef<string>(getPeerIdForRole(partnerRole));

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
  const lastScreenCallTimestampRef = useRef<number>(0);
  const needsStreamRequestRef = useRef<boolean>(false);

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
  const callPartnerWithScreenStream = useCallback(
    (targetPeerId?: string) => {
      const peer = peerRef.current;
      const stream = localScreenStreamRef.current;
      if (!peer || !stream) return;

      const now = Date.now();
      // Debounce: prevent rapid re-calling which resets ICE negotiation before connection establishes
      if (now - lastScreenCallTimestampRef.current < 6000) {
        console.log("[WebRTC] Call skipped: 6s debounce active to let WebRTC ICE establish");
        return;
      }
      lastScreenCallTimestampRef.current = now;

      const destId = targetPeerId || partnerActualPeerIdRef.current || getPeerIdForRole(partnerRole);
      console.log(`[WebRTC] Initiating video screen call to: ${destId}`);

      try {
        // Clean up any stale prior screen call before initiating a fresh one
        if (screenCallRef.current) {
          try {
            screenCallRef.current.close();
          } catch (e) {
            console.warn("Could not close previous screen call:", e);
          }
          screenCallRef.current = null;
        }

        const call = peer.call(destId, stream, {
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
        setTimeout(applyOptimizations, 800);
        setTimeout(applyOptimizations, 3000);

        call.on("close", () => {
          if (screenCallRef.current === call) {
            screenCallRef.current = null;
          }
        });
      } catch (err) {
        console.warn("[WebRTC] Error calling partner with screen:", err);
      }
    },
    [bitrate, degradation, myRole, partnerRole]
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
        partnerActualPeerIdRef.current = conn.peer;
        setIsPartnerConnected(true);
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
          callPartnerWithScreenStream(conn.peer);
        }

        if (localMicStreamRef.current && peerRef.current) {
          const call = peerRef.current.call(conn.peer, localMicStreamRef.current, {
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
        }
        isConnectingRef.current = false;
      });

      conn.on("error", (err) => {
        console.warn("[WebRTC] DataConnection error:", err);
        isConnectingRef.current = false;
      });
    },
    [callPartnerWithScreenStream, handleDataMessage, myRole]
  );

  // Connect to partner safely
  const connectToPartner = useCallback(
    (overrideTargetId?: string) => {
      const peer = peerRef.current;
      if (!peer || peer.destroyed) return;
      if (dataConnRef.current && dataConnRef.current.open) return;
      if (isConnectingRef.current) return;

      const targetPeerId =
        overrideTargetId || partnerActualPeerIdRef.current || getPeerIdForRole(partnerRole);

      isConnectingRef.current = true;
      console.log(`[WebRTC] Connecting to partner: ${targetPeerId}`);

      try {
        const conn = peer.connect(targetPeerId, {
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
    },
    [partnerRole, setupDataConnection]
  );

  // Main Peer Lifecycle (Runs ONCE per myRole mount)
  useEffect(() => {
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

          // Announce online peer ID to serverless hub
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
                connectToPartner(data.partner.peerId);
              }
            })
            .catch(() => {});
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
            if (screenCallRef.current && screenCallRef.current !== call) {
              try {
                screenCallRef.current.close();
              } catch (e) {}
            }
            screenCallRef.current = call;
            activePeerConnectionRef.current = call.peerConnection;

            // Direct native RTCPeerConnection track event (essential fallback for iOS 17 Safari & Multi-track)
            const pc = call.peerConnection;
            if (pc && pc.addEventListener) {
              const composedStream = new MediaStream();
              pc.addEventListener("track", (event: RTCTrackEvent) => {
                console.log("[WebRTC] Native track event received:", event.track.kind, event.streams);
                composedStream.addTrack(event.track);

                const tracksToUse =
                  event.streams && event.streams[0]
                    ? event.streams[0].getTracks()
                    : composedStream.getTracks();

                // Always instantiate a new MediaStream so React state detects update and re-binds video element
                setRemoteScreenStream(new MediaStream(tracksToUse));
                setIsPartnerSharing(true);
              });
            }

            // Note: Never mutate Answer SDP on receiver side to maintain iOS WebKit compatibility
            call.answer();

            call.on("stream", (incomingStream: MediaStream) => {
              console.log("[WebRTC] PeerJS call.on('stream') received remote screen stream!");
              setRemoteScreenStream(new MediaStream(incomingStream.getTracks()));
              setIsPartnerSharing(true);
            });

            call.on("close", () => {
              console.log("[WebRTC] Remote screen call closed");
              setRemoteScreenStream(null);
              if (screenCallRef.current === call) {
                screenCallRef.current = null;
              }
            });

            call.on("error", (err: any) => {
              console.warn("[WebRTC] Remote screen call error:", err);
            });
          } else {
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
            console.log("[WebRTC] Partner not online yet");
          } else if (err.type === "unavailable-id") {
            console.warn(`[WebRTC] Peer ID "${targetId}" in use. Auto-generating fresh unique ID...`);
            if (peerInstance && !peerInstance.destroyed) {
              peerInstance.destroy();
            }
            // Auto fallback to unique ID so it connects instantly 100% without getting stuck
            const uniqueId = `nc-${myRole}-${Math.random().toString(36).substring(2, 8)}`;
            currentMyPeerIdRef.current = uniqueId;
            setTimeout(() => {
              if (!isDisposed) {
                startPeer(uniqueId);
              }
            }, 600);
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

    const handleUnload = () => {
      if (peerInstance && !peerInstance.destroyed) {
        peerInstance.destroy();
      }
    };
    window.addEventListener("beforeunload", handleUnload);

    // Reconnect on iOS Safari when switching tabs or unlocking phone
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("[WebRTC] App resumed to foreground on iOS/Mobile");
        if (peerInstance && peerInstance.disconnected && !peerInstance.destroyed) {
          peerInstance.reconnect();
        }
        if (partnerActualPeerIdRef.current) {
          connectToPartner(partnerActualPeerIdRef.current);
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Continuous Dual-Sync Loop every 1.8s (Syncs presence, chat & triggers WebRTC handshake)
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
      }

      // 2. Serverless Signal Hub Sync (Ensures 100% presence & message receipt across 4G & WiFi)
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
            setConnectionStatusText(`Đã kết nối với ${partnerRole === "nguyen" ? "Nguyen" : "Crabie"}`);

            if (pPeerId && pPeerId !== partnerActualPeerIdRef.current) {
              partnerActualPeerIdRef.current = pPeerId;
            }

            // If not connected via P2P DataChannel yet, initiate WebRTC connection
            if (!dataConnRef.current || !dataConnRef.current.open) {
              if (pPeerId) {
                connectToPartner(pPeerId);
              }
            }

            // Sync partner sharing status
            if (pSharing !== isPartnerSharing) {
              setIsPartnerSharing(pSharing);
            }

            // If we are sharing and partner is online, call when requested or upon first connect
            if (isSharingScreenRef.current && localScreenStreamRef.current && pPeerId) {
              if (pRequestedScreen) {
                console.log(`[WebRTC] Partner requested screen stream. Calling: ${pPeerId}`);
                callPartnerWithScreenStream(pPeerId);
              } else if (!screenCallRef.current) {
                callPartnerWithScreenStream(pPeerId);
              }
            }
          } else {
            if (!dataConnRef.current?.open) {
              setIsPartnerConnected(false);
              setConnectionStatusText(`Đang chờ ${partnerRole === "nguyen" ? "Nguyen" : "Crabie"} vào rạp...`);
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
      voiceCallRef.current = null;
      setIsPeerReady(false);
      setIsPartnerConnected(false);
    };
  }, [callPartnerWithScreenStream, connectToPartner, isPartnerSharing, myRole, partnerRole, remoteScreenStream, setupDataConnection]);

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

  // Start Screen Sharing with Multi-Tier Fallback
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

      // Broadcast screen call to partner
      callPartnerWithScreenStream();

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
    [bitrate, callPartnerWithScreenStream, degradation, myRole]
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

        if (peerRef.current) {
          const targetPeerId = partnerActualPeerIdRef.current || getPeerIdForRole(partnerRole);
          const call = peerRef.current.call(targetPeerId, stream, {
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
  }, [myRole, partnerRole]);

  // Send Chat message (dual: WebRTC DataChannel + Serverless Signal Hub)
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

      // 1. Try instant WebRTC DataChannel
      if (dataConnRef.current && dataConnRef.current.open) {
        dataConnRef.current.send(
          JSON.stringify({
            type: "chat",
            payload: newMsg,
          })
        );
      }

      // 2. Always sync via serverless hub (guarantees delivery across 4G & WiFi)
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

  // Send Floating Reaction (dual: WebRTC + Serverless Hub)
  const sendReaction = useCallback(
    (emoji: string) => {
      const reactionId = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      addReactionAnimation(emoji, myRole);

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
      dataConnRef.current.close();
      dataConnRef.current = null;
    }
    isConnectingRef.current = false;
    connectToPartner();
  }, [connectToPartner]);

  // Manually Request Screen Stream (dual: DataChannel + Signal Hub)
  const requestScreenStream = useCallback(() => {
    console.log("[WebRTC] Manually requesting screen stream from partner...");
    needsStreamRequestRef.current = true;
    if (dataConnRef.current && dataConnRef.current.open) {
      try {
        dataConnRef.current.send(JSON.stringify({ type: "stream-request" }));
      } catch (e) {
        console.warn("DataChannel send stream-request error:", e);
      }
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
  }, [myRole]);

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
