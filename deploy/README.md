# Continuous delivery: GHCR → EC2

Luồng này sử dụng `compose.production.yaml`: web/Caddy phục vụ React, reverse proxy tới API, database nằm ngoài EC2 (ví dụ Atlas).

```text
Push main / chạy Verify application thủ công trên main
  → lint + tests + build + audit
  → build/push API và web images lên GHCR
  → chọn một tag và chạy Deploy production thủ công
  → EC2 pull images → Compose up → kiểm tra HTTPS
```

CI/publish chạy trên GitHub-hosted runners, không cần EC2 hoặc database production. Workflow không gọi AWS để bật/tắt instance. EC2 chỉ cần chạy khi kích hoạt **Deploy production**.

## 1. Publish images khi EC2 đang dừng

1. Đưa thay đổi lên `main` của GitHub repository và bật GitHub Actions nếu chưa bật.
2. Chờ workflow **Verify application** hoàn thành, gồm cả hai jobs publish. Có thể chạy lại từ **Actions → Verify application → Run workflow → main**.
3. Lấy `image_tag` từ phần Summary của run, ví dụ `sha-0123456789abcdef0123456789abcdef01234567` (đúng 40 ký tự SHA sau `sha-`). Đây chỉ là ví dụ định dạng; dùng tag do run của bạn tạo.

Với repository `TuanNancy/Taskfolio`, images là:

```text
ghcr.io/tuannancy/taskfolio-api:sha-<40-character-commit-sha>
ghcr.io/tuannancy/taskfolio-web:sha-<40-character-commit-sha>
```

Tên registry tự chuyển thành chữ thường từ tên repository. Images hỗ trợ EC2 x86-64 và ARM64. Workflow publish chỉ chạy sau khi toàn bộ job kiểm tra thành công trên `main`; PR không được publish. Deploy chọn tag theo commit, không dùng `latest`.

Publish dùng `GITHUB_TOKEN` tự cấp cho job với quyền `packages: write`, không cần tạo PAT hoặc AWS access key. Các images có OCI source label liên kết với repository. Deploy dùng token có quyền `packages: read`. Nếu package đã tồn tại nhưng chưa cấp quyền cho repository, vào package **Settings → Manage Actions access** để cấp quyền phù hợp; cũng kiểm tra chính sách GitHub organization nếu gặp `permission_denied`.

## 2. Cấu hình GitHub environment

Vào **Settings → Environments**, tạo environment `production`. Các thông tin này chỉ cần cho bước deploy; thiếu chúng không ảnh hưởng publish.

### Environment variables

| Tên | Giá trị |
|---|---|
| `EC2_HOST` | Public DNS hoặc IPv4 hiện tại của EC2, không có `https://` |
| `EC2_USER` | User SSH, ví dụ `ubuntu` hoặc `ec2-user` |
| `EC2_PORT` | Tùy chọn, mặc định `22` |
| `EC2_APP_DIR` | Tùy chọn, mặc định `/opt/taskfolio`; đường dẫn tuyệt đối, không có khoảng trắng, user SSH có quyền ghi |

### Environment secrets

| Tên | Nội dung |
|---|---|
| `EC2_SSH_KEY` | Toàn bộ private key dùng để SSH vào EC2 |
| `EC2_KNOWN_HOSTS` | Dòng host key của đúng host/port dùng trong workflow |

