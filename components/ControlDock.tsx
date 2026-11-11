"use client";

import React, { useState } from "react";
import { BitrateTier, DegradationPreference } from "@/types/cinema";
import {
  ScreenShare,
  ScreenShareOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  MessageSquare,
  Sparkles,
  Sliders,
  Settings2,
} from "lucide-react";

interface ControlDockProps {
  isSharingScreen: boolean;
  onStartShare: (bitrate: BitrateTier, degradation: DegradationPreference) => void;
  onStopShare: () => void;
  isMicMuted: boolean;
  onToggleMic: () => void;
  isLocalSpeaking: boolean;
  isPartnerSpeaking: boolean;
  filmVolume: number;
  onFilmVolumeChange: (val: number) => void;
  voiceVolume: number;
  onVoiceVolumeChange: (val: number) => void;
  autoDucking: boolean;
  onToggleAutoDucking: () => void;
  onSendReaction: (emoji: string) => void;
  onToggleChat: () => void;
  isChatOpen: boolean;
  unreadCount?: number;
}

const REACTION_EMOJIS = ["❤️", "🥰", "😂", "😱", "🥺", "🍿"];

export const ControlDock: React.FC<ControlDockProps> = ({
  isSharingScreen,
  onStartShare,
  onStopShare,
  isMicMuted,
  onToggleMic,
  isLocalSpeaking,
  isPartnerSpeaking,
  filmVolume,
  onFilmVolumeChange,
  voiceVolume,
  onVoiceVolumeChange,
  autoDucking,
  onToggleAutoDucking,
  onSendReaction,
  onToggleChat,
  isChatOpen,
  unreadCount = 0,
}) => {
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [selectedBitrate, setSelectedBitrate] = useState<BitrateTier>(15);
  const [selectedDegradation, setSelectedDegradation] =
    useState<DegradationPreference>("maintain-framerate");

  const handleShareClick = () => {
    if (isSharingScreen) {
      onStopShare();
    } else {
      onStartShare(selectedBitrate, selectedDegradation);
    }
  };

  return (
    <div className="relative z-30 px-4 pb-4 sm:pb-6 flex flex-col items-center pointer-events-none">
      {/* Bitrate & Stream Settings Menu Popup */}
      {showSettingsMenu && (
        <div className="pointer-events-auto mb-3 p-4 rounded-2xl bg-slate-900/90 border border-white/10 backdrop-blur-xl shadow-2xl text-xs text-white flex flex-col gap-3 min-w-[280px] animate-fade-in">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="font-semibold flex items-center gap-1.5 text-theme-accent">
              <Settings2 className="w-4 h-4" /> Cài Đặt Luồng 2K 60fps
            </span>
            <button
              onClick={() => setShowSettingsMenu(false)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          {/* Bitrate Selection */}
          <div>
            <label className="block text-[11px] text-slate-400 mb-1.5 font-medium">
              Băng thông truyền tải (Bitrate):
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: "8 Mbps", tier: 8 as BitrateTier },
                { label: "15 Mbps", tier: 15 as BitrateTier },
                { label: "25 Mbps", tier: 25 as BitrateTier },
              ].map((item) => (
                <button
                  key={item.tier}
                  onClick={() => setSelectedBitrate(item.tier)}
                  className={`py-1.5 px-2 rounded-lg text-center font-medium transition-all ${
                    selectedBitrate === item.tier
                      ? "bg-theme-primary text-white shadow-glow"
                      : "bg-white/5 hover:bg-white/10 text-slate-300"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Degradation Preference */}
          <div>
            <label className="block text-[11px] text-slate-400 mb-1.5 font-medium">
              Độ ưu tiên truyền tải:
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => setSelectedDegradation("maintain-framerate")}
                className={`py-1.5 px-2 rounded-lg text-center font-medium transition-all ${
                  selectedDegradation === "maintain-framerate"
                    ? "bg-theme-primary text-white shadow-glow"
                    : "bg-white/5 hover:bg-white/10 text-slate-300"
                }`}
              >
                Ưu tiên 60fps
              </button>
              <button
                onClick={() => setSelectedDegradation("maintain-resolution")}
                className={`py-1.5 px-2 rounded-lg text-center font-medium transition-all ${
                  selectedDegradation === "maintain-resolution"
                    ? "bg-theme-primary text-white shadow-glow"
                    : "bg-white/5 hover:bg-white/10 text-slate-300"
                }`}
              >
                Ưu tiên Nét 2K
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Glassmorphic Dock Container */}
      <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 sm:gap-3 p-2 sm:p-2.5 rounded-2xl sm:rounded-3xl bg-slate-900/70 border border-white/10 backdrop-blur-2xl shadow-2xl ring-1 ring-white/5 max-w-full">
        {/* Screen Share Button */}
        <div className="flex items-center">
          <button
            onClick={handleShareClick}
            className={`px-3.5 py-2.5 rounded-2xl font-medium text-xs flex items-center gap-2 transition-all shadow-md active:scale-95 ${
              isSharingScreen
                ? "bg-rose-500 hover:bg-rose-600 text-white"
                : "bg-theme-primary hover:bg-theme-accent text-white shadow-glow"
            }`}
          >
            {isSharingScreen ? (
              <>
                <ScreenShareOff className="w-4 h-4" />
                <span className="hidden sm:inline">Dừng Chiếu</span>
              </>
            ) : (
              <>
                <ScreenShare className="w-4 h-4" />
                <span className="hidden sm:inline">Chiếu Phim 2K</span>
              </>
            )}
          </button>
          {!isSharingScreen && (
            <button
              onClick={() => setShowSettingsMenu(!showSettingsMenu)}
              title="Tùy chọn Bitrate & FPS"
              className="ml-1 p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5 transition-colors"
            >
              <Sliders className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Vertical Divider */}
        <div className="h-6 w-px bg-white/10 hidden sm:block" />

        {/* Mic Toggle with Voice Activity Ring */}
        <button
          onClick={onToggleMic}
          title={isMicMuted ? "Bật Mic" : "Tắt Mic"}
          className={`relative p-2.5 rounded-2xl border transition-all active:scale-95 ${
            isMicMuted
              ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
              : "bg-white/5 hover:bg-white/10 text-white border-white/10"
          }`}
        >
          {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          {/* Speaking ring visualizer */}
          {!isMicMuted && isLocalSpeaking && (
            <span className="absolute -inset-1 rounded-2xl border-2 border-emerald-400 animate-ping opacity-75 pointer-events-none" />
          )}
        </button>

        {/* Audio Volume Controls (Film & Partner Voice) */}
        <div className="hidden lg:flex items-center gap-3 px-2 py-1 bg-white/[0.03] rounded-2xl border border-white/5">
          {/* Film Volume */}
          <div className="flex items-center gap-1.5" title="Âm lượng phim">
            {filmVolume === 0 ? (
              <VolumeX className="w-3.5 h-3.5 text-slate-500" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span className="text-[10px] text-slate-400">Phim</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={filmVolume}
              onChange={(e) => onFilmVolumeChange(parseFloat(e.target.value))}
              className="w-16 accent-theme-primary h-1 bg-white/10 rounded-lg cursor-pointer"
            />
          </div>

          <div className="h-4 w-px bg-white/10" />

          {/* Voice Volume */}
          <div className="flex items-center gap-1.5" title="Âm lượng giọng đối phương">
            <Mic className="w-3.5 h-3.5 text-theme-accent" />
            <span className="text-[10px] text-slate-400">Mic</span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={voiceVolume}
              onChange={(e) => onVoiceVolumeChange(parseFloat(e.target.value))}
              className="w-16 accent-theme-accent h-1 bg-white/10 rounded-lg cursor-pointer"
            />
            <span className="text-[10px] font-mono text-slate-400 min-w-[28px]">
              {Math.round(voiceVolume * 100)}%
            </span>
          </div>

          {/* Auto Ducking Toggle */}
          <button
            onClick={onToggleAutoDucking}
            title={
              autoDucking
                ? "Smart Audio Ducking đang BẬT (Tự giảm âm phim khi người yêu nói)"
                : "Smart Audio Ducking đang TẮT"
            }
            className={`px-2 py-1 rounded-lg text-[10px] font-medium transition-all ${
              autoDucking
                ? isPartnerSpeaking
                  ? "bg-emerald-500 text-white animate-pulse"
                  : "bg-theme-primary/20 text-theme-accent border border-theme-primary/30"
                : "bg-white/5 text-slate-500"
            }`}
          >
            Auto Ducking
          </button>
        </div>

        {/* Vertical Divider */}
        <div className="h-6 w-px bg-white/10 hidden sm:block" />

        {/* Floating Reactions Bar */}
        <div className="flex items-center gap-1">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onSendReaction(emoji)}
              title={`Thả cảm xúc ${emoji}`}
              className="p-1.5 sm:p-2 rounded-xl hover:bg-white/10 text-base sm:text-lg transition-transform hover:scale-125 active:scale-95"
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Vertical Divider */}
        <div className="h-6 w-px bg-white/10" />

        {/* Chat Drawer Toggle Button */}
        <button
          onClick={onToggleChat}
          title={isChatOpen ? "Đóng khung chat" : "Mở khung chat"}
          className={`relative p-2.5 rounded-2xl border transition-all active:scale-95 ${
            isChatOpen
              ? "bg-theme-primary text-white border-transparent shadow-glow"
              : "bg-white/5 hover:bg-white/10 text-slate-300 border-white/10"
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          {unreadCount > 0 && !isChatOpen && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
};
