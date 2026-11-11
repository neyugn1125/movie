"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChatMessage, UserRole } from "@/types/cinema";
import { Send, RefreshCw, X, MessageSquare } from "lucide-react";

interface SidebarChatProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  myRole: UserRole;
  onReconnect: () => void;
  partnerName: string;
}

export const SidebarChat: React.FC<SidebarChatProps> = ({
  isOpen,
  onClose,
  messages,
  onSendMessage,
  myRole,
  onReconnect,
  partnerName,
}) => {
  const [text, setText] = useState("");
  const [isReconnecting, setIsReconnecting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom of chat when new message arrives or drawer opens
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      // Small timeout to focus on desktop without triggering virtual keyboard scroll bug on mobile
      const timer = setTimeout(() => {
        if (window.innerWidth >= 640) {
          inputRef.current?.focus();
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [messages, isOpen]);

  // Handle ESC key to close drawer menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSendMessage(text);
    setText("");
  };

  const handleReconnectClick = () => {
    setIsReconnecting(true);
    onReconnect();
    setTimeout(() => setIsReconnecting(false), 2000);
  };

  return (
    <>
      {/* Backdrop Overlay (Click to dismiss menu drawer) */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden="true"
      />

      {/* Slide-out Menu Drawer Panel */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-[88vw] max-w-sm sm:w-96 bg-slate-900/98 border-l border-white/10 backdrop-blur-2xl flex flex-col shadow-2xl transition-transform duration-300 ease-out transform ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Menu Header */}
        <div className="p-3.5 sm:p-4 pt-safe border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-theme-primary/20 border border-theme-primary/30 flex items-center justify-center text-theme-accent">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Menu Trò Chuyện</h3>
              <p className="text-[10px] text-slate-400">Rạp phim cùng {partnerName}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Reconnect Button */}
            <button
              onClick={handleReconnectClick}
              title="Đồng bộ / Kết nối lại luồng nếu giật lag"
              className={`p-2 rounded-xl text-xs border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 transition-all ${
                isReconnecting ? "animate-spin text-theme-accent" : ""
              }`}
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              title="Đóng menu"
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 active:bg-white/20 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages Scroll Area */}
        <div className="flex-1 p-3.5 sm:p-4 overflow-y-auto space-y-3 overscroll-contain">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-400">
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-2 text-slate-500">
                <MessageSquare className="w-6 h-6" />
              </div>
              <p className="text-xs font-medium">Chưa có tin nhắn nào</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Gửi lời chào hoặc cảm nghĩ về bộ phim đến {partnerName}!
              </p>
            </div>
          ) : (
            messages.map((m) => {
              const isMe = m.sender === myRole;
              const isSenderNguyen = m.sender === "nguyen" || (m.sender as string) === "neyugn";
              const senderDisplayName = isSenderNguyen ? "Nguyen" : "Crabie";

              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                >
                  <span className="text-[10px] text-slate-500 mb-1 px-1">
                    {senderDisplayName} •{" "}
                    {new Date(m.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <div
                    className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-xs sm:text-[13px] leading-relaxed break-words shadow-md select-text ${
                      isSenderNguyen
                        ? "bg-sky-500/25 text-sky-100 border border-sky-400/30 rounded-tr-sm"
                        : "bg-pink-500/25 text-pink-100 border border-pink-400/30 rounded-tl-sm"
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Chat Input Bar */}
        <form
          onSubmit={handleSend}
          className="p-3 pb-safe border-t border-white/10 flex items-center gap-2 bg-slate-950/80"
        >
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Nhắn với ${partnerName}...`}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-base sm:text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-theme-primary transition-all"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            title="Gửi tin nhắn"
            className="p-2.5 rounded-xl bg-theme-primary hover:bg-theme-accent disabled:opacity-40 disabled:hover:bg-theme-primary text-white transition-all shadow-glow flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </aside>
    </>
  );
};
