import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api/v1';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Tracking Code API
export const trackingCodeAPI = {
  getAll: () => api.get('/tracking-code'),
  getById: (id) => api.get(`/tracking-code/${id}`),
  create: (data) => api.post('/tracking-code', data),
  update: (id, data) => api.put(`/tracking-code/${id}`, data),
  delete: (id) => api.delete(`/tracking-code/${id}`),
  exportCSV: () => api.get('/tracking-code/export-csv', { responseType: 'blob' }),
  importCSV: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/tracking-code/import-csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Project API
export const projectAPI = {
  getAll: () => api.get('/project'),
  getById: (id) => api.get(`/project/${id}`),
  create: (data) => api.post('/project', data),
  update: (id, data) => api.put(`/project/${id}`, data),
  delete: (id) => api.delete(`/project/${id}`),
  exportCSV: () => api.get('/project/export-csv', { responseType: 'blob' }),
  importCSV: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/project/import-csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// User API
export const userAPI = {
  getAll: () => api.get('/user'),
  getById: (id) => api.get(`/user/${id}`),
  create: (data) => api.post('/user', data),
  update: (id, data) => api.put(`/user/${id}`, data),
  delete: (id) => api.delete(`/user/${id}`),
  exportCSV: () => api.get('/user/export-csv', { responseType: 'blob' }),
  importCSV: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/user/import-csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Time Entry API
export const timeEntryAPI = {
  getAll: (params) => api.get('/time-entry', { params }),
  getById: (id) => api.get(`/time-entry/${id}`),
  create: (data) => api.post('/time-entry', data),
  update: (id, data) => api.put(`/time-entry/${id}`, data),
  delete: (id) => api.delete(`/time-entry/${id}`),
  bulkCreate: (data) => api.post('/time-entry/bulk', data),
  exportCSV: (params) => api.get('/time-entry/export-csv', { params, responseType: 'blob' }),
  importCSV: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/time-entry/import-csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Stats API
export const statsAPI = {
  get: (params) => api.get('/stats', { params }),
};

export default api;
