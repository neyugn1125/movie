"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { UserRole } from "@/types/cinema";
import { LoginScreen } from "@/components/LoginScreen";

// Dynamically import CinemaRoom to ensure zero SSR WebRTC issues on Vercel
const CinemaRoom = dynamic(
  () => import("@/components/CinemaRoom").then((mod) => mod.CinemaRoom),
  { ssr: false }
);

const STORAGE_KEY = "nguyen_crabie_cinema_role";
const OLD_STORAGE_KEY = "neyugn_crabie_cinema_role";

export default function Home() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [isMounted, setIsMounted] = useState<boolean>(false);

  useEffect(() => {
    setIsMounted(true);
    let savedRole = localStorage.getItem(STORAGE_KEY) as string | null;
    if (!savedRole) {
      savedRole = localStorage.getItem(OLD_STORAGE_KEY);
    }

    if (savedRole === "nguyen" || savedRole === "neyugn") {
      setRole("nguyen");
      document.documentElement.setAttribute("data-theme", "nguyen");
    } else if (savedRole === "crabie") {
      setRole("crabie");
      document.documentElement.setAttribute("data-theme", "crabie");
    }
  }, []);

  const handleLogin = (userRole: UserRole) => {
    setRole(userRole);
    localStorage.setItem(STORAGE_KEY, userRole);
    document.documentElement.setAttribute("data-theme", userRole);
  };

  const handleLogout = () => {
    setRole(null);
    localStorage.removeItem(STORAGE_KEY);
    document.documentElement.removeAttribute("data-theme");
  };

  if (!isMounted) {
    // Avoid SSR hydration flicker
    return (
      <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!role) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return <CinemaRoom myRole={role} onLogout={handleLogout} />;
}
