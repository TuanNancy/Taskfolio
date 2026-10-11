# CD backend: GitHub Actions → GHCR → EC2

Frontend dùng Git integration của Vercel. Pipeline này publish và deploy **chỉ API**; Caddy hiện tại tiếp tục proxy tới `127.0.0.1:5001`, MongoDB dùng Atlas.

## Pipeline

`.github/workflows/ci.yml` chạy lint, tests, build frontend và audit dependencies trên push/PR. Khi **push vào `main`** hoặc **Run workflow trên `main`**, CI thành công sẽ:

1. Build `backend/Dockerfile` từ root repo cho `linux/amd64` và `linux/arm64`.
2. Publish `ghcr.io/<owner>/<repo>-api:sha-<full-commit-sha>` bằng `GITHUB_TOKEN`.
3. Deploy bằng **digest** output từ build (`@sha256:…`), không resolve lại tag.
4. SSH tới EC2, pull image trước khi thay container, đợi Docker healthcheck tối đa 180 giây.
5. Kiểm tra JSON và HTTP status ở ba đường:
   - `http://127.0.0.1:5001/health/ready`: `200`, `status: ready`.
   - `${BACKEND_ORIGIN}/health/ready`: `200`, `status: ready` qua HTTPS/Caddy.
   - `${FRONTEND_ORIGIN}/api/auth/me`: `401`, `code: UNAUTHENTICATED` qua Vercel, khi chưa đăng nhập.
6. Ghi `current-release` sau khi kiểm tra thành công. Nếu container/check lỗi, khôi phục release cũ và kiểm tra lại; workflow vẫn báo **failed** để thấy lỗi bản mới.

PR/branch khác chỉ chạy CI. Các lần deploy production chạy tuần tự; release có SHA không còn là HEAD của `main` sẽ được bỏ qua trước khi SSH. `flock` trên EC2 chặn thêm các lần chạy script đồng thời.

Một API container nên có gián đoạn ngắn lúc thay thế. Vercel triển khai theo pipeline riêng; các thay đổi API cần tương thích với frontend đang live.

## 1. Chuẩn bị EC2 một lần

Yêu cầu: Docker Engine hoạt động, Docker Compose plugin v2.20+, Bash, `curl`, `jq`, `flock` (util-linux), `timeout` (coreutils). SSH user phải sử dụng được Docker và ghi được thư mục app; script không chạy `sudo`. Runner GitHub cần kết nối được tới SSH của EC2.

Trên EC2, ví dụ dùng `ec2-user`:

```sh
sudo install -d -m 700 -o ec2-user -g ec2-user /opt/taskfolio
install -m 600 backend/.env.example /opt/taskfolio/backend.env
docker info
docker compose version
command -v bash curl jq flock timeout
```

Chạy lệnh `install` từ bản checkout của repo trên EC2; chỉ cần source cho lần chuẩn bị này. Sửa `/opt/taskfolio/backend.env` với env thực tế từ container đang chạy:

```dotenv
NODE_ENV=production
PORT=5001
MONGO_URI=<MongoDB Atlas URI>
JWT_SECRET=<giữ JWT secret hiện tại>
JWT_EXPIRES_IN=7d
FRONTEND_URL=https://taskfolio-one.vercel.app
COOKIE_SAME_SITE=lax
TRUST_PROXY_HOPS=1
```

