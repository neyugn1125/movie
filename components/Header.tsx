"use client";

import React from "react";
import { UserRole } from "@/types/cinema";
import { Film, Moon, Sun, LogOut, Radio } from "lucide-react";

interface HeaderProps {
  myRole: UserRole;
  isPartnerConnected: boolean;
  ambientMode: boolean;
  onToggleAmbient: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  myRole,
  isPartnerConnected,
  ambientMode,
  onToggleAmbient,
  onLogout,
}) => {
  const myName = myRole === "nguyen" ? "Nguyen" : "Crabie";
  const partnerName = myRole === "nguyen" ? "Crabie" : "Nguyen";

  return (
    <header
      className={`w-full px-4 sm:px-6 py-3 flex items-center justify-between border-b backdrop-blur-xl transition-all duration-300 z-30 ${
        ambientMode
          ? "bg-black/60 border-white/5 opacity-40 hover:opacity-100"
          : "bg-theme-surface/70 border-theme-border/20 shadow-sm"
      }`}
    >
      {/* Brand Logo & Identity */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-theme-primary/30 to-theme-accent/20 border border-theme-border/40 flex items-center justify-center text-theme-primary shadow-glow">
          <Film className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2">
            Nguyen and Crabie Cinema
          </h1>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span>Bạn đang là:</span>
            <span className="font-semibold text-theme-accent capitalize">
              {myName}
            </span>
          </div>
        </div>
      </div>

      {/* Center: Live Connection Status Badge */}
      <div className="hidden md:flex items-center">
        <div
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all ${
            isPartnerConnected
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-amber-500/10 border-amber-500/30 text-amber-400 animate-pulse-slow"
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>
            {isPartnerConnected
              ? `Đã kết nối với ${partnerName}`
              : "Đang chờ đối phương vào rạp..."}
          </span>
        </div>
      </div>

      {/* Right Controls: Ambient Mode & Logout */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Ambient Mode (Lights Off) */}
        <button
          onClick={onToggleAmbient}
          title={ambientMode ? "Bật đèn (Hiện giao diện)" : "Tắt đèn (Chế độ rạp phim)"}
          className={`p-2 sm:px-3 sm:py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-all ${
            ambientMode
              ? "bg-amber-400/20 text-amber-300 border-amber-400/30"
              : "bg-white/5 hover:bg-white/10 text-slate-300 border-white/10"
          }`}
        >
          {ambientMode ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4" />}
          <span className="hidden sm:inline">{ambientMode ? "Bật đèn" : "Tắt đèn"}</span>
        </button>

        {/* Logout */}
        <button
          onClick={onLogout}
          title="Đổi tài khoản"
          className="p-2 sm:px-3 sm:py-1.5 rounded-xl text-xs font-medium bg-white/5 hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/30 text-slate-400 border border-white/10 flex items-center gap-1.5 transition-all"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Đổi vai trò</span>
        </button>
      </div>
    </header>
  );
};
