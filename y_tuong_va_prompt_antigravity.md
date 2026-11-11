# Kế Hoạch Ý Tưởng & Prompt Xây Dựng Web Xem Phim Cùng Người Yêu (Neyugn x Crabie Cinema)

Tài liệu này tổng hợp kiến trúc kỹ thuật tối ưu để truyền phát video **2K (2560×1440) @ 60fps** mượt mà kèm **Voice Chat** khi host trên **Vercel**, ý tưởng tính năng cho các cặp đôi và **Master Prompt** chi tiết để bạn dán trực tiếp vào **Antigravity** (hoặc các AI IDE tương đương).

---

## 1. Giải Pháp Kỹ Thuật Cho 2K 60fps & Host Trên Vercel

Vì **Vercel** vận hành theo mô hình **Serverless** (không duy trì kết nối WebSocket truyền thống lâu dài trên chính các API Route), kiến trúc của ứng dụng cần được thiết kế như sau:

| Thành phần | Giải pháp đề xuất | Lý do kỹ thuật |
| :--- | :--- | :--- |
| **Truyền tải Video & Voice** | **WebRTC (Peer-to-Peer)** hoặc **LiveKit Cloud** (Free Tier) | Truyền luồng media trực tiếp giữa 2 trình duyệt của bạn và người yêu mà không đi vòng qua server Vercel, giúp đạt độ trễ gần bằng 0 và giữ nguyên chất lượng 2K 60fps. |
| **Signaling (Bắt tay kết nối)** | **PeerJS Cloud** / **Supabase Realtime** / **LiveKit API** | Giải quyết bài toán không có WebSocket bền vững trên Vercel Serverless bằng cách dùng dịch vụ Signaling miễn phí hoặc kết nối qua Token API. |
| **Cấu hình Luồng Video 2K 60fps** | `getDisplayMedia` + `RTCRtpSender.setParameters()` | Đặt `width: { ideal: 2560 }`, `height: { ideal: 1440 }`, `frameRate: { ideal: 60 }`, `contentHint = "motion"`, nâng `maxBitrate` lên **12–20 Mbps** (`15_000_000` bps) và ép codec **VP9 / H.264**. |
| **Âm thanh Phim + Voice Chat** | Tách 2 luồng Audio (`Screen Audio` + `Mic Audio`) | Tránh hiện tượng bộ khử tiếng ồn của Mic (`noiseSuppression`, `echoCancellation`) làm méo tiếng phim. Có thanh trượt chỉnh âm lượng Phim và giọng người yêu riêng biệt (**Audio Ducking**). |
| **Xác thực & Đổi Theme** | Mật khẩu (`neyugn` / `crabie`) + CSS Variables | Không cần tạo tài khoản rườm rà: nhập `neyugn` sẽ vào vai **Neyugn** (Theme Xanh da trời - Sky Blue), nhập `crabie` sẽ vào vai **Crabie** (Theme Hồng Pastel - Sweet Pink). |

---

## 2. Ý Tưởng Tính Năng & Giao Diện Độc Đáo Cho Cặp Đôi

1. **Cổng Đăng Nhập Tương Tác Theo Mật Khẩu (Identity & Dynamic Theme)**:
   - Nhập mật khẩu **`neyugn`**: Đăng nhập dưới tên **Neyugn**, toàn bộ giao diện chuyển sang tông **Xanh da trời (Sky Blue)** (`#0ea5e9`, `#38bdf8`, nền kính mờ dịu mắt).
   - Nhập mật khẩu **`crabie`**: Đăng nhập dưới tên **Crabie**, toàn bộ giao diện chuyển sang tông **Hồng ngọt ngào (Sweet Pink)** (`#ec4899`, `#f472b6`, nền hồng phấn lãng mạn).
   - Tự động nhận diện đối phương khi cả hai cùng online trong phòng (ví dụ: *"Crabie đã vào rạp chiếu phim cùng Neyugn"*).
