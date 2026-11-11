"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { StreamStats } from "@/types/cinema";
import {
  Maximize,
  Minimize,
  PictureInPicture2,
  Activity,
  Monitor,
  Info,
  Tv,
  Play,
  Volume2,
  VolumeX,
  Radio,
  RefreshCw,
} from "lucide-react";

interface CinemaStageProps {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isSharingScreen: boolean;
  isPartnerSharing: boolean;
  ambientMode: boolean;
  stats: StreamStats | null;
  partnerName: string;
  onRequestScreenStream?: () => void;
}

export const CinemaStage: React.FC<CinemaStageProps> = ({
  localStream,
  remoteStream,
  isSharingScreen,
  isPartnerSharing,
  ambientMode,
  stats,
  partnerName,
  onRequestScreenStream,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fitMode, setFitMode] = useState<"contain" | "cover" | "fill">("contain");
  const [showStats, setShowStats] = useState(true);
  const [isPlayBlocked, setIsPlayBlocked] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(true);
  const [isRequestingStream, setIsRequestingStream] = useState(false);

  // Active stream is either remote (if partner is sharing) or local (if I am sharing)
  const activeStream = remoteStream || (isSharingScreen ? localStream : null);

  const handleManualPlay = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = false;
      setIsVideoMuted(false);
      videoRef.current
        .play()
        .then(() => {
          setIsPlayBlocked(false);
        })
        .catch((err) => {
          console.warn("Manual unmuted video play attempt restricted by browser:", err);
          if (videoRef.current) {
            videoRef.current.muted = true;
            setIsVideoMuted(true);
            videoRef.current
              .play()
              .then(() => setIsPlayBlocked(false))
              .catch(() => {});
          }
        });
    }
  }, []);

  const toggleVideoAudio = useCallback(() => {
    if (videoRef.current) {
      const nextMuted = !videoRef.current.muted;
      videoRef.current.muted = nextMuted;
      setIsVideoMuted(nextMuted);
    }
  }, []);

  useEffect(() => {
    if (videoRef.current) {
      if (activeStream) {
        videoRef.current.srcObject = activeStream;
        videoRef.current
          .play()
          .then(() => {
            setIsPlayBlocked(false);
          })
          .catch((err) => {
            console.warn("Video auto-play restricted by Safari/iOS (User gesture required):", err);
            setIsPlayBlocked(true);
          });
      } else {
        videoRef.current.srcObject = null;
        setIsPlayBlocked(false);
      }
    }
  }, [activeStream]);

  // Synchronize fullscreen state with browser/OS events
  useEffect(() => {
    const handleFullscreenChange = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isFull = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isFull);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, []);

  // Fullscreen toggle (Handles desktop, mobile, container and video fallback)
  const toggleFullscreen = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = document as any;
      const isFull = !!(
        document.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.mozFullScreenElement ||
        doc.msFullscreenElement
      );

      if (!isFull) {
        if (containerRef.current?.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        } else if (doc.documentElement?.webkitRequestFullscreen) {
          doc.documentElement.webkitRequestFullscreen();
        } else if (videoRef.current && (videoRef.current as any).webkitEnterFullscreen) {
          // iOS Safari on iPhone fallback
          (videoRef.current as any).webkitEnterFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen();
        }
      }
    } catch (err) {
      console.warn("Fullscreen toggle failed:", err);
    }
  };

  // Picture-in-Picture toggle
  const togglePiP = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (err) {
      console.warn("PiP not supported or failed:", err);
    }
  };

  const cycleFitMode = () => {
    if (fitMode === "contain") setFitMode("cover");
    else if (fitMode === "cover") setFitMode("fill");
    else setFitMode("contain");
  };

  // Keep mobile and laptop screen awake during movie playback
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let wakeLock: any = null;

    const requestWakeLock = async () => {
      if (typeof navigator !== "undefined" && "wakeLock" in navigator && activeStream) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          wakeLock = await (navigator as any).wakeLock.request("screen");
        } catch (err) {
          console.warn("Screen Wake Lock unavailable:", err);
        }
      }
    };

    requestWakeLock();

    return () => {
      if (wakeLock) {
        wakeLock.release().catch(() => {});
      }
    };
  }, [activeStream]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full flex items-center justify-center overflow-hidden transition-all duration-300 ${
        isFullscreen
          ? "fixed inset-0 z-50 w-screen h-screen bg-black p-0 m-0"
          : `flex-1 ${ambientMode ? "bg-black" : "bg-slate-950/80"}`
      }`}
    >
      {/* Ambilight Glow Behind Video (Disabled in true fullscreen for pure cinema black) */}
      {activeStream && !isFullscreen && (
        <div
          className={`absolute inset-0 pointer-events-none transition-opacity duration-700 ${
            ambientMode ? "opacity-70 scale-105" : "opacity-30 scale-100"
          } bg-gradient-to-t from-theme-primary/20 via-theme-accent/10 to-transparent blur-3xl`}
        />
      )}

      {/* Main Video Element */}
      {activeStream ? (
        <div
          className={`relative w-full h-full flex items-center justify-center ${
            isFullscreen
              ? "p-0 m-0 max-h-none max-w-none bg-black"
              : "p-2 sm:p-4 max-h-[85vh]"
          }`}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {...({ "webkit-playsinline": "true" } as any)}
            muted={isVideoMuted}
            onClick={handleManualPlay}
            onDoubleClick={toggleFullscreen}
            className={`w-full h-full transition-all duration-200 select-none ${
              isFullscreen
                ? "rounded-none ring-0 border-0 shadow-none max-h-none max-w-none"
                : `rounded-2xl shadow-2xl ${
                    ambientMode ? "ring-1 ring-white/10 shadow-glow-lg" : "ring-1 ring-white/10"
                  }`
            } ${
              fitMode === "contain"
                ? "object-contain"
                : fitMode === "cover"
                ? "object-cover"
                : "object-fill"
            }`}
          />

          {/* iOS Safari Tap-to-Play Overlay */}
          {isPlayBlocked && (
            <div
              onClick={handleManualPlay}
              className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm cursor-pointer p-4 text-center animate-fade-in"
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-theme-primary/90 text-white flex items-center justify-center shadow-glow mb-3 animate-pulse">
                <Play className="w-8 h-8 sm:w-10 sm:h-10 ml-1 fill-white" />
              </div>
              <p className="text-sm sm:text-base font-bold text-white tracking-wide">
                Chạm để bắt đầu xem phim
              </p>
              <p className="text-xs text-slate-300 mt-1">
                {isPartnerSharing ? `${partnerName} đang phát trực tiếp` : "Đang phát màn hình"}
              </p>
            </div>
          )}

          {/* Current Stream Label Badge */}
          <div className="absolute top-3 sm:top-6 left-3 sm:left-6 z-20 flex items-center gap-2">
            <div className="px-2.5 sm:px-3 py-1 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-[10px] sm:text-[11px] text-white flex items-center gap-1.5 sm:gap-2 shadow-lg">
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
              <span className="truncate max-w-[170px] sm:max-w-none">
                {isPartnerSharing
                  ? `Màn hình của ${partnerName}`
                  : "Màn hình của bạn đang phát"}
              </span>
            </div>
          </div>

          {/* Stats Overlay */}
          {showStats && stats && (
            <div className="absolute top-3 sm:top-6 right-3 sm:right-6 z-20 bg-black/80 backdrop-blur-md border border-white/10 rounded-xl p-2 sm:p-2.5 text-[9px] sm:text-[11px] font-mono text-slate-300 shadow-xl flex flex-col gap-0.5 sm:gap-1 min-w-[140px] sm:min-w-[190px]">
              <div className="flex items-center justify-between border-b border-white/10 pb-0.5 sm:pb-1 text-white font-semibold">
                <span className="flex items-center gap-1 sm:gap-1.5">
                  <Activity className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-theme-accent" /> Stats
                </span>
                <span className="text-[9px] sm:text-[10px] text-emerald-400">{stats.codec}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Độ phân giải:</span>
                <span className="text-white font-medium">{stats.resolution}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Khung hình:</span>
                <span className="text-white font-medium">{stats.fps} fps</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Băng thông:</span>
                <span className="text-theme-accent font-medium">{stats.bitrateMbps} Mbps</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Độ trễ:</span>
                <span
                  className={
                    stats.pingMs < 50
                      ? "text-emerald-400"
                      : stats.pingMs < 100
                      ? "text-amber-400"
                      : "text-rose-400"
                  }
                >
                  {stats.pingMs} ms
                </span>
              </div>
            </div>
          )}

          {/* Floating On-Screen Quick Bar */}
          <div className="absolute bottom-3 sm:bottom-6 right-3 sm:right-6 z-20 flex items-center gap-1.5 sm:gap-2 bg-black/60 backdrop-blur-md border border-white/10 p-1 sm:p-1.5 rounded-xl shadow-lg">
            {/* Audio Toggle (Unmute button for iOS / Mobile) */}
            <button
              onClick={toggleVideoAudio}
              title={isVideoMuted ? "Bật âm thanh phim" : "Tắt tiếng phim"}
              className={`p-1.5 sm:p-2 rounded-lg text-xs transition-colors flex items-center gap-1 ${
                isVideoMuted
                  ? "text-amber-400 bg-amber-500/20 hover:bg-amber-500/30 ring-1 ring-amber-400/30"
                  : "text-emerald-400 hover:text-white hover:bg-white/10"
              }`}
            >
              {isVideoMuted ? (
                <>
                  <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-pulse" />
                  <span className="hidden sm:inline text-[10px] font-medium">Bật tiếng</span>
                </>
              ) : (
                <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              )}
            </button>

            {/* Stats Toggle */}
            <button
              onClick={() => setShowStats(!showStats)}
              title={showStats ? "Ẩn thông số kỹ thuật" : "Hiện thông số kỹ thuật"}
              className={`p-1.5 sm:p-2 rounded-lg text-xs transition-colors ${
                showStats ? "text-theme-accent bg-white/10" : "text-slate-400 hover:text-white"
              }`}
            >
              <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>

            {/* Fit Mode Toggle */}
            <button
              onClick={cycleFitMode}
              title={`Chế độ khung hình: ${
                fitMode === "contain"
                  ? "Tỉ lệ gốc (Chứa đầy)"
                  : fitMode === "cover"
                  ? "Cắt viền (Tràn màn hình)"
                  : "Kéo giãn"
              }`}
              className="p-1.5 sm:p-2 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1"
            >
              <Tv className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline capitalize text-[10px]">{fitMode}</span>
            </button>

            {/* PiP Button (Desktop / Supported browsers) */}
            <button
              onClick={togglePiP}
              title="Hình trong hình (Picture in Picture)"
              className="p-1.5 sm:p-2 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              <PictureInPicture2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>

            {/* Fullscreen Button */}
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? "Thu nhỏ (ESC)" : "Toàn màn hình"}
              className="p-1.5 sm:p-2 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              {isFullscreen ? (
                <Minimize className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              ) : (
                <Maximize className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              )}
            </button>
          </div>
        </div>
      ) : isPartnerSharing ? (
        /* Active Screen Sharing Available - Prompt Mobile to Connect */
        <div className="flex flex-col items-center justify-center p-6 text-center max-w-md animate-fade-in">
          <div className="relative mb-6">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-theme-primary/20 border border-theme-primary/40 flex items-center justify-center text-theme-primary shadow-glow animate-pulse">
              <Radio className="w-10 h-10 sm:w-12 sm:h-12" />
            </div>
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500"></span>
            </span>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold uppercase tracking-wider mb-3">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            {partnerName} đang phát màn chiếu
          </div>

          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-2">
            Đang kết nối luồng phim...
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mb-6 leading-relaxed">
            Đối phương đang chia sẻ phim. Chạm vào nút bên dưới để tải luồng hình ảnh về máy bạn ngay lập tức.
          </p>

          <button
            onClick={() => {
              setIsRequestingStream(true);
              onRequestScreenStream?.();
              setTimeout(() => setIsRequestingStream(false), 5000);
            }}
            disabled={isRequestingStream}
            className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-theme-primary to-theme-accent text-white font-bold text-sm sm:text-base shadow-glow hover:brightness-110 active:scale-95 transition-all flex items-center gap-2.5 disabled:opacity-75 disabled:pointer-events-none"
          >
            {isRequestingStream ? (
              <>
                <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                <span>Đang kết nối luồng (chờ 3-5s)...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-white" />
                <span>Chạm để kết nối xem phim</span>
              </>
            )}
          </button>

          <p className="text-[11px] text-slate-400 mt-4">
            Tự động đồng bộ và kết nối trực tiếp qua 4G/WiFi trong vài giây
          </p>
        </div>
      ) : (
        /* Empty / Waiting Stage */
        <div className="flex flex-col items-center justify-center p-6 text-center max-w-md animate-fade-in">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-theme-surface/50 border border-theme-border/40 flex items-center justify-center text-theme-primary mb-6 shadow-glow">
            <Monitor className="w-10 h-10 sm:w-12 sm:h-12" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-2">
            Màn Chiếu Đang Chờ Phim
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mb-6 leading-relaxed">
            Bạn hoặc {partnerName} có thể bấm nút &quot;Chiếu Phim&quot; ở thanh điều khiển bên dưới để bắt đầu chia sẻ phim.
          </p>

          <div className="p-3 sm:p-4 rounded-xl bg-white/5 border border-white/10 text-left text-[11px] sm:text-xs text-slate-300 space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-theme-accent">
              <Info className="w-3.5 h-3.5" /> Mẹo xem phim mượt mà và âm thanh chuẩn:
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1">
              <li>
                Khuyến khích dùng máy tính phát qua Chrome / Edge và chọn <strong>Chia sẻ thẻ (Share Tab)</strong> để lấy âm thanh gốc chuẩn Stereo.
              </li>
              <li>
                Điện thoại iPhone Safari có thể vào rạp xem mượt mà với chuẩn nén hình ảnh H.264 tối ưu pin.
              </li>
              <li>
                Nếu xem trên Netflix/Apple TV bị đen màn hình, hãy tắt tính năng &quot;Hardware Acceleration&quot; trong cài đặt trình duyệt.
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
