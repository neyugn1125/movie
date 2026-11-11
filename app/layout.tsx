import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nguyen and Crabie Cinema | Rạp Phim Trực Tuyến",
  description:
    "Trang web xem phim trực tuyến P2P kèm Voice Chat dành riêng cho cặp đôi.",
  icons: {
    icon: "/favicon.ico",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Nguyen and Crabie Cinema",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0b0f19",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="dark">
      <body className="antialiased bg-theme-bg text-white min-h-screen overscroll-none selection:bg-theme-primary/30">
        {children}
      </body>
    </html>
  );
}