2. **Rạp Chiếu Phim 2K 60fps (Cinema Stage)**:
   - **Chế độ Tắt Đèn (Ambient Cinema Mode)**: Làm tối toàn bộ viền giao diện khi xem phim, tích hợp hiệu ứng ánh sáng viền **Ambilight** tỏa ra theo màu khung hình của video.
   - **Bộ chọn Bitrate & Stats Realtime**: Hiển thị thông số thực tế trên góc màn hình (`2560x1440 @ 60fps | Bitrate: 15 Mbps | Ping: 12ms`) để kiểm tra độ nét bất cứ lúc nào.
   - **Tự động Giảm Âm Phim Khi Nói (Smart Audio Ducking)**: Khi một trong hai người nói vào mic, âm lượng của tab phim có thể tự động nhỏ xuống 30% để nghe rõ giọng nhau, hoặc điều chỉnh bằng 2 thanh trượt độc lập (Âm lượng Phim vs. Âm lượng Người Yêu).
3. **Góc Tương Tác Cặp Đôi (Couple Widget)**:
   - **Floating Hearts & Reactions**: Nút thả tim, ôm, hôn, bất ngờ bay lơ lửng ngay trên màn hình phim kèm hiệu ứng hạt (particle animation).
   - **Mini Chat & Watchlist**: Khung chat nhỏ gọn bên cạnh để gửi link phim hoặc nhắn tin khi không tiện bật mic.
   - **Gợi ý Mẹo Share Không Đen Màn Hình**: Hướng dẫn tắt *Hardware Acceleration* trên trình duyệt nếu xem từ các nền tảng có DRM, hoặc khuyên dùng **Chrome / Edge** và chọn **"Share Tab"** để lấy được âm thanh gốc chuẩn Stereo.

---

## 3. Master Prompt Để Dán Vào Antigravity

Hãy sao chép toàn bộ nội dung trong khung bên dưới và gửi cho **Antigravity** để tạo toàn bộ mã nguồn dự án hoàn chỉnh:

```markdown
Bạn là một Senior Full-Stack & WebRTC Engineer. Hãy xây dựng cho tôi một ứng dụng web hoàn chỉnh mang tên **"Neyugn & Crabie Cinema"** — trang web xem phim trực tuyến dành riêng cho 2 người (cặp đôi) thông qua tính năng chia sẻ màn hình chất lượng cao (2K 60fps) kết hợp Voice Chat thời gian thực, tối ưu hóa để deploy trực tiếp lên **Vercel**.

### 1. TECH STACK YÊU CẦU
- **Framework**: Next.js 14+ (App Router), TypeScript, Tailwind CSS, Lucide React (icons), Framer Motion (hiệu ứng chuyển cảnh và thả tim).
- **WebRTC & Signaling (Tương thích Vercel Serverless)**:
  - Sử dụng **PeerJS** (`peerjs`) kết hợp STUN/TURN servers miễn phí (Google STUN + cấu hình mở rộng biến môi trường `NEXT_PUBLIC_TURN_URL`, `NEXT_PUBLIC_TURN_USERNAME`, `NEXT_PUBLIC_TURN_CREDENTIAL` cho Metered/Cloudflare TURN để xuyên NAT ổn định).
  - Thiết kế cơ chế định danh Peer ID cố định dựa trên mật khẩu đăng nhập để 2 người tự động tìm thấy nhau ngay khi vào trang mà không cần copy-paste mã phòng phức tạp (ví dụ: người đăng nhập bằng `neyugn` sẽ lấy Peer ID là `couple-cinema-room-neyugn`, người đăng nhập bằng `crabie` sẽ lấy Peer ID là `couple-cinema-room-crabie`, và cả hai tự động kết nối P2P với nhau).

### 2. HỆ THỐNG ĐĂNG NHẬP BẰNG MẬT KHẨU & ĐỔI GIAO DIỆN ĐỘNG (DYNAMIC THEME)
- Trang đầu tiên khi truy cập là màn hình khóa lãng mạn, hiện đại (Glassmorphism).
- Người dùng chỉ cần nhập mật khẩu vào 1 ô duy nhất (có nút ẩn/hiện mật khẩu và thông báo lỗi mượt mà nếu nhập sai):
  1. Nếu mật khẩu là **`neyugn`** (không phân biệt hoa thường ở bước trim khoảng trắng, nhưng khớp chính xác chuỗi `neyugn`):
     - Đăng nhập thành công với vai trò **Neyugn** (Partner Peer ID cần kết nối tới là `crabie`).
     - Kích hoạt **Sky Blue Theme (Giao diện Xanh Da Trời)**:
       - Primary: `#0284c7` / `#38bdf8` (Sky Blue), Accent: `#7dd3fc`, Background: Gradient xanh da trời dịu nhẹ kết hợp Dark Cinema (`#081b29` -> `#0c4a6e` hoặc chế độ sáng/tối tùy chỉnh mang sắc xanh da trời chủ đạo).
  2. Nếu mật khẩu là **`crabie`**:
     - Đăng nhập thành công với vai trò **Crabie** (Partner Peer ID cần kết nối tới là `neyugn`).
     - Kích hoạt **Sweet Pink Theme (Giao diện Màu Hồng)**:
       - Primary: `#db2777` / `#f472b6` (Sweet Pink), Accent: `#f9a8d4`, Background: Gradient hồng pastel/rose dịu ngọt kết hợp Dark Cinema (`#2a0818` -> `#831843`).
  3. Nếu nhập mật khẩu khác: Báo lỗi *"Mật khẩu không đúng! Chỉ dành riêng cho Neyugn & Crabie"*.
