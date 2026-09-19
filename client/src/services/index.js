// Thin API layer: one function per backend endpoint. Components never build URLs.
import api from './api.js';

export const authApi = {
  status: () => api.get('/auth/status', { baseURL: '/' }).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
  demoLogin: () => api.post('/auth/demo').then((r) => r.data),
  logout: () => api.post('/auth/logout').then((r) => r.data),
  googleLoginUrl: () => '/auth/google',
};

export const metaApi = {
  get: () => api.get('/meta').then((r) => r.data),
};

export const emailApi = {
  list: (params = {}) => api.get('/emails', { params }).then((r) => r.data),
  get: (id) => api.get(`/emails/${id}`).then((r) => r.data.email),
  sync: (payload = {}) => api.post('/emails/sync', payload).then((r) => r.data),
  analyzePending: (payload = {}) => api.post('/emails/analyze-pending', payload).then((r) => r.data),
  reanalyze: (payload = {}) => api.post('/emails/reanalyze', payload).then((r) => r.data),
  setRead: (id, isRead) => api.patch(`/emails/${id}/read`, { isRead }).then((r) => r.data.email),
  bulkRead: (ids, isRead) => api.patch('/emails/bulk/read', { ids, isRead }).then((r) => r.data),
  sendReply: (id, payload) => api.post(`/emails/${id}/reply`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/emails/${id}`).then((r) => r.data),
  accounts: () => api.get('/emails/accounts').then((r) => r.data.accounts),
};

export const aiApi = {
  analyze: (emailId, payload = {}) => api.post(`/ai/analyze/${emailId}`, payload).then((r) => r.data),
  summarize: (emailId, payload = {}) => api.post(`/ai/summarize/${emailId}`, payload).then((r) => r.data),
  keyPoints: (emailId, payload = {}) => api.post(`/ai/key-points/${emailId}`, payload).then((r) => r.data),
  actionItems: (emailId, payload = {}) => api.post(`/ai/action-items/${emailId}`, payload).then((r) => r.data),
  deadlines: (emailId, payload = {}) => api.post(`/ai/deadlines/${emailId}`, payload).then((r) => r.data),
  priority: (emailId, payload = {}) => api.post(`/ai/classify/${emailId}`, payload).then((r) => r.data),
  category: (emailId, payload = {}) => api.post(`/ai/category/${emailId}`, payload).then((r) => r.data),
  importance: (emailId, payload = {}) => api.post(`/ai/importance/${emailId}`, payload).then((r) => r.data),
  phishing: (emailId, payload = {}) => api.post(`/ai/phishing/${emailId}`, payload).then((r) => r.data),
  reply: (emailId, payload = {}) => api.post(`/ai/reply/${emailId}`, payload).then((r) => r.data),
  translate: (emailId, payload) => api.post(`/ai/translate/${emailId}`, payload).then((r) => r.data),
};

export const taskApi = {
  list: (params = {}) => api.get('/tasks', { params }).then((r) => r.data),
  update: (id, payload) => api.patch(`/tasks/${id}`, payload).then((r) => r.data.task),
};

export const analyticsApi = {
  get: (days = 14) => api.get('/analytics', { params: { days } }).then((r) => r.data),
};

export const preferenceApi = {
  get: () => api.get('/preferences').then((r) => r.data.preference),
  update: (payload) => api.put('/preferences', payload).then((r) => r.data.preference),
};

export const digestApi = {
  get: (params = {}) => api.get('/digest', { params }).then((r) => r.data.digest),
};

export const notificationApi = {
  list: (params = {}) => api.get('/notifications', { params }).then((r) => r.data),
  read: (id, isRead = true) => api.patch(`/notifications/${id}`, { isRead }).then((r) => r.data.notification),
  readAll: () => api.patch('/notifications/read-all').then((r) => r.data),
};

export default {
  authApi,
  metaApi,
  emailApi,
  aiApi,
  taskApi,
  analyticsApi,
  preferenceApi,
  digestApi,
  notificationApi,
};
