# Todo-Tasks frontend

Xem [README chính](../README.md) để chạy full-stack app và tests.

Điểm vào để đọc code:

1. `src/App.jsx`: QueryClient, AuthProvider và routes.
2. `src/context/AuthContext.jsx`: session initialization, login/logout, expiry.
3. `src/services/api.js`: Axios, CSRF header, errors và cancellation.
4. `src/hooks/useTasks.js`: query keys, optimistic previews, mutation reconciliation.
5. `src/components/TodoApp.jsx`: kết nối hook với task UI.

Tests được đặt riêng trong `tests/`, bên ngoài `src/`. Chạy `npm test` tại thư mục frontend khi cần kiểm tra. `tests/setup.js` và `tests/helpers.jsx` chỉ hỗ trợ tests, không tham gia chạy ứng dụng.
