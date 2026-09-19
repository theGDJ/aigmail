// ---------------------------------------------------------------------------
// Single axios instance for every API call.
//  * withCredentials so the httpOnly session cookie travels with each request
//  * reads the non-httpOnly CSRF cookie and echoes it in X-CSRF-Token
//  * normalizes errors into Error(message) with a code, so UI code is simple
// ---------------------------------------------------------------------------
import axios from 'axios';

const readCookie = (name) => {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const method = (config.method || 'get').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const token = readCookie('ams_csrf');
    if (token) config.headers['X-CSRF-Token'] = token;
  }
  return config;
});

export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const payload = error.response?.data?.error;
    const status = error.response?.status;

    if (status === 401 && !window.location.pathname.startsWith('/login')) {
      // Session expired: let the app decide, but keep the message useful.
      return Promise.reject(new ApiError(payload?.message || 'Session expired', { status, code: 'UNAUTHORIZED' }));
    }

    const message =
      payload?.message ||
      (error.code === 'ECONNABORTED'
        ? 'The request timed out. The AI provider may be slow - try again.'
        : error.message || 'Request failed');

    return Promise.reject(new ApiError(message, { status, code: payload?.code, details: payload?.details }));
  },
);

export default api;
