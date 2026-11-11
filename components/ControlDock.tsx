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
  Sliders,
  Settings2,
  X,
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
  const [showAudioMenu, setShowAudioMenu] = useState(false);
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
    <div className="relative z-30 px-2 sm:px-4 pb-safe flex flex-col items-center pointer-events-none mb-2 sm:mb-3">
      {/* Bitrate & Stream Settings Menu Popup */}
      {showSettingsMenu && (
        <div className="pointer-events-auto mb-2 p-3 sm:p-4 rounded-2xl bg-slate-900/95 border border-white/10 backdrop-blur-xl shadow-2xl text-xs text-white flex flex-col gap-2.5 sm:gap-3 min-w-[260px] sm:min-w-[280px] animate-fade-in max-w-[90vw]">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="font-semibold flex items-center gap-1.5 text-theme-accent">
              <Settings2 className="w-4 h-4" /> Cài Đặt Luồng Phát
            </span>
            <button
              onClick={() => setShowSettingsMenu(false)}
              className="p-1 rounded-md text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
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
                  className={`py-1.5 px-2 rounded-lg text-center font-medium transition-all text-xs ${
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
                className={`py-1.5 px-2 rounded-lg text-center font-medium transition-all text-xs ${
                  selectedDegradation === "maintain-framerate"
                    ? "bg-theme-primary text-white shadow-glow"
                    : "bg-white/5 hover:bg-white/10 text-slate-300"
                }`}
              >
                Ưu tiên mượt mà
              </button>
              <button
                onClick={() => setSelectedDegradation("maintain-resolution")}
                className={`py-1.5 px-2 rounded-lg text-center font-medium transition-all text-xs ${
                  selectedDegradation === "maintain-resolution"
                    ? "bg-theme-primary text-white shadow-glow"
                    : "bg-white/5 hover:bg-white/10 text-slate-300"
                }`}
              >
                Ưu tiên độ nét
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Audio Controls Popup (For screens < lg) */}
      {showAudioMenu && (
        <div className="pointer-events-auto mb-2 p-3.5 rounded-2xl bg-slate-900/95 border border-white/10 backdrop-blur-xl shadow-2xl text-xs text-white flex flex-col gap-3 min-w-[260px] sm:min-w-[280px] animate-fade-in max-w-[90vw] lg:hidden">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="font-semibold flex items-center gap-1.5 text-theme-accent">
              <Volume2 className="w-4 h-4" /> Âm Lượng & Micro
            </span>
            <button
              onClick={() => setShowAudioMenu(false)}
              className="p-1 rounded-md text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Film Volume */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px] text-slate-300">
              <span className="flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-slate-400" /> Âm lượng Phim
              </span>
              <span className="font-mono text-theme-accent">{Math.round(filmVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={filmVolume}
              onChange={(e) => onFilmVolumeChange(parseFloat(e.target.value))}
              className="w-full accent-theme-primary h-1.5 bg-white/10 rounded-lg cursor-pointer"
            />
          </div>

          {/* Voice Volume */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px] text-slate-300">
              <span className="flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5 text-theme-accent" /> Giọng đối phương
              </span>
              <span className="font-mono text-theme-accent">{Math.round(voiceVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={voiceVolume}
              onChange={(e) => onVoiceVolumeChange(parseFloat(e.target.value))}
              className="w-full accent-theme-accent h-1.5 bg-white/10 rounded-lg cursor-pointer"
            />
          </div>

          {/* Auto Ducking */}
          <button
            onClick={onToggleAutoDucking}
            className={`w-full py-2 px-3 rounded-xl text-center font-medium transition-all text-xs flex items-center justify-between ${
              autoDucking
                ? isPartnerSpeaking
                  ? "bg-emerald-500 text-white animate-pulse"
                  : "bg-theme-primary/20 text-theme-accent border border-theme-primary/30"
                : "bg-white/5 text-slate-400"
            }`}
          >
            <span>Tự giảm âm khi nói (Auto Ducking)</span>
            <span className="font-bold">{autoDucking ? "BẬT" : "TẮT"}</span>
          </button>
        </div>
      )}

      {/* Main Glassmorphic Dock Container */}
      <div className="pointer-events-auto flex items-center justify-center gap-1.5 sm:gap-3 p-1.5 sm:p-2.5 rounded-2xl sm:rounded-3xl bg-slate-900/80 border border-white/10 backdrop-blur-2xl shadow-2xl ring-1 ring-white/5 max-w-[96vw] overflow-x-auto no-scrollbar">
        {/* Screen Share Button */}
        <div className="flex items-center flex-shrink-0">
          <button
            onClick={handleShareClick}
            className={`px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-xl sm:rounded-2xl font-medium text-xs flex items-center gap-1.5 sm:gap-2 transition-all shadow-md active:scale-95 ${
              isSharingScreen
                ? "bg-rose-500 hover:bg-rose-600 text-white"
                : "bg-theme-primary hover:bg-theme-accent text-white shadow-glow"
            }`}
          >
            {isSharingScreen ? (
              <>
                <ScreenShareOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>Dừng</span>
              </>
            ) : (
              <>
                <ScreenShare className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>Chiếu Phim</span>
              </>
            )}
          </button>
          {!isSharingScreen && (
            <button
              onClick={() => {
                setShowSettingsMenu(!showSettingsMenu);
                setShowAudioMenu(false);
              }}
              title="Tùy chọn chất lượng phát"
              className="ml-1 p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5 transition-colors"
            >
              <Sliders className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          )}
        </div>

        {/* Vertical Divider */}
        <div className="h-5 sm:h-6 w-px bg-white/10" />

        {/* Mic Toggle with Voice Activity Ring */}
        <button
          onClick={onToggleMic}
          title={isMicMuted ? "Bật Mic" : "Tắt Mic"}
          className={`relative p-2 sm:p-2.5 rounded-xl sm:rounded-2xl border transition-all active:scale-95 flex-shrink-0 ${
            isMicMuted
              ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
              : "bg-white/5 hover:bg-white/10 text-white border-white/10"
          }`}
        >
          {isMicMuted ? (
            <MicOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          ) : (
            <Mic className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          )}
          {!isMicMuted && isLocalSpeaking && (
            <span className="absolute -inset-1 rounded-2xl border-2 border-emerald-400 animate-ping opacity-75 pointer-events-none" />
          )}
        </button>

        {/* Mobile Volume Control Button (Visible on screens < lg) */}
        <button
          onClick={() => {
            setShowAudioMenu(!showAudioMenu);
            setShowSettingsMenu(false);
          }}
          title="Âm lượng phim & giọng nói"
          className={`lg:hidden p-2 sm:p-2.5 rounded-xl sm:rounded-2xl border transition-all active:scale-95 flex-shrink-0 ${
            showAudioMenu
              ? "bg-theme-primary text-white border-transparent"
              : "bg-white/5 hover:bg-white/10 text-slate-300 border-white/10"
          }`}
        >
          <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>

        {/* Desktop Audio Volume Controls (Visible on screens >= lg) */}
        <div className="hidden lg:flex items-center gap-3 px-2 py-1 bg-white/[0.03] rounded-2xl border border-white/5">
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

          <button
            onClick={onToggleAutoDucking}
            title={
              autoDucking
                ? "Smart Audio Ducking đang BẬT"
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
        <div className="h-5 sm:h-6 w-px bg-white/10" />

        {/* Floating Reactions Bar */}
        <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onSendReaction(emoji)}
              title={`Thả cảm xúc ${emoji}`}
              className="p-1 sm:p-2 rounded-lg sm:rounded-xl hover:bg-white/10 text-sm sm:text-base transition-transform active:scale-125 touch-manipulation"
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Vertical Divider */}
        <div className="h-5 sm:h-6 w-px bg-white/10" />

        {/* Chat Drawer Toggle Button */}
        <button
          onClick={onToggleChat}
          title={isChatOpen ? "Đóng khung chat" : "Mở khung chat"}
          className={`relative p-2 sm:p-2.5 rounded-xl sm:rounded-2xl border transition-all active:scale-95 flex-shrink-0 ${
            isChatOpen
              ? "bg-theme-primary text-white border-transparent shadow-glow"
              : "bg-white/5 hover:bg-white/10 text-slate-300 border-white/10"
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
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
