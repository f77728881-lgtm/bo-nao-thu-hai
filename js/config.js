// Cấu hình app. URL web app không phải bí mật: mọi yêu cầu vẫn cần đăng nhập đúng tài khoản chủ.
export const CONFIG = {
  APP_NAME: 'Bộ não thứ hai',
  API_URL: 'https://script.google.com/macros/s/AKfycbwGTrW91uZfjhbS7PlpxZTtXGjMPoLIue3kgfhDltYtnSxuSIOWn-t3Fwtz0Hgg9Czjiw/exec',
  // Client ID OAuth "Ứng dụng web" tạo trong Google Cloud Console (xem docs/GIAI_DOAN_2.md).
  GOOGLE_CLIENT_ID: '',
  SYNC_EVERY_MS: 2 * 60 * 1000
};
