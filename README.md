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

| File | Vai trò |
|---|---|
| `backend/Dockerfile` | Build image Node.js chạy API |
| `frontend/Dockerfile` | Build React, đóng gói cùng Caddy cho Docker local |
| `compose.yaml` | Chạy local với MongoDB container |
| `frontend/Caddyfile` | Serve React và reverse proxy `/api` trong Docker local |
| `.env.example` | Mẫu cấu hình JWT secret cho Compose local |
| `.dockerignore` | Loại dependencies local, secrets và báo cáo khỏi build context |

## CI và deployment

### CI trên GitHub Actions

`.github/workflows/ci.yml` chạy lint, backend/frontend tests, frontend build và audit production dependencies khi push, pull request hoặc chạy thủ công. Xem từng bước tại **GitHub → Actions → Verify application**. Workflow hiện chỉ kiểm tra code, chưa publish Docker images hay deploy lên EC2.

### Triển khai thủ công: Vercel + EC2 + Atlas

Kiến trúc dự kiến:

```text
Browser → Vercel (React và proxy /api qua HTTPS)
             → EC2 Amazon Linux 2023 (reverse proxy + API container)
                 → MongoDB Atlas
```

Thực hiện từng bước để hiểu quy trình trước khi tự động hóa:

1. **Tạo EC2:** chọn Amazon Linux 2023, cấu hình network và SSH bằng `ec2-user`.
2. **Chuẩn bị server:** cài Docker, đưa source code lên EC2 và tạo file cấu hình backend từ `backend/.env.example`. Điền URI Atlas, JWT secret, `NODE_ENV=production` và origin HTTPS thực tế của frontend; cho phép IP egress của EC2 truy cập Atlas.
3. **Build backend:** tại root repository trên EC2, chạy `docker build -f backend/Dockerfile -t taskfolio-api .`. Image chứa Node.js, dependencies và code API; secrets được truyền khi chạy container.
4. **Chạy backend:** cấu hình API container, HTTPS và reverse proxy theo địa chỉ server thực tế, rồi kiểm tra `/health/ready`.
5. **Kết nối frontend:** import repository vào Vercel với Root Directory `frontend`, build `npm run build`, Output Directory `dist`. Dùng production URL `*.vercel.app`, frontend gọi `/api`; cấu hình external rewrite tới HTTPS backend trước route fallback React.
6. **Kiểm tra bản live:** đăng ký/đăng nhập, CRUD task, reload và đăng xuất. Kiểm tra cookie, forwarded headers và rate limiting theo chuỗi proxy thực tế.

Đây là lộ trình triển khai. HTTPS backend, Vercel API rewrite và cấu hình proxy production cần được thiết lập khi có địa chỉ EC2 và URL Vercel thực tế. `frontend/vercel.json` hiện chỉ xử lý fallback route React. Cần xác minh trên môi trường live để kết luận deployment thành công.

Kiểm tra AWS credit và chi phí compute/storage/public IPv4 trước khi tạo tài nguyên. CI chạy trên GitHub, độc lập với trạng thái bật/tắt EC2.

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
