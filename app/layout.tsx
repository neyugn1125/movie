import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nguyen and Crabie Cinema | Rạp Phim Trực Tuyến",
  description:
    "Trang web xem phim trực tuyến P2P kèm Voice Chat dành riêng cho cặp đôi.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="dark">
      <body className="antialiased bg-theme-bg text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}
