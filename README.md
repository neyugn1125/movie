# Nguyen and Crabie Cinema 🎬🍿

Ứng dụng web rạp chiếu phim trực tuyến P2P chất lượng cao kết hợp **Voice Chat thời gian thực**, tối ưu hóa để triển khai trực tiếp lên **Vercel**.

---

## 🌟 Tính Năng Nổi Bật

1. **Truyền Phát Video Trực Tuyến P2P (WebRTC)**:
   - Truyền tải trực tiếp giữa 2 trình duyệt không qua server trung gian, giữ nguyên độ nét và độ trễ gần bằng 0.
   - Hỗ trợ tùy chỉnh Bitrate: **Balanced (8 Mbps)**, **High Quality (15 Mbps - Mặc định)**, **Extreme (25 Mbps)**.
   - Tối ưu Codec phần cứng **VP9 / H.264** và chế độ mượt mà chống giật lag khi xem phim hành động.
   - Bảng **Realtime Stats Overlay**: Xem trực tiếp Resolution, FPS thực tế, Bitrate và Ping (ms).

2. **Hệ Thống Đăng Nhập & Đổi Theme Động (Dynamic Theme Engine)**:
   - Nhập mật khẩu **`nguyen`**: Đăng nhập vai trò **Nguyen** $\rightarrow$ Kích hoạt giao diện **Xanh Da Trời (Sky Blue)**.
   - Nhập mật khẩu **`crabie`**: Đăng nhập vai trò **Crabie** $\rightarrow$ Kích hoạt giao diện **Hồng Phấn (Sweet Pink)**.
   - Tự động lưu phiên đăng nhập vào trình duyệt.

3. **Âm Thanh Kép & Smart Audio Ducking**:
   - Tách biệt hoàn toàn luồng **Âm thanh Phim (Stereo nguyên bản)** và luồng **Voice Chat (Mic lọc tạp âm)**.
   - 2 thanh trượt điều chỉnh âm lượng độc lập (Âm lượng Phim 0–100%, Giọng đối phương 0–200%).
   - **Smart Audio Ducking**: Tự động giảm âm lượng phim xuống 35% khi đối phương bắt đầu nói chuyện và hồi phục sau 1 giây.

4. **Trải Nghiệm Rạp Phim (Cinema Experience)**:
   - **Ambient Mode (Chế độ Tắt Đèn)**: Ẩn thanh công cụ thừa, tạo ánh sáng viền **Ambilight** phát sáng theo màu theme quanh màn hình.
   - **Floating Reactions**: Thả biểu xúc cảm ❤️, 🥰, 😂, 😱, 🥺, 🍿 bay lơ lửng trên màn hình của cả hai qua WebRTC DataChannel.
   - **Sidebar Chat**: Khung chat tin nhắn mini màu sắc riêng biệt và nút **"Đồng bộ lại luồng (Reconnect)"** nhanh chóng.

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Cục Bộ

### 1. Yêu cầu tiên quyết
- Cài đặt **Node.js LTS** (khuyên dùng Node.js v20.x hoặc v22.x). Tải tại: [nodejs.org](https://nodejs.org/).

### 2. Cài đặt thư viện
Mở PowerShell / Terminal tại thư mục dự án và chạy:
```bash
npm install
```

### 3. Khởi động môi trường phát triển
```bash
npm run dev
```
Mở trình duyệt truy cập: `http://localhost:3000`

---

## 🌐 Hướng Dẫn Triển Khai Lên Vercel (1-Click Deploy)

Vì ứng dụng sử dụng mô hình P2P WebRTC và PeerJS Cloud, bạn có thể deploy lên **Vercel hoàn toàn miễn phí** mà không cần thuê server:

1. Đẩy mã nguồn lên kho lưu trữ **GitHub**:
   ```bash
   git add .
   git commit -m "feat: Nguyen and Crabie Cinema"
   git push origin main
   ```
2. Truy cập [vercel.com](https://vercel.com) $\rightarrow$ Chọn **Add New Project** $\rightarrow$ Import repo GitHub.
3. Bấm **Deploy** (giữ nguyên cấu hình Next.js mặc định).
4. (Tùy chọn) Nếu muốn xuyên tường lửa ở các mạng WiFi công ty/trường học nghiêm ngặt, hãy thêm các biến môi trường sau trong mục **Settings > Environment Variables** trên Vercel:
   - `NEXT_PUBLIC_TURN_URL`: Địa chỉ TURN Server (ví dụ từ [Metered.ca](https://www.metered.ca/tools/openrelay/) - miễn phí 50GB/tháng).
   - `NEXT_PUBLIC_TURN_USERNAME`: Tên người dùng TURN.
   - `NEXT_PUBLIC_TURN_CREDENTIAL`: Mật khẩu TURN.

---

## 💡 Mẹo Xem Phim Không Bị Đen Màn Hình & Lấy Âm Thanh Chuẩn

1. **Lấy âm thanh Stereo của phim**:
   - Khi bấm **"Chiếu Phim"**, trình duyệt sẽ mở bảng chọn chia sẻ.
   - Hãy chọn tab **"Chia sẻ thẻ (Share Tab)"** và nhớ tích chọn **"Chia sẻ cả âm thanh thẻ"**.
2. **Khắc phục màn hình đen khi xem các trang web bản quyền**:
   - Nếu chia sẻ các trang web như Netflix, Apple TV+ bị đen màn hình, hãy vào Cài đặt trình duyệt (Chrome / Edge) $\rightarrow$ Tìm kiếm *"Hardware Acceleration"* (Sử dụng tính năng tăng tốc phần cứng khi khả dụng) $\rightarrow$ **Tắt tính năng này và khởi động lại trình duyệt**.
