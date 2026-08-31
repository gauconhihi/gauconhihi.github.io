# 🌟 GitShow & CloudVault — GitHub Showcase & Cloud Storage Hub

Trang web hiện đại, siêu nhẹ, giao diện sáng (Light pastel & soft glassmorphism), bo cong viền mềm mại (`rounded-2xl` - `rounded-4xl`), tối ưu chạy mượt mà 100% trên **Cloudflare Pages** và liên kết với tài khoản GitHub (`gauconhihi`).

---

## ✨ Các Tính Năng Nổi Bật

1. **GitHub Repositories Showcase (Trưng bày dự án):**
   - Tự động lấy toàn bộ Repository công khai & riêng tư qua GitHub REST API.
   - Thẻ hiển thị số sao ⭐, số fork 🍴, ngôn ngữ lập trình, dung lượng, thời gian cập nhật.
   - Nút **"Xem Web"** dẫn trực tiếp đến link GitHub Pages (`gauconhihi.github.io/<repo>`) hoặc Domain Cloudflare Pages tùy chỉnh.
   - Nút **"Mã Nguồn"** xem code trực tiếp trên GitHub.
   - Tìm kiếm nhanh theo từ khóa, lọc theo ngôn ngữ lập trình và sắp xếp theo sao / thời gian.

2. **Git Cloud Vault (Uploader & Kho lưu trữ vô hạn):**
   - Hệ thống xác thực/Đăng nhập (Login / Register / Multi-user) bảo vệ dữ liệu riêng tư.
   - Hỗ trợ chọn Repository lưu trữ (mặc định: `filevault`), chọn nhánh (`main`) và thư mục con (`uploads/`).
   - Kéo & thả tệp tin hoặc chọn nhiều tệp cùng lúc (ảnh, video, văn bản, zip, tài liệu...).
   - Tự động mã hóa Base64 và đẩy commit trực tiếp vào GitHub API.
   - Trình duyệt tệp (File Manager): Tải xuống trực tiếp, sao chép liên kết tải nhanh (Raw URL), xóa tệp khỏi Repo.
   - Chức năng tạo nhanh Repository Private mới ngay trên giao diện web.

3. **Hướng Dẫn Cloudflare Pages & Gắn Tên Miền (Custom Domain):**
   - Hướng dẫn trực quan từng bước kết nối GitHub Repo với Cloudflare Pages.
   - Thiết lập Custom Domain không giới hạn băng thông, SSL miễn phí, không lo đứt cáp hay chặn mạng.
   - Hướng dẫn cấp quyền mời thành viên / quản trị viên Cloudflare an toàn.

---

## 🚀 Hướng Dẫn Triển Khai Lên Cloudflare Pages

### Bước 1: Đẩy thư mục này lên GitHub
```bash
git init
git add .
git commit -m "feat: init GitShow & CloudVault"
git branch -M main
git remote add origin https://github.com/gauconhihi/filevault.git # Hoặc repo tên bạn muốn
git push -u origin main
```

### Bước 2: Tạo dự án Cloudflare Pages
1. Truy cập [dash.cloudflare.com](https://dash.cloudflare.com)
2. Chọn menu **Workers & Pages** > **Create application** > Chọn tab **Pages** > Bấm **Connect to Git**.
3. Chọn tài khoản GitHub `gauconhihi` và chọn Repository chứa web này.
4. Ở phần cấu hình build:
   - **Framework preset**: `None`
   - **Build command**: (Để trống)
   - **Build output directory**: `/` (hoặc để trống)
5. Bấm **Save and Deploy**.

### Bước 3: Gắn Custom Domain k24z.sryze.cc
1. Sau khi Deploy hoàn tất, vào project Pages vừa tạo > Chọn tab **Custom domains**.
2. Bấm **Set up a custom domain** và nhập tên miền: `k24z.sryze.cc` (hoặc subdomain như `showcase.k24z.sryze.cc`).
3. Cloudflare sẽ tự động định tuyến DNS trên zone `k24z.sryze.cc` (Account ID: `23d2c5821b5d28250d8b2da29c256268`) và kích hoạt chứng chỉ SSL/HTTPS.
4. Các repo demo sẽ tự động truy cập theo định dạng: `https://k24z.sryze.cc/<tên-repo>/`.

---

## 🔑 Hướng Dẫn Tạo GitHub Personal Access Token (PAT)

Để sử dụng tính năng **Upload tệp vào Repo** và **Hiện Repo Private**:
1. Vào GitHub > **Settings** > **Developer settings** > **Personal access tokens** > **Tokens (classic)**.
2. Bấm **Generate new token (classic)**.
3. Đặt tên token và tích chọn quyền: `repo` (Toàn quyền quản lý repository).
4. Sao chép chuỗi token (dạng `ghp_xxxxxxxxxxxx`) và dán vào nút **"Token Git"** trên thanh Menu của trang web.

---

## 💻 Chạy Thử Nghiệm Tại Máy Cục Bộ

Bạn có thể mở trực tiếp file `index.html` trong trình duyệt hoặc khởi chạy local server:
```bash
# Bằng Python 3:
python3 -m http.server 3000

# Hoặc bằng Node.js npx serve:
npx serve .
```
Truy cập: `http://localhost:3000`
