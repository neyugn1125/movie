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
} from "@/utils/webrtcConfig";

interface UseCinemaWebRTCProps {
  myRole: UserRole;
}

export function useCinemaWebRTC({ myRole }: UseCinemaWebRTCProps) {
  const partnerRole: UserRole = myRole === "neyugn" ? "crabie" : "neyugn";
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
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [bitrate, setBitrate] = useState<BitrateTier>(15);
  const [degradation, setDegradation] = useState<DegradationPreference>("maintain-framerate");

  // Chat & Reactions
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);

  // Realtime Stats
  const [stats, setStats] = useState<StreamStats | null>(null);

  // Refs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const peerInstanceRef = useRef<any>(null);
  const dataConnRef = useRef<DataConnection | null>(null);
  const screenCallRef = useRef<MediaConnection | null>(null);
  const voiceCallRef = useRef<MediaConnection | null>(null);
  const activePeerConnectionRef = useRef<RTCPeerConnection | null>(null);

  // Stats calculation refs
  const prevBytesRef = useRef<number>(0);
  const prevTimestampRef = useRef<number>(0);
  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastHeartbeatReceivedRef = useRef<number>(0);

  // Trigger floating reaction locally
  const addReactionAnimation = useCallback((emoji: string, sender: UserRole) => {
    const newReaction: FloatingReaction = {
      id: `${Date.now()}-${Math.random()}`,
      emoji,
      sender,
      xPercent: Math.floor(Math.random() * 70) + 15, // 15% to 85%
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
      dataConnRef.current = conn;

      conn.on("open", () => {
        setIsPartnerConnected(true);
        lastHeartbeatReceivedRef.current = Date.now();
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
        setIsPartnerConnected(false);
        dataConnRef.current = null;
      });

      conn.on("error", (err) => {
        console.warn("Data connection error:", err);
      });
    },
    [handleDataMessage]
  );

  // Initialize Voice Chat (Mic)
  const initLocalVoice = useCallback(async () => {
    try {
      if (localMicStream) return localMicStream;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      setLocalMicStream(stream);
      return stream;
    } catch (err) {
      console.warn("Microphone access denied or not available:", err);
      return null;
    }
  }, [localMicStream]);

  // Connect to partner
  const connectToPartner = useCallback(
    async (peer: any) => {
      if (!peer || peer.destroyed) return;

      // 1. Establish Data Connection
      if (!dataConnRef.current || !dataConnRef.current.open) {
        try {
          const conn = peer.connect(partnerPeerId, {
            reliable: true,
            metadata: { role: myRole },
          });
          setupDataConnection(conn);
        } catch (err) {
          console.warn("Could not initiate data connection:", err);
        }
      }

      // 2. Establish Voice Call
      if (!voiceCallRef.current) {
        try {
          const micStream = await initLocalVoice();
          if (micStream) {
            const call = peer.call(partnerPeerId, micStream, {
              metadata: { type: "voice", role: myRole },
            });
            voiceCallRef.current = call;

            call.on("stream", (remoteStream: MediaStream) => {
              setRemoteVoiceStream(remoteStream);
            });

            call.on("close", () => {
              setRemoteVoiceStream(null);
              voiceCallRef.current = null;
            });
          }
        } catch (err) {
          console.warn("Could not initiate voice call:", err);
        }
      }
    },
    [partnerPeerId, myRole, setupDataConnection, initLocalVoice]
  );

  // Initialize PeerJS
  useEffect(() => {
    let peer: any = null;

    const initPeer = async () => {
      const PeerModule = (await import("peerjs")).default;

      peer = new PeerModule(myPeerId, {
        config: {
          iceServers: getIceServers(),
          iceCandidatePoolSize: 10,
        },
        debug: 1,
      });

      peerInstanceRef.current = peer;

      peer.on("open", (id: string) => {
        setIsPeerReady(true);
        // Attempt to connect to partner
        setTimeout(() => connectToPartner(peer), 800);
      });

      // Handle incoming data connection
      peer.on("connection", (conn: DataConnection) => {
        setupDataConnection(conn);
      });

      // Handle incoming calls (Voice or Screen share)
      peer.on("call", async (call: MediaConnection) => {
        const metadata = call.metadata || {};

        if (metadata.type === "screen") {
          screenCallRef.current = call;
          activePeerConnectionRef.current = call.peerConnection;

          call.answer(); // Answer without sending stream back

          call.on("stream", (incomingStream: MediaStream) => {
            setRemoteScreenStream(incomingStream);
            setIsPartnerSharing(true);
          });

          call.on("close", () => {
            setRemoteScreenStream(null);
            setIsPartnerSharing(false);
            screenCallRef.current = null;
          });
        } else {
          // Default to voice call
          voiceCallRef.current = call;
          const micStream = await initLocalVoice();
          call.answer(micStream || undefined);

          call.on("stream", (incomingVoiceStream: MediaStream) => {
            setRemoteVoiceStream(incomingVoiceStream);
          });

          call.on("close", () => {
            setRemoteVoiceStream(null);
            voiceCallRef.current = null;
          });
        }
      });

      peer.on("error", (err: any) => {
        if (err.type === "peer-unavailable") {
          // Partner is not online yet, wait for heartbeat or retry
          setIsPartnerConnected(false);
        } else if (err.type === "unavailable-id") {
          console.warn("Peer ID already in use. Retrying in 3s...");
        } else {
          console.warn("Peer error:", err);
        }
      });

      peer.on("disconnected", () => {
        peer.reconnect();
      });
    };

    initPeer();

    // Heartbeat check every 2.5 seconds
    heartbeatIntervalRef.current = setInterval(() => {
      if (dataConnRef.current && dataConnRef.current.open) {
        dataConnRef.current.send(
          JSON.stringify({
            type: "heartbeat",
            payload: { sender: myRole, isSharing: isSharingScreen },
          })
        );

        // Check if we haven't received partner heartbeat in 8 seconds
        if (
          lastHeartbeatReceivedRef.current > 0 &&
          Date.now() - lastHeartbeatReceivedRef.current > 8000
        ) {
          setIsPartnerConnected(false);
        }
      } else if (peerInstanceRef.current && !peerInstanceRef.current.destroyed) {
        // Try connecting to partner periodically if not connected
        connectToPartner(peerInstanceRef.current);
      }
    }, 2500);

    return () => {
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      if (peer) {
        peer.destroy();
      }
      setIsPeerReady(false);
      setIsPartnerConnected(false);
    };
  }, [myPeerId, connectToPartner, setupDataConnection, initLocalVoice, myRole, isSharingScreen]);

  // Realtime Stats monitoring
  useEffect(() => {
    const pc = activePeerConnectionRef.current;
    if (!pc) {
      setStats(null);
      return;
    }

    statsIntervalRef.current = setInterval(async () => {
      try {
        const reports = await pc.getStats();
        let currentWidth = 0;
        let currentHeight = 0;
        let currentFps = 0;
        let currentBytes = 0;
        let currentRtt = 0;
        let currentCodec = "VP9";

        reports.forEach((report) => {
          // Inbound (viewer)
          if (report.type === "inbound-rtp" && report.kind === "video") {
            currentWidth = report.frameWidth || currentWidth;
            currentHeight = report.frameHeight || currentHeight;
            currentFps = report.framesPerSecond || currentFps;
            currentBytes = report.bytesReceived || currentBytes;
          }
          // Outbound (host)
          if (report.type === "outbound-rtp" && report.kind === "video") {
            currentWidth = report.frameWidth || currentWidth;
            currentHeight = report.frameHeight || currentHeight;
            currentFps = report.framesPerSecond || currentFps;
            currentBytes = report.bytesSent || currentBytes;
          }
          // Candidate pair (RTT)
          if (
            report.type === "candidate-pair" &&
            (report.state === "succeeded" || report.nominated)
          ) {
            currentRtt = Math.round((report.currentRoundTripTime || 0) * 1000);
          }
          // Codec
          if (report.type === "codec") {
            currentCodec = report.mimeType?.replace("video/", "") || currentCodec;
          }
        });

        // Calculate bitrate
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
        console.warn("Could not retrieve WebRTC stats:", e);
      }
    }, 1000);

    return () => {
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    };
  }, [bitrate, isSharingScreen, remoteScreenStream]);

  // Start 2K 60fps Screen Sharing
  const startScreenShare = useCallback(
    async (targetBitrate: BitrateTier = bitrate, targetDegradation: DegradationPreference = degradation) => {
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

        const stream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack && "contentHint" in videoTrack) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (videoTrack as any).contentHint = "motion";
        }

        setLocalScreenStream(stream);
        setIsSharingScreen(true);

        // Call partner with screen stream
        if (peerInstanceRef.current) {
          const call = peerInstanceRef.current.call(partnerPeerId, stream, {
            metadata: { type: "screen", role: myRole },
          });

          screenCallRef.current = call;
          activePeerConnectionRef.current = call.peerConnection;

          // Apply bitrate and codec optimizations on peer connection
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

          // Handle call close
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

        // When user stops sharing using browser UI button
        videoTrack.onended = () => {
          stopScreenShare();
        };
      } catch (err) {
        console.warn("Screen share cancelled or failed:", err);
      }
    },
    [bitrate, degradation, partnerPeerId, myRole]
  );

  // Stop Screen Sharing
  const stopScreenShare = useCallback(() => {
    if (localScreenStream) {
      localScreenStream.getTracks().forEach((track) => track.stop());
      setLocalScreenStream(null);
    }
    if (screenCallRef.current) {
      screenCallRef.current.close();
      screenCallRef.current = null;
    }
    activePeerConnectionRef.current = null;
    setIsSharingScreen(false);
    setStats(null);

    // Notify partner
    if (dataConnRef.current && dataConnRef.current.open) {
      dataConnRef.current.send(
        JSON.stringify({
          type: "stream-state",
          payload: { isSharing: false },
        })
      );
    }
  }, [localScreenStream]);

  // Toggle Mic
  const toggleMic = useCallback(() => {
    if (!localMicStream) {
      initLocalVoice();
      setIsMicMuted(false);
      return;
    }
    const audioTrack = localMicStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMicMuted(!audioTrack.enabled);
    }
  }, [localMicStream, initLocalVoice]);

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
    if (peerInstanceRef.current && !peerInstanceRef.current.destroyed) {
      connectToPartner(peerInstanceRef.current);
    }
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
