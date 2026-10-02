# gauconhihi

Multi-provider AI chat CLI, chạy thuần trong trình duyệt. Static site, không backend, không build step, không dependency.

## Deploy

GitHub Pages: repo này đã bật Pages từ nhánh `main` / thư mục `/root`. Mở `https://gauconhihi.github.io`.

## Tính năng

- Chọn model từ danh sách được **tự động load** từ `/models` của provider (OpenAI-compatible, Anthropic, Google Gemini, Responses API).
- Thêm provider tuỳ ý: OpenAI-compatible `/chat/completions`, OpenAI `/responses`, Anthropic `/v1/messages`, Google `:generateContent`. Base URL bất kỳ (OpenRouter, Groq, DeepSeek, Together, Fireworks, xAI, Mistral, Cerebras, vLLM, Ollama, LM Studio, OpenAI-proxy…).
- **Không bắt nhập key trước**: lần đầu cố `/models` không key. Chỉ khi provider trả 401/403 mới hiện yêu cầu nhập key.
- Key mã hoá **AES-GCM 256**, khoá sinh bằng **PBKDF2-SHA256** (310k iterations). Passphrase không lưu, không gửi đi. Mất passphrase = mất key.
- Hỗ trợ context tới **1M token** (Gemini 2.5 / Gemini 1.5 Pro 2M), hiện ngân sách context qua `/ctx`.
- Streaming SSE cho mọi provider. Lệnh dừng (`/stop` hoặc `Esc`).
- Chat lưu local, export/import JSON, dark/light theme.

## Slash commands

| Lệnh | Viết tắt | Việc |
|---|---|---|
| `/help` | `/h` | danh sách lệnh |
| `/model` | `/m` | chọn model |
| `/provider` | `/p` | thêm/sửa/xoá provider |
| `/key` | `/k` | mở vault, nhập API key |
| `/new` | `/clear` | chat mới |
| `/ctx` | `/budget` | xem context window + token đã dùng |
| `/set temp 0.9` | | đặt tham số |
| `/set maxTokens 8192` | | giới hạn output |
| `/cd` | `/status` | provider/model hiện tại |
| `/export` | | export chat ra JSON |
| `/exportkeys` | `/backup` | backup vault đã mã hoá |
| `/stop` | | dừng streaming |
| `/theme` | `/t` | sáng/tối |

## Self-test

Mở `/selftest.html` — chạy assert cho vault, context table, URL/header builder, parser lệnh. Không cần build.

## Bảo mật

- Key chỉ nằm trong `localStorage` của bạn, đã mã hoá. Không có server, không telemetry, không analytics.
- Ghi đè `https://gauconhihi.github.io` cần HTTPS để WebCrypto chạy. Mở bằng `file://` sẽ không mã hoá được — hãy dùng Pages hoặc `python3 -m http.server`.
- **Nhớ passphrase.** Không có đường khôi phục.
- Anthropic cần header `anthropic-dangerous-direct-browser-access` để gọi từ browser (đã bật sẵn). Provider không mở CORS thì không dùng được từ web — cần proxy.