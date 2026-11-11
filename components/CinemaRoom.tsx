"use client";

import React, { useState, useEffect, useRef } from "react";
import { UserRole, ChatMessage } from "@/types/cinema";
import { useCinemaWebRTC } from "@/hooks/useCinemaWebRTC";
import { useAudioDucking } from "@/hooks/useAudioDucking";
import { soundEffects } from "@/utils/soundEffects";
import { Header } from "./Header";
import { CinemaStage } from "./CinemaStage";
import { ControlDock } from "./ControlDock";
import { SidebarChat } from "./SidebarChat";
import { ReactionOverlay } from "./ReactionOverlay";
import { MessageNotificationToast } from "./MessageNotificationToast";

interface CinemaRoomProps {
  myRole: UserRole;
  onLogout: () => void;
}

export const CinemaRoom: React.FC<CinemaRoomProps> = ({ myRole, onLogout }) => {
  const partnerName = myRole === "nguyen" ? "Crabie" : "Nguyen";

  // Dedicated HTML5 Audio element for remote voice stream (bypasses Chromium WebRTC AudioContext silence bug)
  const remoteVoiceAudioRef = useRef<HTMLAudioElement>(null);

  // WebRTC Core Hook
  const {
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
    reconnect,
  } = useCinemaWebRTC({ myRole });

  // Web Audio & Ducking Hook
  const {
    filmVolume,
    setFilmVolume,
    voiceVolume,
    setVoiceVolume,
    autoDucking,
    setAutoDucking,
    isPartnerSpeaking,
    isLocalSpeaking,
    resumeAudioContext,
  } = useAudioDucking({
    screenAudioStream: remoteScreenStream,
    voiceAudioStream: remoteVoiceStream,
    localMicStream,
  });

  // UI States
  const [ambientMode, setAmbientMode] = useState<boolean>(false);
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<ChatMessage | null>(null);
  const lastProcessedMsgIdRef = useRef<string | null>(null);

  // Bind remote voice stream to dedicated audio tag
  useEffect(() => {
    if (remoteVoiceAudioRef.current) {
      if (remoteVoiceStream) {
        remoteVoiceAudioRef.current.srcObject = remoteVoiceStream;
        remoteVoiceAudioRef.current.play().catch((err) => {
          console.warn("[Voice] Auto-play was prevented until user interaction:", err);
        });
      } else {
        remoteVoiceAudioRef.current.srcObject = null;
      }
    }
  }, [remoteVoiceStream]);

  // Resume audio playback upon any user gesture
  useEffect(() => {
    const handleInteraction = () => {
      resumeAudioContext();
      if (remoteVoiceAudioRef.current && remoteVoiceAudioRef.current.paused && remoteVoiceStream) {
        remoteVoiceAudioRef.current.play().catch(() => {});
      }
    };

    window.addEventListener("click", handleInteraction);
    window.addEventListener("keydown", handleInteraction);
    window.addEventListener("touchstart", handleInteraction);

    return () => {
      window.removeEventListener("click", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
      window.removeEventListener("touchstart", handleInteraction);
    };
  }, [remoteVoiceStream, resumeAudioContext]);

  useEffect(() => {
    if (remoteVoiceStream || remoteScreenStream) {
      resumeAudioContext();
    }
  }, [remoteVoiceStream, remoteScreenStream, resumeAudioContext]);

  // Play sound effect & trigger top-right popup toast when partner sends a message
  useEffect(() => {
    if (chatMessages.length > 0) {
      const lastMsg = chatMessages[chatMessages.length - 1];
      if (lastMsg.id !== lastProcessedMsgIdRef.current) {
        lastProcessedMsgIdRef.current = lastMsg.id;

        if (lastMsg.sender !== myRole) {
          // Play subtle pleasant chime
          soundEffects.playMessageSound();

          // Show top-right popup toast notification
          setToastMessage(lastMsg);

          // Increment unread count if drawer is closed
          if (!isChatOpen) {
            setUnreadCount((prev) => prev + 1);
          }
        }
      }
    }
  }, [chatMessages, isChatOpen, myRole]);

  // Clear unread count and active toast when chat opens
  useEffect(() => {
    if (isChatOpen) {
      setUnreadCount(0);
      setToastMessage(null);
    }
  }, [isChatOpen]);

  return (
    <div className="relative min-h-screen w-full flex flex-col bg-theme-bg text-white overflow-hidden select-none">
      {/* Hidden dedicated HTML5 audio element for stable voice chat playback */}
      <audio ref={remoteVoiceAudioRef} autoPlay playsInline className="hidden" />

      {/* Top-Right Incoming Message Popup Toast */}
      <MessageNotificationToast
        message={toastMessage}
        myRole={myRole}
        onOpenChat={() => {
          setIsChatOpen(true);
          setToastMessage(null);
        }}
        onClose={() => setToastMessage(null)}
      />

      {/* Reaction Particles Floating Overlay */}
      <ReactionOverlay reactions={reactions} />

      {/* Top Header */}
      <Header
        myRole={myRole}
        isPartnerConnected={isPartnerConnected}
        connectionStatusText={connectionStatusText}
        ambientMode={ambientMode}
        onToggleAmbient={() => setAmbientMode(!ambientMode)}
        onLogout={onLogout}
        onReconnect={reconnect}
      />

      {/* Main Center Cinema Stage */}
      <main className="relative flex-1 w-full flex flex-col overflow-hidden">
        <CinemaStage
          localStream={localScreenStream}
          remoteStream={remoteScreenStream}
          isSharingScreen={isSharingScreen}
          isPartnerSharing={isPartnerSharing}
          ambientMode={ambientMode}
          stats={stats}
          partnerName={partnerName}
        />
      </main>

      {/* Floating Bottom Control Dock */}
      <ControlDock
        isSharingScreen={isSharingScreen}
        onStartShare={startScreenShare}
        onStopShare={stopScreenShare}
        isMicMuted={isMicMuted}
        onToggleMic={toggleMic}
        isLocalSpeaking={isLocalSpeaking}
        isPartnerSpeaking={isPartnerSpeaking}
        filmVolume={filmVolume}
        onFilmVolumeChange={setFilmVolume}
        voiceVolume={voiceVolume}
        onVoiceVolumeChange={setVoiceVolume}
        autoDucking={autoDucking}
        onToggleAutoDucking={() => setAutoDucking(!autoDucking)}
        onSendReaction={sendReaction}
        onToggleChat={() => setIsChatOpen(!isChatOpen)}
        isChatOpen={isChatOpen}
        unreadCount={unreadCount}
      />

      {/* Slide-out Menu Drawer Chat with Backdrop */}
      <SidebarChat
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        messages={chatMessages}
        onSendMessage={sendChatMessage}
        myRole={myRole}
        onReconnect={reconnect}
        partnerName={partnerName}
      />
    </div>
  );
};
