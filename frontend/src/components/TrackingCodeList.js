import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Table, Button, Modal, Form, Alert } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { trackingCodeAPI } from '../services/api';

function TrackingCodeList() {
  const { t } = useTranslation();
  const [trackingCodes, setTrackingCodes] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({ code: '', note: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const importInputRef = useRef(null);

  const loadTrackingCodes = useCallback(async () => {
    try {
      setLoading(true);
      const response = await trackingCodeAPI.getAll();
      setTrackingCodes(response.data);
    } catch (err) {
      setError(t('trackingCode.errorLoad'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadTrackingCodes();
  }, [loadTrackingCodes]);

  const handleShowModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({ code: item.code, note: item.note || '' });
    } else {
      setEditingItem(null);
      setFormData({ code: '', note: '' });
    }
    setShowModal(true);
    setError('');
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingItem(null);
    setFormData({ code: '', note: '' });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await trackingCodeAPI.update(editingItem.id, formData);
      } else {
        await trackingCodeAPI.create(formData);
      }
      handleCloseModal();
      loadTrackingCodes();
    } catch (err) {
      setError(err.response?.data?.error || t('trackingCode.errorSave'));
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm(t('trackingCode.deleteConfirm'))) {
      try {
        await trackingCodeAPI.delete(id);
        loadTrackingCodes();
      } catch (err) {
        setError(err.response?.data?.error || t('trackingCode.errorDelete'));
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
      const response = await trackingCodeAPI.exportCSV();
      downloadBlob(response.data, 'tracking_codes.csv');
      setMessage(t('trackingCode.exportCsvSuccess') || 'CSV export done.');
    } catch (err) {
      setError(err.response?.data?.error || t('trackingCode.errorExportCsv'));
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
      const response = await trackingCodeAPI.importCSV(file);
      const data = response.data || {};
      setMessage(
        t('trackingCode.importSuccess', { created: data.created || 0, skipped: data.skipped || 0 })
      );
      loadTrackingCodes();
    } catch (err) {
      setError(err.response?.data?.error || t('trackingCode.errorImportCsv'));
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="mb-0" style={{ fontWeight: 700 }}>
          <i className="fas fa-tags me-2" style={{ color: '#e67e22' }}></i>
          {t('trackingCode.title')}
        </h2>
        <Button variant="primary" onClick={() => handleShowModal()}>
          <i className="fas fa-plus me-2"></i>
          {t('trackingCode.new')}
        </Button>
      </div>

      <div className="d-flex gap-2 mb-3">
        <Button variant="outline-primary" size="sm" onClick={handleImportClick}>
          <i className="fas fa-file-import me-2"></i>
          {t('trackingCode.importCsv')}
        </Button>
        <Button variant="outline-success" size="sm" onClick={handleExportCSV}>
          <i className="fas fa-file-export me-2"></i>
          {t('trackingCode.exportCsv')}
        </Button>
        <Button variant="outline-secondary" size="sm" as="a" href="/examples/tracking_codes_example.csv" download>
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
        <Table striped bordered hover className="tracking-code-table">
          <thead>
            <tr>
              <th style={{ fontFamily: 'monospace', textAlign: 'center' }}>{t('trackingCode.code')}</th>
              <th>{t('trackingCode.note')}</th>
              <th style={{ textAlign: 'center' }}>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {trackingCodes.map((item) => (
              <tr key={item.id}>
                <td style={{ fontFamily: 'monospace', textAlign: 'center' }}>{item.code}</td>
                <td>{item.note || ''}</td>
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
            {editingItem ? t('trackingCode.edit') : t('trackingCode.create')}
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            {error && <Alert variant="danger">{error}</Alert>}
            <Form.Group className="mb-3">
              <Form.Label>{t('trackingCode.code')}</Form.Label>
              <Form.Control
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder={t('trackingCode.codePlaceholder')}
                required
                maxLength={128}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>{t('trackingCode.note')}</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                placeholder={t('trackingCode.notePlaceholder')}
              />
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

export default TrackingCodeList;
