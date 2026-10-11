# Todo-Tasks

Ứng dụng quản lý công việc cá nhân: React + Express + MongoDB, xác thực bằng JWT trong HttpOnly cookie.

## Tech stack

- **Frontend:** React, Vite, Tailwind CSS, TanStack Query, Axios.
- **Backend:** Node.js, Express, Mongoose, Zod, JWT, bcrypt.
- **Database:** MongoDB local hoặc Atlas.
- **Development & deployment:** Vitest, Testing Library, Supertest, Docker Compose, Caddy, GitHub Actions.

## Tính năng

- Đăng ký (tự đăng nhập), đăng nhập, đăng xuất, khôi phục phiên khi reload.
- Mỗi user quản lý task của mình; ownership được kiểm tra trong database query.
- Tạo/sửa/xóa, hoàn thành/mở lại, lọc và phân trang phía server.
- Optimistic status update theo từng task; không rollback cả danh sách.
- Bảo toàn draft khi tạo thất bại; retry khi không tải được dữ liệu.
- Query theo `page + filter`, hủy request cũ, tự quay về trang hợp lệ sau khi dữ liệu giảm.
- Validation bằng Zod, error response thống nhất, auth rate limiting.
- Health/readiness checks, request ID, log JSON không chứa request body/password/token.
- Kiểm thử API với MongoDB tạm và frontend regression tests, đặt riêng trong các thư mục `tests/`.

## Kiến trúc

```text
Browser
  └── React + AuthContext + TanStack Query
        └── Axios (/api, cookies, X-Requested-With)
              └── Vite proxy (dev) / Caddy (container)
                    └── Express
                          ├── headers / CORS / CSRF / rate limit
                          ├── routes → auth → controller → Zod
                          ├── Mongoose → MongoDB
                          └── centralized error handler
```

Backend vẫn là một monolith nhỏ. `app.js` tạo ứng dụng HTTP; `server.js` kiểm tra cấu hình, kết nối DB, chờ indexes rồi mở cổng.

## Chạy development

### Yêu cầu

- Node.js **24 LTS** được khuyến nghị; Node 22.12+ trong nhánh 22 cũng được hỗ trợ.
- MongoDB local hoặc MongoDB Atlas.
- npm; Docker chỉ cần khi dùng Compose.

### 1. Cài đặt theo lockfile

Chạy tại root project:

```sh
npm ci
npm ci --prefix backend
npm ci --prefix frontend
```

### 2. Cấu hình backend

Copy `backend/.env.example` thành `backend/.env` bằng editor. Điền `MONGO_URI` và một `JWT_SECRET` ngẫu nhiên:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Giữ các giá trị local:

```dotenv
PORT=5001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
JWT_EXPIRES_IN=7d
COOKIE_SAME_SITE=lax
TRUST_PROXY_HOPS=0
```

`JWT_SECRET` cần ít nhất 32 ký tự; không dùng placeholder. Cookie lifetime tự lấy từ JWT lifetime. Nếu `.env` cũ có `COOKIE_MAX_AGE`, bỏ dòng này hoặc đảm bảo bằng JWT lifetime tính theo milliseconds.

Frontend mặc định dùng `/api`, Vite proxy tới `http://127.0.0.1:5001`. Không cần `frontend/.env`. Nếu đã có `VITE_API_URL=.../api/tasks`, xóa hoặc sửa thành `.../api`.

### 3. Hai terminal

```sh
npm run dev:backend
```

```sh
npm run dev:frontend
```

Mở **http://localhost:5173**. Dùng đúng hostname/origin trong `FRONTEND_URL`. Nếu đổi port Vite hoặc backend, cập nhật origin/proxy tương ứng.

## Kiểm thử

```sh
npm test
npm run lint
npm run build
```

Tests nằm riêng tại `backend/tests/` và `frontend/tests/`, không cần chạy để sử dụng ứng dụng.

Coverage là tùy chọn, chỉ chạy khi muốn xem phần code đã được test thực thi:

```sh
npm run test:coverage
```

