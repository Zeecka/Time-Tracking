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
};

// Projet API
export const projetAPI = {
  getAll: () => api.get('/projets'),
  getById: (id) => api.get(`/projets/${id}`),
  create: (data) => api.post('/projets', data),
  update: (id, data) => api.put(`/projets/${id}`, data),
  delete: (id) => api.delete(`/projets/${id}`),
};

// Utilisateur API
export const utilisateurAPI = {
  getAll: () => api.get('/utilisateurs'),
  getById: (id) => api.get(`/utilisateurs/${id}`),
  create: (data) => api.post('/utilisateurs', data),
  update: (id, data) => api.put(`/utilisateurs/${id}`, data),
  delete: (id) => api.delete(`/utilisateurs/${id}`),
};

// Pointage API
export const pointageAPI = {
  getAll: (params) => api.get('/pointages', { params }),
  getById: (id) => api.get(`/pointages/${id}`),
  create: (data) => api.post('/pointages', data),
  update: (id, data) => api.put(`/pointages/${id}`, data),
  delete: (id) => api.delete(`/pointages/${id}`),
  bulkCreate: (data) => api.post('/pointages/bulk', data),
};

// Stats API
export const statsAPI = {
  get: (params) => api.get('/stats', { params }),
};

export default api;
