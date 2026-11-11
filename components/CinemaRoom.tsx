"use client";

import React, { useState, useEffect } from "react";
import { UserRole } from "@/types/cinema";
import { useCinemaWebRTC } from "@/hooks/useCinemaWebRTC";
import { useAudioDucking } from "@/hooks/useAudioDucking";
import { Header } from "./Header";
import { CinemaStage } from "./CinemaStage";
import { ControlDock } from "./ControlDock";
import { SidebarChat } from "./SidebarChat";
import { ReactionOverlay } from "./ReactionOverlay";

interface CinemaRoomProps {
  myRole: UserRole;
  onLogout: () => void;
}

export const CinemaRoom: React.FC<CinemaRoomProps> = ({ myRole, onLogout }) => {
  const partnerName = myRole === "nguyen" ? "Crabie" : "Nguyen";

  // WebRTC Core Hook
  const {
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

  // Resume AudioContext on first user interaction to comply with browser autoplay policies
  useEffect(() => {
    const handleFirstInteraction = () => {
      resumeAudioContext();
      window.removeEventListener("click", handleFirstInteraction);
    };
    window.addEventListener("click", handleFirstInteraction);
    return () => window.removeEventListener("click", handleFirstInteraction);
  }, [resumeAudioContext]);

  // Track unread messages when chat is closed
  useEffect(() => {
    if (chatMessages.length > 0) {
      const lastMsg = chatMessages[chatMessages.length - 1];
      if (lastMsg.sender !== myRole && !isChatOpen) {
        setUnreadCount((prev) => prev + 1);
      }
    }
  }, [chatMessages, isChatOpen, myRole]);

  // Clear unread count when chat opens
  useEffect(() => {
    if (isChatOpen) {
      setUnreadCount(0);
    }
  }, [isChatOpen]);

  return (
    <div className="relative min-h-screen w-full flex flex-col bg-theme-bg text-white overflow-hidden select-none">
      {/* Reaction Particles Floating Overlay */}
      <ReactionOverlay reactions={reactions} />

      {/* Top Header */}
      <Header
        myRole={myRole}
        isPartnerConnected={isPartnerConnected}
        ambientMode={ambientMode}
        onToggleAmbient={() => setAmbientMode(!ambientMode)}
        onLogout={onLogout}
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

      {/* Side Chat Drawer */}
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