- Backend tests khởi tạo MongoDB tạm riêng, không đọc `.env`.
- Lần đầu `mongodb-memory-server` có thể tải MongoDB binary; cần Internet.
- `npm test` không sinh báo cáo coverage. Lệnh coverage mới tạo `backend/coverage/` và `frontend/coverage/`; có thể xóa các thư mục này bất cứ lúc nào, chúng được Git bỏ qua.
- Coverage threshold 80% cho statements/branches/functions/lines trong phạm vi cấu hình. Backend không tính process entrypoint `server.js`; frontend tập trung logic task/auth/API và các UI liên quan, không tính shader/UI primitives.
- Coverage không thay thế kiểm thử vận hành hay kiểm thử bảo mật độc lập.

Sau khi chạy ứng dụng, kiểm tra luồng đầy đủ trên trình duyệt: đăng ký → thêm/sửa/hoàn thành task → lọc/phân trang → reload → đăng xuất.

## API

Base URL: `/api`. Các request ghi dữ liệu yêu cầu header `X-Requested-With: TodoTasks`; Axios client đã cấu hình sẵn. Authentication dùng cookie `token`.

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/auth/register` | Đăng ký và tự đăng nhập: `{ username, email, password }` |
| POST | `/auth/login` | Đăng nhập: `{ email, password }` |
| POST | `/auth/logout` | Xóa cookie phiên hiện tại |
| GET | `/auth/me` | Lấy user đang đăng nhập |
| GET | `/tasks` | Danh sách theo `page`, `limit`, `status` |
| GET | `/tasks/counts` | Tổng số task, active và completed |
| POST | `/tasks` | Tạo task: `{ title }` |
| PATCH | `/tasks/:id` | Cập nhật `{ title?, status? }`; PUT cũng được hỗ trợ |
| DELETE | `/tasks/:id` | Xóa task |

Tất cả task endpoints yêu cầu đăng nhập và chỉ truy cập dữ liệu của user hiện tại.

- Title: 1–200 ký tự sau trim. Status: `active` hoặc `completed`.
- Query: page 1–10000 (default 1), limit 1–100 (default 5), status `all`/`active`/`completed`.
- Server tự quản lý `userId` và `completedAt`; không nhận hai trường này từ client.
- Password đăng ký: ít nhất 8 ký tự, tối đa 72 byte UTF-8.
- Error response: `{ code, message, requestId, fields? }`.
- Health endpoints: `/health/live` và `/health/ready`.

## Docker

### Local

1. Bật Docker Engine.
2. Copy `.env.example` thành `.env.local` tại root project, điền `JWT_SECRET` ngẫu nhiên bằng lệnh ở trên.
3. Chạy tại root:

```sh
docker compose --env-file .env.local up -d --build --wait
```

Mở **http://localhost:8080**. Compose chạy Caddy, API và MongoDB. Chỉ web được mở trên localhost; dữ liệu MongoDB lưu trong volume.

```sh
docker compose --env-file .env.local ps
docker compose --env-file .env.local logs --tail 100 api
docker compose --env-file .env.local down
```

`down` giữ dữ liệu; thêm `--volumes` sẽ xóa database local.

Nếu container không chạy, dùng `docker compose --env-file .env.local ps -a` để xem cả containers đã dừng và `docker compose --env-file .env.local logs --tail 100 mongo` để đọc lỗi MongoDB.

Compose local đặt `GLIBC_TUNABLES=glibc.pthread.rseq=1` cho MongoDB để tránh lỗi TCMalloc trên Linux kernel 6.19–7.0.13, bao gồm một số phiên bản Docker Desktop ([SERVER-121912](https://jira.mongodb.org/browse/SERVER-121912)). Đây là workaround local: TCMalloc dùng per-thread cache thay cho per-CPU cache, có thể giảm hiệu năng. Atlas được quản lý riêng và không sử dụng cấu hình này.

| File | Vai trò |
|---|---|
| `backend/Dockerfile` | Build image Node.js chạy API |
| `backend/Caddyfile` | HTTPS và proxy API trên EC2, xác thực request từ Vercel |
| `frontend/Dockerfile` | Build React, đóng gói cùng Caddy cho Docker local |
| `compose.yaml` | Chạy local với MongoDB container |
| `frontend/Caddyfile` | Serve React và reverse proxy `/api` trong Docker local |
| `.env.example` | Mẫu cấu hình JWT secret cho Compose local |
| `.dockerignore` | Loại dependencies local, secrets và báo cáo khỏi build context |

## CI và deployment

### CI/CD trên GitHub Actions

`.github/workflows/ci.yml` chạy lint, backend/frontend tests, frontend build và audit production dependencies khi push, pull request hoặc chạy thủ công. Khi CI pass trên `main` (push hoặc Run workflow), pipeline publish **image backend** lên GHCR rồi deploy EC2 bằng digest, kiểm tra health và auto-rollback nếu lỗi. Frontend dùng Git integration của Vercel.

Thiết lập GitHub environment `production`, SSH, env backend và chuyển từ container thủ công theo **[hướng dẫn CD backend](deploy/README.md)** trước lần chạy đầu. Xem jobs tại **GitHub → Actions → Verify application**. Workflow đã được cấu hình trong repo; trạng thái triển khai thực tế cần xác minh trên môi trường live.

### Chuẩn bị hạ tầng: Vercel + EC2 + Atlas

Kiến trúc triển khai:

```text
Browser → Vercel (React và proxy /api qua HTTPS)
             → EC2 Amazon Linux 2023 (reverse proxy + API container)
                 → MongoDB Atlas
