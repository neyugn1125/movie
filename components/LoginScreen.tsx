"use client";

import React, { useState } from "react";
import { UserRole } from "@/types/cinema";
import { Lock, Eye, EyeOff, Film, Sparkles } from "lucide-react";

interface LoginScreenProps {
  onLogin: (role: UserRole) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isShaking, setIsShaking] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = password.trim().toLowerCase();

    if (trimmed === "nguyen" || trimmed === "neyugn") {
      setErrorMsg("");
      onLogin("nguyen");
    } else if (trimmed === "crabie") {
      setErrorMsg("");
      onLogin("crabie");
    } else {
      setErrorMsg("Mật khẩu không đúng! Chỉ dành riêng cho Nguyen and Crabie");
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 text-white overflow-hidden selection:bg-sky-500/30">
      {/* Background Decorative Ambient Lights */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-sky-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 bg-pink-500/15 rounded-full blur-3xl pointer-events-none" />

      {/* Main Glassmorphic Card */}
      <div
        className={`relative z-10 w-full max-w-md p-6 sm:p-8 rounded-3xl bg-white/[0.04] border border-white/10 backdrop-blur-2xl shadow-2xl transition-all duration-300 ${
          isShaking ? "animate-[shake_0.5s_ease-in-out]" : ""
        }`}
      >
        {/* Brand Icon & Heading */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-sky-500/20 to-pink-500/20 border border-white/10 flex items-center justify-center mb-4 shadow-inner">
            <Film className="w-8 h-8 text-sky-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-sky-400 via-white to-pink-400 bg-clip-text text-transparent">
            Nguyen and Crabie Cinema
          </h1>
          <p className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" /> Rạp phim trực tuyến dành riêng cho hai người
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2 uppercase tracking-wider">
              Mật khẩu rạp phim
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMsg) setErrorMsg("");
                }}
                placeholder="Nhập mật khẩu của bạn..."
                className="w-full pl-10 pr-11 py-3 bg-white/[0.05] border border-white/10 rounded-xl text-white placeholder-slate-500 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-sky-400/50 focus:border-transparent transition-all"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs text-center font-medium">
              {errorMsg}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full py-3 px-4 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-sky-500 to-pink-500 hover:from-sky-400 hover:to-pink-400 active:scale-[0.98] transition-all shadow-lg shadow-sky-500/20"
          >
            Vào rạp chiếu phim
          </button>
        </form>
      </div>
    </div>
  );
};
