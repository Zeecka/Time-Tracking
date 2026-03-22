import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Table, Button, Modal, Form, Alert } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { userAPI } from '../services/api';

function UserList() {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({ name: '', color: '#3498db' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const importInputRef = useRef(null);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await userAPI.getAll();
      setUsers(response.data);
    } catch (err) {
      setError(t('user.errorLoad'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleShowModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({ name: item.name, color: item.color });
    } else {
      setEditingItem(null);
      setFormData({ name: '', color: '#3498db' });
    }
    setShowModal(true);
    setError('');
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingItem(null);
    setFormData({ name: '', color: '#3498db' });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await userAPI.update(editingItem.id, formData);
      } else {
        await userAPI.create(formData);
      }
      handleCloseModal();
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || t('user.errorSave'));
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm(t('user.deleteConfirm', { name: users.find((u) => u.id === id)?.name || '' }))) {
      try {
        await userAPI.delete(id);
        loadUsers();
      } catch (err) {
        setError(err.response?.data?.error || t('user.errorDelete'));
      }
    }
  };

  const downloadBlob = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleExportCSV = async () => {
    try {
      const response = await userAPI.exportCSV();
      downloadBlob(response.data, 'users.csv');
      setMessage(t('user.exportCsvSuccess') || 'CSV export done.');
    } catch (err) {
      setError(err.response?.data?.error || t('user.errorExportCsv'));
    }
  };

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const handleImportCSV = async (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const response = await userAPI.importCSV(file);
      const data = response.data || {};
      setMessage(
        t('user.importSuccess', { created: data.created || 0, updated: data.updated || 0 })
      );
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || t('user.errorImportCsv'));
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="mb-0" style={{ fontWeight: 700 }}>
          <i className="fas fa-users me-2" style={{ color: '#9b59b6' }}></i>
          {t('user.title')}
        </h2>
        <Button variant="primary" onClick={() => handleShowModal()}>
          <i className="fas fa-plus me-2"></i>
          {t('user.new')}
        </Button>
      </div>

      <div className="d-flex gap-2 mb-3">
        <Button variant="outline-primary" size="sm" onClick={handleImportClick}>
          <i className="fas fa-file-import me-2"></i>
          {t('user.importCsv')}
        </Button>
        <Button variant="outline-success" size="sm" onClick={handleExportCSV}>
          <i className="fas fa-file-export me-2"></i>
          {t('user.exportCsv')}
        </Button>
        <Button variant="outline-secondary" size="sm" as="a" href="/examples/users_example.csv" download>
          <i className="fas fa-download me-2"></i>
          {t('common.csvExample') || 'CSV example'}
        </Button>
        <Form.Control
          ref={importInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleImportCSV}
          style={{ display: 'none' }}
        />
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
      {message && <Alert variant="success" dismissible onClose={() => setMessage('')}>{message}</Alert>}

      {loading ? (
        <p>{t('common.loading')}</p>
      ) : (
        <Table striped bordered hover className="user-table">
          <thead>
            <tr>
              <th style={{ fontFamily: 'monospace', textAlign: 'center' }}>{t('user.name')}</th>
              <th style={{ fontFamily: 'monospace', textAlign: 'center' }}>{t('grid.createdAt') || 'Created at'}</th>
              <th style={{ textAlign: 'center' }}>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((item) => (
              <tr key={item.id}>
                <td style={{ fontFamily: 'monospace', textAlign: 'center' }}>
                  <div className="d-flex align-items-center gap-2 justify-content-center">
                    <div
                      style={{
                        width: '20px',
                        height: '20px',
                        backgroundColor: item.color,
                        border: '1px solid #999',
                        borderRadius: '3px',
                        flexShrink: 0,
                      }}
                      title={item.color}
                    />
                    <span>{item.name}</span>
                  </div>
                </td>
                <td style={{ fontFamily: 'monospace', textAlign: 'center' }}>
                  {new Date(item.created_at).toLocaleDateString()}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <div className="d-flex align-items-center justify-content-center gap-2">
                    <Button
                      variant="outline-warning"
                      size="sm"
                      title={t('common.edit')}
                      onClick={() => handleShowModal(item)}
                      className="d-flex align-items-center justify-content-center"
                      style={{ width: '36px', height: '36px', padding: '0' }}
                    >
                      <i className="fas fa-pen"></i>
                    </Button>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      title={t('common.delete')}
                      onClick={() => handleDelete(item.id)}
                      className="d-flex align-items-center justify-content-center"
                      style={{ width: '36px', height: '36px', padding: '0' }}
                    >
                      <i className="fas fa-trash"></i>
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Modal show={showModal} onHide={handleCloseModal}>
        <Modal.Header closeButton>
          <Modal.Title>
            {editingItem ? t('user.edit') : t('user.create')}
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            {error && <Alert variant="danger">{error}</Alert>}
            <Form.Group className="mb-3">
              <Form.Label>{t('user.name')}</Form.Label>
              <Form.Control
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('user.namePlaceholder')}
                required
                maxLength={128}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>{t('user.color')}</Form.Label>
              <div className="d-flex align-items-center">
                <Form.Control
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  style={{ width: '60px', height: '40px', marginRight: '10px' }}
                  required
                />
                <Form.Control
                  type="text"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  placeholder="#RRGGBB"
                  pattern="^#[0-9A-Fa-f]{6}$"
                  required
                />
              </div>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={handleCloseModal}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" type="submit">
              {t('common.save')}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
}

export default UserList;