API phải truy cập được Atlas. Compose ép `NODE_ENV=production`, `PORT=5001`, `TRUST_PROXY_HOPS=1`; phần còn lại đọc từ env file trên server. Secrets backend không được upload từ GitHub hay copy vào release. Giữ `ORIGIN_SECRET` trong cấu hình Caddy/Vercel như [README gốc](../README.md#cấu-hình-proxy-vercel--caddy--express).

### Chuyển từ API container chạy thủ công

Script từ chối takeover container khác đang publish port 5001. Trước lần CD đầu:

1. Xác định container API bằng `docker ps --filter publish=5001`; lưu image, env và lệnh khởi động hiện tại.
2. Chuẩn bị đầy đủ GitHub environment và `/opt/taskfolio/backend.env` trước khi dừng API.
3. Trong thời điểm chuyển đổi, `docker stop <old-api-container>` rồi chạy workflow trên `main`.
4. Nếu lần đầu thất bại, script dọn API mới; `docker start <old-api-container>` để phục hồi. Release đầu tiên chưa có bản managed trước đó để auto-rollback.

Giữ container cũ ở trạng thái stopped cho tới khi bản CD đầu tiên hoạt động tốt. Caddy tiếp tục chạy trong suốt quá trình.

## 2. GitHub environment `production`

Vào **Settings → Environments → production** và khai báo:

| Loại | Tên | Giá trị |
|---|---|---|
| Variable | `EC2_HOST` | IPv4 hoặc DNS của EC2, không có `https://` |
| Variable | `EC2_USER` | Ví dụ `ec2-user` |
| Variable | `EC2_PORT` | Tùy chọn, mặc định `22` |
| Variable | `EC2_APP_DIR` | Tùy chọn, mặc định `/opt/taskfolio`; đường dẫn tuyệt đối không có dấu cách |
| Variable | `BACKEND_ORIGIN` | URL HTTPS Caddy thực tế, ví dụ `https://34.229.52.18`, không có slash cuối |
| Variable | `FRONTEND_ORIGIN` | Production URL Vercel, ví dụ `https://taskfolio-one.vercel.app`, không có slash cuối |
| Secret | `EC2_SSH_KEY` | Private key tương ứng public key trong `authorized_keys` của SSH user |
| Secret | `EC2_KNOWN_HOSTS` | Dòng OpenSSH known_hosts đã xác minh của EC2 |

Host key có thể thu thập bằng `ssh-keyscan -H <EC2_HOST>` (thêm `-p <port>` nếu dùng port khác); đối chiếu fingerprint với host key trên EC2 qua kênh SSH/console đang tin cậy trước khi lưu secret. Script dùng `StrictHostKeyChecking=yes`. Đổi instance/host key cần cập nhật secret tương ứng.

GHCR sử dụng `GITHUB_TOKEN` tự cấp cho mỗi job: publish có `packages: write`, deploy có `packages: read`. Với package đã tồn tại, kiểm tra **Package settings → Manage Actions access** cho repo này. Token được chuyển qua SSH stdin và Docker config tạm, xóa sau cả thành công lẫn lỗi; EC2 không cần lưu PAT lâu dài.

Workflow tự deploy sau khi CI pass; nếu environment hiện có required reviewers, deployment sẽ chờ các rule đó. Frontend vẫn dùng Git integration của Vercel.

## 3. Vận hành và rollback

- **Deploy:** merge vào `main`; xem jobs **Publish backend image** và **Deploy backend to EC2**.
- **Redeploy bản main hiện tại:** Actions → Verify application → Run workflow → chọn `main`. Mỗi run/attempt tạo thư mục riêng.
- **Auto-rollback:** khi `up --wait` hoặc HTTP/JSON check lỗi, dùng Compose và image đã lưu của release trước với `--pull never`. Giữ image của current/previous release trên EC2; script kiểm tra image rollback tồn tại trước khi thay API.
- **Rollback lỗi:** log có `ROLLBACK FAILED`; workflow đỏ và `current-release` biểu thị bản thành công gần nhất, không đảm bảo bản đó hiện đang healthy. Kiểm tra trực tiếp server.
- **Lùi thay đổi có chủ đích:** revert commit ứng dụng trên `main`, push và để CI/CD tạo release mới đã được kiểm tra.
- Rollback khôi phục image/Compose; không rollback dữ liệu Atlas hay chỉnh sửa `backend.env`. Các thay đổi schema cần tương thích ngược.

Các file trên EC2:

```text
/opt/taskfolio/
  backend.env
  deploy.lock
  current-release
  previous-release
  releases/sha-<commit>-<run-id>-<attempt>/
    compose.production.yaml
    remote-deploy.sh
    images.env
```

`images.env` chỉ có image digest và đường dẫn env file. Giữ các release hiện tại/trước và image tương ứng khi dọn disk.

Đọc trạng thái/log trên EC2:

```sh
docker ps --filter label=com.docker.compose.project=taskfolio-backend
docker logs --tail 100 "$(docker ps -aq --filter label=com.docker.compose.project=taskfolio-backend --filter label=com.docker.compose.service=api)"
cat /opt/taskfolio/current-release
cat /opt/taskfolio/previous-release
```

Khi EC2 đổi IP: cập nhật `EC2_HOST`, `BACKEND_ORIGIN`, `EC2_KNOWN_HOSTS` nếu cần, cấu hình Caddy, đích API trong `frontend/vercel.json` và allowlist Atlas. Khi thay env backend, chạy workflow mới để recreate API.

## Kiểm tra code CD

```sh
npm test --prefix backend -- tests/deploy.test.js
shellcheck deploy/*.sh
```

Tests chạy script thật với Docker/SSH/HTTP được giả lập: pull failure, health failure, redirect/HTML sai, rollback thành công/thất bại, tín hiệu TERM, khóa deploy và transport SSH. Chúng không xác nhận credentials, mạng hay môi trường live; cần một lần production deployment thành công và kiểm tra CRUD/login trên browser để xác minh toàn tuyến.
