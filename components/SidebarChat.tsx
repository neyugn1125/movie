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

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

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

  if (!isOpen) return null;

  return (
    <aside className="fixed inset-y-0 right-0 w-80 sm:w-96 bg-slate-900/95 border-l border-white/10 backdrop-blur-2xl z-40 flex flex-col shadow-2xl animate-fade-in">
      {/* Drawer Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-theme-accent" />
          <h3 className="text-sm font-semibold text-white">Tin Nhắn Rạp Phim</h3>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Reconnect Button */}
          <button
            onClick={handleReconnectClick}
            title="Đồng bộ / Kết nối lại luồng nếu giật lag"
            className={`p-1.5 rounded-lg text-xs border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 transition-all ${
              isReconnecting ? "animate-spin text-theme-accent" : ""
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            title="Đóng"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages List */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4">
            <p className="text-xs text-slate-400">
              Chưa có tin nhắn nào. Hãy gửi lời chào đến {partnerName}!
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const isMe = m.sender === myRole;
            const isSenderNeyugn = m.sender === "neyugn";
            const senderDisplayName = isSenderNeyugn ? "Neyugn" : "Crabie";

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
                  className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-xs leading-relaxed break-words shadow-md ${
                    isSenderNeyugn
                      ? "bg-sky-500/20 text-sky-100 border border-sky-500/30 rounded-tr-sm"
                      : "bg-pink-500/20 text-pink-100 border border-pink-500/30 rounded-tl-sm"
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

      {/* Chat Input Box */}
      <form onSubmit={handleSend} className="p-3 border-t border-white/10 flex items-center gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Nhắn tin với ${partnerName}...`}
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-theme-primary transition-all"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="p-2.5 rounded-xl bg-theme-primary hover:bg-theme-accent disabled:opacity-40 disabled:hover:bg-theme-primary text-white transition-all shadow-glow"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </aside>
  );
};