```

Chuẩn bị hạ tầng một lần trước khi bật CD:

1. **Tạo EC2:** chọn Amazon Linux 2023, cấu hình network và SSH bằng `ec2-user`.
2. **Chuẩn bị server:** cài Docker, đưa source code lên EC2 và tạo file cấu hình backend từ `backend/.env.example`. Điền URI Atlas, JWT secret, `NODE_ENV=production` và origin HTTPS thực tế của frontend; cho phép IP egress của EC2 truy cập Atlas.
3. **Thiết lập CD backend:** chuẩn bị `/opt/taskfolio/backend.env`, Docker Compose và biến/secret GitHub theo `deploy/README.md`. GitHub build/push image, EC2 pull bản được pin bằng digest.
4. **Chạy backend:** cấu hình HTTPS và reverse proxy theo địa chỉ server thực tế, chạy workflow trên `main`, rồi kiểm tra `/health/ready`.
5. **Kết nối frontend:** import repository vào Vercel với Root Directory `frontend`, build `npm run build`, Output Directory `dist`. Dùng production URL `*.vercel.app`, frontend gọi `/api`; `frontend/vercel.json` chuyển API tới HTTPS backend trước static files và fallback React.
6. **Kiểm tra bản live:** đăng ký/đăng nhập, CRUD task, reload và đăng xuất. Kiểm tra cookie, forwarded headers và rate limiting theo chuỗi proxy thực tế.

#### Cấu hình proxy Vercel → Caddy → Express

`frontend/vercel.json` dùng `routes` để vừa proxy `/api` vừa thêm request header `X-Origin-Secret` từ biến môi trường Vercel `ORIGIN_SECRET`. Đây là khóa riêng giữa hai proxy, không phải JWT secret và không dùng tiền tố `VITE_`. Dùng cùng giá trị trên Vercel và container Caddy.

- Backend: `FRONTEND_URL=https://taskfolio-one.vercel.app`, `COOKIE_SAME_SITE=lax`, `TRUST_PROXY_HOPS=1`. Publish API bằng `-p 127.0.0.1:5001:5001`.
- Vercel: thêm `ORIGIN_SECRET` cho **Production** trước khi deploy cấu hình mới. Frontend mặc định gọi `/api`; nếu đã đặt `VITE_API_URL`, đặt giá trị `/api`. Deploy vào Production để domain ổn định nhận cấu hình mới.
- Caddy: dùng `backend/Caddyfile` với image `caddy:2.11.7-alpine`, `--network host`, mở TCP 80/443 trên EC2. Đặt `BACKEND_IP` và `ORIGIN_SECRET` trong file runtime ngoài repository, ví dụ `$HOME/taskfolio-proxy.env`, quyền `600`; truyền qua `--env-file`.
- Mount Caddyfile tại `/etc/caddy/Caddyfile:ro`; giữ named volumes `/data` và `/config` để lưu chứng chỉ/cấu hình. Chứng chỉ IP dùng profile Let's Encrypt `shortlived`; Caddy tự quản lý gia hạn khi máy chạy và cổng xác minh truy cập được.

