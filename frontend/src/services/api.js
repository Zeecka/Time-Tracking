import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api/v1';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Code Pointage API
export const codePointageAPI = {
  getAll: () => api.get('/code-pointage'),
  getById: (id) => api.get(`/code-pointage/${id}`),
  create: (data) => api.post('/code-pointage', data),
  update: (id, data) => api.put(`/code-pointage/${id}`, data),
  delete: (id) => api.delete(`/code-pointage/${id}`),
  exportCSV: () => api.get('/code-pointage/export-csv', { responseType: 'blob' }),
  importCSV: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/code-pointage/import-csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Projet API
export const projetAPI = {
  getAll: () => api.get('/projets'),
  getById: (id) => api.get(`/projets/${id}`),
  create: (data) => api.post('/projets', data),
  update: (id, data) => api.put(`/projets/${id}`, data),
  delete: (id) => api.delete(`/projets/${id}`),
  exportCSV: () => api.get('/projets/export-csv', { responseType: 'blob' }),
  importCSV: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/projets/import-csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Utilisateur API
export const utilisateurAPI = {
  getAll: () => api.get('/utilisateurs'),
  getById: (id) => api.get(`/utilisateurs/${id}`),
  create: (data) => api.post('/utilisateurs', data),
  update: (id, data) => api.put(`/utilisateurs/${id}`, data),
  delete: (id) => api.delete(`/utilisateurs/${id}`),
  exportCSV: () => api.get('/utilisateurs/export-csv', { responseType: 'blob' }),
  importCSV: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/utilisateurs/import-csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Pointage API
export const pointageAPI = {
  getAll: (params) => api.get('/pointages', { params }),
  getById: (id) => api.get(`/pointages/${id}`),
  create: (data) => api.post('/pointages', data),
  update: (id, data) => api.put(`/pointages/${id}`, data),
  delete: (id) => api.delete(`/pointages/${id}`),
  bulkCreate: (data) => api.post('/pointages/bulk', data),
  exportCSV: (params) => api.get('/pointages/export-csv', { params, responseType: 'blob' }),
  importCSV: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/pointages/import-csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Stats API
export const statsAPI = {
  get: (params) => api.get('/stats', { params }),
};

export default api;
