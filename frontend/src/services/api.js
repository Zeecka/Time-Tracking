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
  getAll: () => api.get('/tracking-codes'),
  getById: (id) => api.get(`/tracking-codes/${id}`),
  create: (data) => api.post('/tracking-codes', data),
  update: (id, data) => api.put(`/tracking-codes/${id}`, data),
  delete: (id) => api.delete(`/tracking-codes/${id}`),
  exportCSV: () => api.get('/tracking-codes/export-csv', { responseType: 'blob' }),
  importCSV: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/tracking-codes/import-csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Project API
export const projectAPI = {
  getAll: () => api.get('/projects'),
  getById: (id) => api.get(`/projects/${id}`),
  create: (data) => api.post('/projects', data),
  update: (id, data) => api.put(`/projects/${id}`, data),
  delete: (id) => api.delete(`/projects/${id}`),
  exportCSV: () => api.get('/projects/export-csv', { responseType: 'blob' }),
  importCSV: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/projects/import-csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// User API
export const userAPI = {
  getAll: () => api.get('/users'),
  getById: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
  exportCSV: () => api.get('/users/export-csv', { responseType: 'blob' }),
  importCSV: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/users/import-csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Time Entry API
export const timeEntryAPI = {
  getAll: (params) => api.get('/time-entries', { params }),
  getById: (id) => api.get(`/time-entries/${id}`),
  create: (data) => api.post('/time-entries', data),
  update: (id, data) => api.put(`/time-entries/${id}`, data),
  delete: (id) => api.delete(`/time-entries/${id}`),
  bulkCreate: (data) => api.post('/time-entries/bulk', data),
  exportCSV: (params) => api.get('/time-entries/export-csv', { params, responseType: 'blob' }),
  importCSV: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/time-entries/import-csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Stats API
export const statsAPI = {
  get: (params) => api.get('/stats', { params }),
};

export default api;
