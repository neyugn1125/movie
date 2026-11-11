"use client";

import React, { useEffect, useState } from "react";
import { ChatMessage, UserRole } from "@/types/cinema";
import { MessageSquare, X, ChevronRight } from "lucide-react";

interface MessageNotificationToastProps {
  message: ChatMessage | null;
  myRole: UserRole;
  onOpenChat: () => void;
  onClose: () => void;
}

export const MessageNotificationToast: React.FC<MessageNotificationToastProps> = ({
  message,
  myRole,
  onOpenChat,
  onClose,
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (message && message.sender !== myRole) {
      setIsVisible(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onClose, 300);
      }, 10000);

      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [message, myRole, onClose]);

  if (!message || !isVisible) return null;

  const isSenderNguyen = message.sender === "nguyen" || (message.sender as string) === "neyugn";
  const senderName = isSenderNguyen ? "Nguyen" : "Crabie";
  const avatarBg = isSenderNguyen
    ? "from-sky-500 to-blue-600 border-sky-400/40 text-white"
    : "from-pink-500 to-rose-600 border-pink-400/40 text-white";

  return (
    <aside
      role="status"
      aria-live="polite"
      className="fixed top-14 sm:top-16 right-3 sm:right-6 z-50 max-w-[92vw] sm:max-w-sm select-none transition-all duration-300 transform translate-y-0 opacity-100"
    >
      <div
        onClick={onOpenChat}
        className="cursor-pointer group flex items-start gap-3 p-3 sm:p-3.5 rounded-2xl bg-slate-900/95 border border-white/20 backdrop-blur-2xl shadow-2xl hover:border-white/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
      >
        {/* Sender Avatar */}
        <div
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr ${avatarBg} border flex items-center justify-center font-bold text-sm shadow-md flex-shrink-0`}
        >
          {senderName.charAt(0)}
        </div>

        {/* Message Content */}
        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="text-xs font-bold text-white truncate flex items-center gap-1.5">
              <MessageSquare className="w-3 h-3 text-theme-accent inline" />
              {senderName}
            </span>
            <span className="text-[10px] text-slate-400">
              {new Date(message.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <p className="text-xs text-slate-200 line-clamp-2 leading-relaxed break-words font-medium">
            {message.text}
          </p>
          <div className="mt-1 flex items-center text-[10px] text-theme-accent font-semibold group-hover:underline">
            <span>Chạm để trả lời</span>
            <ChevronRight className="w-3 h-3 inline ml-0.5" />
          </div>
        </div>

        {/* Dismiss Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsVisible(false);
            setTimeout(onClose, 200);
          }}
          title="Đóng thông báo"
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
};
