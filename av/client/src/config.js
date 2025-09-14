// src/config.js
export const API_BASE = process.env.NODE_ENV === 'production' 
  ? 'https://api.yourdomain.com' 
  : 'http://127.0.0.1:8000';