- Lưu trạng thái phiên đăng nhập vào `localStorage` và dùng CSS Variables (`--theme-primary`, `--theme-secondary`, `--theme-bg`, `--theme-glow`, `--theme-border`) trên thẻ `root` để toàn bộ nút bấm, viền video, thanh âm lượng, icon, hiệu ứng phát sáng (glow) và bóng đổ tự động đổi màu theo đúng người đăng nhập. Có nút "Đổi tài khoản / Đăng xuất" ở góc trên.

### 3. YÊU CẦU KỸ THUẬT CHIA SẺ MÀN HÌNH 2K 60FPS & TỐI ƯU WEBRTC
Hãy viết một custom hook hoặc module quản lý WebRTC (`useCinemaWebRTC.ts`) đáp ứng nghiêm ngặt các thông số sau:
1. **Capture Màn Hình Chuẩn 2K 60fps (`navigator.mediaDevices.getDisplayMedia`)**:
   ```ts
   const displayStream = await navigator.mediaDevices.getDisplayMedia({
     video: {
       width: { ideal: 2560, max: 3840 },
       height: { ideal: 1440, max: 2160 },
       frameRate: { ideal: 60, max: 60 },
       cursor: "motion"
     },
     audio: {
       echoCancellation: false,
       noiseSuppression: false,
       autoGainControl: false,
       sampleRate: 48000,
       channelCount: 2
     }
   });
   ```
2. **Tối ưu Video Track & Bitrate (Chống mờ, chống tụt FPS)**:
   - Ngay sau khi lấy được video track từ `displayStream`:
     ```ts
     const videoTrack = displayStream.getVideoTracks()[0];
     if ('contentHint' in videoTrack) {
       videoTrack.contentHint = 'motion'; // Ưu tiên giữ 60fps mượt mà khi xem phim
     }
     ```
   - Khi thiết lập `RTCPeerConnection` và thêm track (`RTCRtpSender`), viết hàm nâng giới hạn băng thông (`setParameters`) cho video sender:
     - Cho phép chọn mức Bitrate ngay trên giao diện: **Balanced (8 Mbps)**, **Ultra 2K 60fps (15 Mbps - Mặc định)**, **Extreme (25 Mbps)**.
     - Đặt `degradationPreference: "maintain- framerate"` hoặc `"balanced"` (có nút chuyển đổi trên UI: *"Ưu tiên 60fps"* vs *"Ưu tiên độ nét 2K"*).
   - Ưu tiên sắp xếp Codec **VP9** hoặc **H.264** thông qua `RTCRtpTransceiver.setCodecPreferences` nếu trình duyệt hỗ trợ để tận dụng giải mã phần cứng (Hardware Acceleration).