Nếu chưa lưu host key, hoàn thiện `EC2_KNOWN_HOSTS` khi có thể truy cập instance. Có thể lấy dòng ở máy local bằng `ssh-keyscan -p 22 -t ed25519 -H <EC2_HOST>`, nhưng cần đối chiếu fingerprint với host key trên EC2 qua kết nối đã tin cậy hoặc AWS console/SSM (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`). Với port khác 22, dùng đúng port khi scan. Workflow kiểm tra host key, không tắt `StrictHostKeyChecking`.

Sau khi stop/start, public IP có thể thay đổi: cập nhật `EC2_HOST`, DNS của domain, dòng known_hosts tương ứng và IP egress được Atlas cho phép nếu cần.

## 3. Chuẩn bị EC2 một lần khi cần deploy

Trên Linux instance, cần:

- Docker Engine và Compose plugin v2.20+; user SSH chạy được `docker info` và `docker compose version` không cần `sudo`. Cài plugin ở đường dẫn hệ thống theo [hướng dẫn Docker](https://docs.docker.com/engine/install/).
- Bash, curl hỗ trợ `--retry-all-errors` (7.71+) và SSH/SFTP.
- Domain trỏ tới server, HTTP/HTTPS 80/443 hoạt động để Caddy cấp chứng chỉ; SSH có thể nhận kết nối từ GitHub runner. API 5001 không cần publish.
- MongoDB/Atlas cho phép server kết nối.

Tạo thư mục (ví dụ mặc định, chạy bằng user SSH):

```sh
sudo install -d -m 750 -o "$USER" -g "$(id -gn)" /opt/taskfolio /opt/taskfolio/deploy
```

Copy nội dung `deploy/.env.example` vào `/opt/taskfolio/deploy/.env.production`, điền:

```dotenv
DOMAIN=tasks.example.com
MONGO_URI=mongodb+srv://...
JWT_SECRET=<random-secret-at-least-32-characters>
```

Tạo secret bằng `node:crypto` như root README hoặc công cụ sinh ngẫu nhiên tương đương. Giữ file cấu hình trên server với quyền `600`. `APP_VERSION` và `IMAGE_PREFIX` được workflow cung cấp riêng cho mỗi release, ghi đè giá trị trong file này. Các secrets runtime không đi qua GitHub Actions; workflow không ghi đè `.env.production`.

EC2 không cần Node.js, source checkout, build dependencies hoặc GHCR token lưu lâu dài. Token đọc registry được truyền qua SSH stdin và Docker config tạm được xóa khi script kết thúc, kể cả khi deploy thất bại.

## 4. Deploy và xác minh

1. Bật EC2 và bảo đảm DNS, network, `.env.production` đã sẵn sàng.
2. **Actions → Deploy production → Run workflow**.
3. Chọn branch `main`, nhập `image_tag` lấy từ một run **Verify application** thành công.

Workflow kiểm tra tag, đối chiếu CI run thành công trên `main`, rồi checkout đúng commit để dùng Compose/scripts tương ứng với images. Các deployment jobs được tuần tự hóa.

Trên server, script:

1. Tạo `releases/<image_tag>/`, copy Compose và remote deployment script.
2. Kiểm tra cấu hình Compose bằng `.env.production` và `images.env` của release.
3. Đăng nhập GHCR tạm thời, pull cả hai images trước khi thay đổi services.
4. Chạy `docker compose up --detach --no-build --pull never --wait --wait-timeout 180`.
5. Chờ HTTP **200** từ HTTPS `/health/ready` và `/login`, bao gồm kiểm tra chứng chỉ TLS bình thường.
6. Ghi `current-release` sau khi tất cả kiểm tra thành công.

`current-release` là **release gần nhất đã vượt qua health checks**, không phải bảo đảm rằng deployment thất bại sau đó chưa thay đổi containers. Lỗi sau bước `up` làm workflow thất bại và cần kiểm tra/rollback; script không tự rollback. Không dừng stack trước khi pull; không xóa volumes. Đây là cập nhật tại chỗ, không phải zero-downtime deployment.

Sau lần deploy đầu, kiểm tra thêm bằng browser: register/login → CRUD → filter/pagination → reload `/login` → logout. Các health checks không thay thế kiểm tra luồng này.

Để xem trạng thái một release trên EC2:

```sh
cd /opt/taskfolio
# Thay bằng image_tag đã publish của release cần xem.
RELEASE=sha-0123456789abcdef0123456789abcdef01234567
docker compose --env-file deploy/.env.production --env-file "releases/$RELEASE/images.env" -f "releases/$RELEASE/compose.production.yaml" ps
docker compose --env-file deploy/.env.production --env-file "releases/$RELEASE/images.env" -f "releases/$RELEASE/compose.production.yaml" logs --tail 100 api web
```

Nếu EC2 đang dừng hoặc SSH không tới được, workflow thất bại ở bước kết nối; nó không tự bật instance.

## 5. Rollback

Chạy lại **Deploy production** trên `main` với `image_tag` của release cũ đã publish và có CI run thành công. Giữ images và CI run cần rollback; không xóa chúng khỏi GHCR/Actions. Rollback đổi phiên bản ứng dụng và Compose, không khôi phục dữ liệu MongoDB.

## Kiểm tra ở local

```sh
npm test --prefix backend -- tests/deploy.test.js
```

Tests chạy shell scripts thật với Docker/SSH/curl giả lập: kiểm tra thứ tự pull/update, health failure, không ghi đè cấu hình server, xử lý EC2 không kết nối được và dọn credentials. CI còn chạy ShellCheck. Việc publish lên GHCR và kết nối EC2 thực tế vẫn cần xác minh bằng các workflow runs.