Tạo khóa bằng `openssl rand -hex 32`, lưu cùng giá trị ở hai nơi trên. Caddy chỉ chuyển API khi khóa khớp và có `X-Real-IP` do Vercel cung cấp. Caddy chuẩn hóa `X-Forwarded-For` thành IP đó rồi bỏ header khóa trước khi chuyển tới Express. Vì vậy Express chỉ cần tin một proxy sát nó (`TRUST_PROXY_HOPS=1`); rate limit phân biệt từng client. Khi thiếu khóa cấu hình, request API bị từ chối. Health endpoints vẫn truy cập trực tiếp được.

Sau khi sửa env file phải tạo lại container tương ứng; `docker restart` không nạp lại env file. Khi EC2 đổi IP, cập nhật `BACKEND_IP`, IP allowlist của Atlas và host đích trong `frontend/vercel.json` (hiện là `34.229.52.18`), rồi áp dụng lại cấu hình Caddy và deploy lại Vercel.

Kiểm tra sau khi áp dụng:

```sh
curl -i https://34.229.52.18/health/ready
curl -i https://34.229.52.18/api/auth/me
curl -i https://taskfolio-one.vercel.app/api/auth/me
```

Mong đợi lần lượt: `200` readiness, `403` khi gọi thẳng API thiếu khóa proxy, `401` JSON khi gọi qua Vercel chưa đăng nhập. Nếu Vercel trả HTML, kiểm tra route API, Root Directory và deployment đang gắn domain Production. Sau đó kiểm tra đăng ký/đăng nhập, CRUD task, reload và logout trên trình duyệt; cookie `token` phải có `HttpOnly`, `Secure`, `SameSite=Lax` trên domain frontend. Cần xác minh luồng live này và theo dõi một chu kỳ gia hạn trước khi kết luận toàn bộ triển khai/gia hạn thành công.

Kiểm tra AWS credit và chi phí compute/storage/public IPv4 trước khi tạo tài nguyên. CI/publish chạy trên GitHub; job deploy cần EC2 hoạt động và truy cập được qua SSH.

`npm run build` chỉ build frontend. `npm start` chỉ khởi động API. Compose ở trên phục vụ toàn bộ ứng dụng tại local; frontend production được Vercel build từ source.

## Giới hạn và lưu ý kỹ thuật

- HttpOnly giảm khả năng JavaScript đọc token, không ngăn mọi dạng XSS.
- Cookie mặc định `SameSite=Lax`; mutation yêu cầu `X-Requested-With: TodoTasks`, CORS chỉ chấp nhận origin đã cấu hình.
- Logout xóa cookie của browser. JWT đã bị sao chép vẫn có thể dùng đến hạn; chưa có server-side session revocation.
- Rate limiter dùng memory, phù hợp một API instance; nhiều replica cần shared store.
- Update task vẫn last-write-wins giữa nhiều browser/tab. UI ngăn thao tác trùng trên cùng task trong một phiên component; chưa có optimistic concurrency/version check phía DB.
- Pagination là offset, giới hạn page 1–10000 và limit 1–100. Counts/list là các query độc lập, có thể lệch ngắn hạn khi có ghi đồng thời.
- Indexes đã khai báo theo query pattern, nhưng chưa có benchmark để khẳng định mức cải thiện tốc độ.
- Bản sửa không tự thay đổi dữ liệu cũ: nếu DB đã có status/title sai, cần kiểm tra và lên kế hoạch sửa dữ liệu riêng.

## Cấu trúc chính

```text
backend/
  Caddyfile                  # HTTPS/proxy API cho EC2 thủ công
  models/                    # User, Task, indexes
  src/
    app.js                   # HTTP middleware và routes
    server.js                # Process lifecycle
    config/                  # Environment validation, Mongo connection
    controllers/             # Auth và task operations
    middleware/              # JWT auth, error response
    validation/              # Request schemas
  tests/                     # API integration, HTTP boundaries
frontend/
  Caddyfile                  # Web server cho Docker local
  src/
    context/AuthContext.jsx  # Session lifecycle
    hooks/useTasks.js        # Queries, mutations, optimistic previews
    services/api.js          # Axios, normalized errors, session version
    components/              # Task UI
    pages/                   # Login, register, not found
  tests/                     # Frontend regression tests và test setup
compose.yaml                 # Docker local: MongoDB, API và web
.env.example                 # Mẫu cấu hình cho Compose local
```

License: ISC.
