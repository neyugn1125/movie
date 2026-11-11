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

  // Media Streams
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null);
  const [localMicStream, setLocalMicStream] = useState<MediaStream | null>(null);
  const [remoteVoiceStream, setRemoteVoiceStream] = useState<MediaStream | null>(null);

  // Settings
  const [isMicMuted, setIsMicMuted] = useState(true); // Default muted until user enables
  const [bitrate, setBitrate] = useState<BitrateTier>(15);
  const [degradation, setDegradation] = useState<DegradationPreference>("maintain-framerate");

  // Chat & Reactions
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);

  // Realtime Stats
  const [stats, setStats] = useState<StreamStats | null>(null);

  // Refs to avoid unnecessary re-triggers and race conditions
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
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
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
        }
      }
    },
    [addReactionAnimation, isPartnerSharing]
  );

  // Setup data connection handlers
  const setupDataConnection = useCallback(
    (conn: DataConnection) => {
      conn.on("open", () => {
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

        // If currently sharing screen, send stream to partner
        if (localScreenStreamRef.current && peerRef.current) {
          const myPartnerId = getPeerIdForRole(partnerRole);
          const call = peerRef.current.call(myPartnerId, localScreenStreamRef.current, {
            metadata: { type: "screen", role: myRole },
          });
          screenCallRef.current = call;
          activePeerConnectionRef.current = call.peerConnection;

          if (call.peerConnection) {
            patchPeerConnectionForBitrate(call.peerConnection, 25);
          }
        }

        // If currently speaking on mic, send voice call to partner
        if (localMicStreamRef.current && peerRef.current) {
          const myPartnerId = getPeerIdForRole(partnerRole);
          const call = peerRef.current.call(myPartnerId, localMicStreamRef.current, {
            metadata: { type: "voice", role: myRole },
          });
          voiceCallRef.current = call;
          call.on("stream", (remoteStream: MediaStream) => {
            setRemoteVoiceStream(remoteStream);
          });
        }
      });

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
    [handleDataMessage, myRole, partnerRole]
  );

  // Connect to partner safely
  const connectToPartner = useCallback(() => {
    const peer = peerRef.current;
    if (!peer || peer.destroyed) return;
    if (dataConnRef.current && dataConnRef.current.open) return;
    if (isConnectingRef.current) return;

    const targetPeerId = getPeerIdForRole(partnerRole);
    isConnectingRef.current = true;
    console.log(`[WebRTC] Attempting connection to partner: ${targetPeerId}`);

    try {
      const conn = peer.connect(targetPeerId, {
        reliable: true,
      });
      setupDataConnection(conn);

      setTimeout(() => {
        isConnectingRef.current = false;
      }, 5000);
    } catch (err) {
      console.warn("[WebRTC] Connect attempt error:", err);
      isConnectingRef.current = false;
    }
  }, [partnerRole, setupDataConnection]);

  // Main Peer Lifecycle (Runs ONCE per myRole mount, never re-created by state changes)
  useEffect(() => {
    let peerInstance: any = null;
    let isDisposed = false;

    const initPeer = async () => {
      try {
        const PeerModule = (await import("peerjs")).default;
        const myPeerId = getPeerIdForRole(myRole);

        console.log(`[WebRTC] Initializing Peer with ID: ${myPeerId}`);

        peerInstance = new PeerModule(myPeerId, {
          config: {
            iceServers: getIceServers(),
            iceCandidatePoolSize: 10,
          },
          debug: 1,
        });

        peerRef.current = peerInstance;

        peerInstance.on("open", (id: string) => {
          if (isDisposed) return;
          console.log(`[WebRTC] Peer connected to server as: ${id}`);
          setIsPeerReady(true);
          // Attempt immediate connection to partner
          setTimeout(() => connectToPartner(), 600);
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
          console.log("[WebRTC] Received incoming call of type:", metadata.type);

          if (metadata.type === "screen") {
            screenCallRef.current = call;
            activePeerConnectionRef.current = call.peerConnection;

            // Patch incoming peer connection for high-bitrate SDP Answer
            if (call.peerConnection) {
              patchPeerConnectionForBitrate(call.peerConnection, 25);
            }

            call.answer(); // Answer receive-only

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
            // Partner not yet in room, normal during startup
            setIsPartnerConnected(false);
          } else if (err.type === "unavailable-id") {
            console.warn("[WebRTC] Peer ID in use. Auto-reconnecting in 3s...");
            setTimeout(() => {
              if (!isDisposed && peerRef.current?.destroyed) {
                initPeer();
              }
            }, 3000);
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

    initPeer();

    // Heartbeat check every 3s
    heartbeatIntervalRef.current = setInterval(() => {
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

        // If no heartbeat for 12s, partner disconnected
        if (
          lastHeartbeatReceivedRef.current > 0 &&
          Date.now() - lastHeartbeatReceivedRef.current > 12000
        ) {
          setIsPartnerConnected(false);
        }
      } else if (peerRef.current && !peerRef.current.destroyed) {
        // Partner not connected: attempt reconnect periodically
        connectToPartner();
      }
    }, 3000);

    return () => {
      isDisposed = true;
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      if (peerInstance) {
        peerInstance.destroy();
      }
      peerRef.current = null;
      dataConnRef.current = null;
      screenCallRef.current = null;
      voiceCallRef.current = null;
      setIsPeerReady(false);
      setIsPartnerConnected(false);
    };
  }, [myRole, connectToPartner, setupDataConnection]);

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
        let currentCodec = "VP9";

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

  // Start Screen Sharing
  const startScreenShare = useCallback(
    async (targetBitrate: BitrateTier = bitrate, targetDegradation: DegradationPreference = degradation) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const displayMediaOptions: any = {
          video: {
            width: { ideal: 2560, min: 1920, max: 3840 },
            height: { ideal: 1440, min: 1080, max: 2160 },
            frameRate: { ideal: 60, min: 45, max: 60 },
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

        const stream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack && "contentHint" in videoTrack) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (videoTrack as any).contentHint = "motion";
        }

        setLocalScreenStream(stream);
        localScreenStreamRef.current = stream;
        setIsSharingScreen(true);
        isSharingScreenRef.current = true;

        // Call partner with screen stream
        if (peerRef.current) {
          const targetPeerId = getPeerIdForRole(partnerRole);
          const call = peerRef.current.call(targetPeerId, stream, {
            metadata: { type: "screen", role: myRole },
          });

          screenCallRef.current = call;
          activePeerConnectionRef.current = call.peerConnection;

          // Force high-bitrate SDP negotiation immediately on the peer connection
          if (call.peerConnection) {
            patchPeerConnectionForBitrate(call.peerConnection, targetBitrate);
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
                await configureVideoSender(videoTransceiver.sender, targetBitrate, targetDegradation);
              }
            }
          };

          applyOptimizations();
          setTimeout(applyOptimizations, 300);
          setTimeout(applyOptimizations, 1000);
          setTimeout(applyOptimizations, 2500);
          setTimeout(applyOptimizations, 5000);

          call.on("close", () => {
            stopScreenShare();
          });
        }

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
      } catch (err) {
        console.warn("Screen share error:", err);
      }
    },
    [bitrate, degradation, myRole, partnerRole]
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
          const targetPeerId = getPeerIdForRole(partnerRole);
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
    myPeerId: getPeerIdForRole(myRole),
    partnerPeerId: getPeerIdForRole(partnerRole),
  };
}