3. **Tách Biệt Luồng Âm Thanh Phim (System/Tab Audio) & Voice Chat (Microphone)**:
   - **Luồng Voice Chat (`getUserMedia`)**: Bật `echoCancellation: true`, `noiseSuppression: true`, `autoGainControl: true` để lọc tạp âm khi nói chuyện.
   - **Luồng Âm Thanh Phim (`getDisplayMedia` audio track)**: Tuyệt đối tắt hết các bộ lọc giọng nói để giữ nguyên âm thanh gốc Stereo chất lượng cao của bộ phim.
   - Ở phía người nhận, tách thành 2 thẻ `<audio>` / `<video>` hoặc quản lý bằng Web Audio API để người xem có **2 thanh trượt âm lượng độc lập**:
     1. 🎬 **Âm lượng Phim** (0% - 100%)
     2. 🎙️ **Âm lượng Giọng Người Yêu** (0% - 200%, hỗ trợ khuếch đại bằng `GainNode` nếu mic người yêu nhỏ).
   - Tính năng **Smart Audio Ducking (Tự động giảm tiếng phim khi nói)**: Có nút bật/tắt; khi phát hiện người yêu đang nói qua `AnalyserNode`, tự động giảm nhẹ âm lượng phim xuống 35% và trả lại 100% sau khi ngừng nói 1 giây.

### 4. GIAO DIỆN & TÍNH NĂNG TRẢI NGHIỆM (UI/UX)
1. **Header Tinh Gọn**:
   - Hiển thị logo **"Neyugn & Crabie Cinema"**.
   - Badge trạng thái kết nối thời gian thực: *"Đang chờ đối phương..."* (nhấp nháy) hoặc *"Đã kết nối với [Tên người yêu] 🟢"*.
   - Nút bật/tắt **Chế độ Tắt Đèn (Lights Off / Ambient Mode)**: Ẩn các thanh công cụ thừa và tạo hiệu ứng viền sáng Ambilight mờ ảo xung quanh khung video theo tông màu theme (`neyugn` xanh da trời hoặc `crabie` hồng).
2. **Khung Chiếu Phim Trung Tâm (Main Cinema Stage)**:
   - Hỗ trợ Fullscreen, Picture-in-Picture (PiP), và nút chỉnh tỷ lệ khung hình (`Fit` / `Contain` / `Cover`).
   - **Bảng thông số Realtime Stats Overlay** (có thể bật/tắt ở góc video): Đọc từ `pc.getStats()` mỗi giây để hiển thị độ phân giải thực tế đang nhận/gửi (VD: `2560x1440`), `FPS` hiện tại (`60 fps`), `Bitrate` (`15.2 Mbps`), và `Round-trip Ping` (`ms`).
3. **Thanh Điều Khiển Dưới Cùng (Control Dock kiểu macOS / Discord)**:
   - Nút **Bắt đầu / Dừng Share Màn Hình** (kèm menu chọn Bitrate 8/15/25 Mbps và chế độ ưu tiên FPS/Resolution).
   - Nút **Bật / Tắt Mic (Mute/Unmute)** kèm vòng sáng nhấp nháy (Voice Activity Indicator) mỗi khi người nói phát ra âm thanh.
   - Hai thanh trượt chỉnh **Âm lượng Phim** và **Âm lượng Mic đối phương** + nút bật **Auto Ducking**.
   - Dãy nút **Thả Cảm Xúc Nhanh (Floating Reactions)**: ❤️, 🥰, 😂, 😱, 🥺, 🍿 — khi bấm sẽ gửi qua WebRTC `RTCDataChannel` để làm bay hiệu ứng icon lơ lửng trên màn hình của cả hai người ngay lập tức.
4. **Sidebar Chat & Tiện Ích Cặp Đôi (Có thể đóng/mở gọn gàng)**:
   - Nhắn tin văn bản qua `RTCDataChannel` (hiển thị bong bóng chat mang màu xanh da trời cho Neyugn và màu hồng cho Crabie).
   - Nút **"Đồng bộ lại luồng (Reconnect / Refresh Stream)"** nếu mạng chập chờn mà không cần tải lại cả trang.

### 5. ĐẦU RA MONG MUỐN
- Tạo đầy đủ cấu trúc thư mục chuẩn Next.js App Router (`app/page.tsx`, `app/layout.tsx`, `components/LoginScreen.tsx`, `components/CinemaRoom.tsx`, `components/ControlDock.tsx`, `hooks/useCinemaWebRTC.ts`, `types/cinema.ts`, `app/globals.css`).
- Đảm bảo code không có placeholder trống, xử lý đầy đủ `use client` để không gặp lỗi `window is not defined` khi build trên Vercel.
- Kiểm tra kỹ lưỡng việc dọn dẹp (`cleanup`) các MediaStream tracks và PeerJS connections khi component unmount.
```
