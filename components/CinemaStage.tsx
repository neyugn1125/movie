"use client";

import React, { useRef, useState, useEffect } from "react";
import { StreamStats } from "@/types/cinema";
import {
  Maximize,
  Minimize,
  PictureInPicture2,
  Activity,
  Monitor,
  Info,
  Tv,
} from "lucide-react";

interface CinemaStageProps {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isSharingScreen: boolean;
  isPartnerSharing: boolean;
  ambientMode: boolean;
  stats: StreamStats | null;
  partnerName: string;
}

export const CinemaStage: React.FC<CinemaStageProps> = ({
  localStream,
  remoteStream,
  isSharingScreen,
  isPartnerSharing,
  ambientMode,
  stats,
  partnerName,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fitMode, setFitMode] = useState<"contain" | "cover" | "fill">("contain");
  const [showStats, setShowStats] = useState(true);

  // Active stream is either remote (if partner is sharing) or local (if I am sharing)
  const activeStream = remoteStream || (isSharingScreen ? localStream : null);

  useEffect(() => {
    if (videoRef.current) {
      if (activeStream) {
        videoRef.current.srcObject = activeStream;
        videoRef.current.play().catch((err) => {
          console.warn("Video auto-play interrupted:", err);
        });
      } else {
        videoRef.current.srcObject = null;
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
          // iOS Safari on iPhone
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
            muted={true} // Film audio is managed by Web Audio API for volume control & ducking
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

          {/* Quick On-Screen Video Toolbar */}
          <div className="absolute bottom-3 sm:bottom-6 right-3 sm:right-6 z-20 flex items-center gap-1 sm:gap-2 bg-black/75 backdrop-blur-md border border-white/10 rounded-xl p-1 sm:p-1.5 opacity-70 hover:opacity-100 transition-opacity">
            <button
              onClick={() => setShowStats(!showStats)}
              title="Bật/Tắt bảng thông số"
              className={`p-1.5 rounded-lg text-xs transition-colors ${
                showStats ? "text-theme-accent bg-white/10" : "text-slate-400 hover:text-white"
              }`}
            >
              <Activity className="w-4 h-4" />
            </button>
            <button
              onClick={cycleFitMode}
              title={`Tỉ lệ hiển thị: ${
                fitMode === "contain"
                  ? "Vừa vặn (Gốc)"
                  : fitMode === "cover"
                  ? "Tràn màn hình (Cover)"
                  : "Kéo giãn (Fill)"
              }`}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 text-xs transition-colors flex items-center gap-1"
            >
              <Tv className="w-4 h-4" />
              <span className="text-[10px] uppercase font-mono hidden sm:inline">{fitMode}</span>
            </button>
            <button
              onClick={togglePiP}
              title="Chế độ thu nhỏ (Picture-in-Picture)"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 text-xs transition-colors"
            >
              <PictureInPicture2 className="w-4 h-4" />
            </button>
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình thực tế"}
              className={`p-1.5 rounded-lg text-xs transition-colors ${
                isFullscreen
                  ? "bg-theme-primary text-white"
                  : "text-slate-400 hover:text-white hover:bg-white/10"
              }`}
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
        </div>
      ) : (
        /* Standby Cinema Stage */
        <div className="flex flex-col items-center justify-center p-8 max-w-lg text-center z-10 animate-fade-in">
          <div className="w-20 h-20 rounded-3xl bg-theme-primary/10 border border-theme-border/30 flex items-center justify-center text-theme-primary mb-6 shadow-glow">
            <Monitor className="w-10 h-10" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2 tracking-tight">
            Màn Chiếu Đang Chờ Phim
          </h2>
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            Bạn hoặc {partnerName} có thể bấm nút{" "}
            <span className="text-theme-accent font-semibold">"Bắt đầu chia sẻ màn hình"</span> ở
            thanh điều khiển bên dưới để bắt đầu chiếu phim.
          </p>

          {/* DRM / Anti-Black Screen Tip Box */}
          <div className="w-full p-4 rounded-2xl bg-white/[0.03] border border-white/10 text-left text-xs text-slate-300 space-y-2 backdrop-blur-md">
            <div className="flex items-center gap-2 text-theme-accent font-medium">
              <Info className="w-4 h-4 flex-shrink-0" />
              <span>Mẹo chia sẻ âm thanh Stereo & chống đen màn hình:</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-400 pl-1 leading-relaxed">
              <li>
                Sử dụng trình duyệt <strong>Chrome / Edge</strong> và chọn <strong>"Chia sẻ thẻ (Share Tab)"</strong> để lấy âm thanh gốc chuẩn Stereo của phim.
              </li>
              <li>
                Nếu xem trên Netflix/Apple TV bị đen màn hình, hãy tắt <em>"Hardware Acceleration"</em> (Sử dụng tính năng tăng tốc đồ họa phần cứng) trong cài đặt trình duyệt.
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
