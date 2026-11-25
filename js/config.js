// Cấu hình app. URL web app không phải bí mật: mọi yêu cầu vẫn cần đăng nhập đúng tài khoản chủ.
export const CONFIG = {
  APP_NAME: 'Bộ não thứ hai',
  // Máy chủ chính trên Cloudflare (Worker + Durable Object). Apps Script chỉ còn làm cầu nối Google.
  API_URL: 'https://bnth-mcp.f77728881.workers.dev/api',
  // Client ID OAuth "Ứng dụng web" tạo trong Google Cloud Console (xem docs/GIAI_DOAN_2.md).
  GOOGLE_CLIENT_ID: '705929554980-p49hmi2booejirv2h6pm1tk6an523gge.apps.googleusercontent.com',
  SYNC_EVERY_MS: 60 * 1000
};
