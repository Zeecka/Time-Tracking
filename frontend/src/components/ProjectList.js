import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Table, Button, Modal, Form, Alert } from 'react-bootstrap';
import Select from 'react-select';
import { useTranslation } from 'react-i18next';
import { projectAPI, trackingCodeAPI } from '../services/api';

const getPatternStyle = (color, pattern) => {
  const baseColor = color || '#3498db';
  if (pattern === 'striped') {
    return {
      backgroundColor: baseColor,
      backgroundImage: `repeating-linear-gradient(45deg, ${baseColor} 0px, ${baseColor} 5px, rgba(255, 255, 255, 0.45) 5px, rgba(255, 255, 255, 0.45) 9px)`,
    };
  }
  if (pattern === 'dotted') {
    return {
      backgroundColor: baseColor,
      backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.65) 18%, transparent 20%)`,
      backgroundSize: '6px 6px',
    };
  }
  return { backgroundColor: baseColor };
};

function ProjectList() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState([]);
  const [trackingCodes, setTrackingCodes] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({ name: '', tracking_code_id: '', color: '#3498db', pattern: 'solid' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const importInputRef = useRef(null);

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      const response = await projectAPI.getAll();
      setProjects(response.data);
    } catch (err) {
      setError(t('project.errorLoad'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadTrackingCodes = useCallback(async () => {
    try {
      const response = await trackingCodeAPI.getAll();
      setTrackingCodes(response.data);
    } catch (err) {
      console.error('Error loading tracking codes', err);
    }
  }, []);

  useEffect(() => {
    loadProjects();
    loadTrackingCodes();
  }, [loadProjects, loadTrackingCodes]);

  const handleShowModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        name: item.name,
        tracking_code_id: item.tracking_code_id,
        color: item.color,
        pattern: item.pattern || 'solid',
      });
    } else {
      setEditingItem(null);
      setFormData({ name: '', tracking_code_id: '', color: '#3498db', pattern: 'solid' });
    }
    setShowModal(true);
    setError('');
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingItem(null);
    setFormData({ name: '', tracking_code_id: '', color: '#3498db', pattern: 'solid' });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        tracking_code_id: parseInt(formData.tracking_code_id),
      };

      if (editingItem) {
        await projectAPI.update(editingItem.id, data);
      } else {
        await projectAPI.create(data);
      }
      handleCloseModal();
      loadProjects();
    } catch (err) {
      setError(err.response?.data?.error || t('project.errorSave'));
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm(t('project.deleteConfirm', { name: projects.find((p) => p.id === id)?.name || '' }))) {
      try {
        await projectAPI.delete(id);
        loadProjects();
      } catch (err) {
        setError(err.response?.data?.error || t('project.errorDelete'));
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
      const response = await projectAPI.exportCSV();
      downloadBlob(response.data, 'projects.csv');
      setMessage(t('project.exportCsvSuccess') || 'CSV export done.');
    } catch (err) {
      setError(err.response?.data?.error || t('project.errorExportCsv'));
    }
  };

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  // ── Custom select styles for react-select
  const customSelectStyles = {
    control: (provided, state) => ({
      ...provided,
      backgroundColor: 'var(--rs-bg)',
      borderColor: state.isFocused ? 'var(--rs-focus-border)' : 'var(--rs-border)',
      boxShadow: state.isFocused ? '0 0 0 0.25rem var(--rs-focus-shadow)' : 'none',
      '&:hover': {
        borderColor: 'var(--rs-focus-border)',
      },
      minHeight: '38px',
      fontSize: '14px',
    }),
    menu: (provided) => ({
      ...provided,
      backgroundColor: 'var(--rs-menu-bg)',
      zIndex: 9999,
    }),
    option: (provided, state) => ({
      ...provided,
      backgroundColor: state.isSelected
        ? 'var(--rs-option-selected)'
        : state.isFocused
        ? 'var(--rs-option-focused)'
        : 'var(--rs-menu-bg)',
      color: state.isSelected ? '#fff' : 'var(--rs-option-color)',
      cursor: 'pointer',
    }),
    singleValue: (provided) => ({
      ...provided,
      color: 'var(--rs-text)',
    }),
    input: (provided) => ({
      ...provided,
      color: 'var(--rs-text)',
    }),
  };

  const handleImportCSV = async (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const response = await projectAPI.importCSV(file);
      const data = response.data || {};
      setMessage(
        t('project.importSuccess', { created: data.created || 0, updated: data.updated || 0 })
      );
      await Promise.all([loadProjects(), loadTrackingCodes()]);
    } catch (err) {
      setError(err.response?.data?.error || t('project.errorImportCsv'));
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="mb-0" style={{ fontWeight: 700 }}>
          <i className="fas fa-folder-open me-2" style={{ color: '#f39c12' }}></i>
          {t('project.title')}
        </h2>
        <Button variant="primary" onClick={() => handleShowModal()}>
          <i className="fas fa-plus me-2"></i>
          {t('project.new')}
        </Button>
      </div>

      <div className="d-flex gap-2 mb-3">
        <Button variant="outline-primary" size="sm" onClick={handleImportClick}>
          <i className="fas fa-file-import me-2"></i>
          {t('project.importCsv')}
        </Button>
        <Button variant="outline-success" size="sm" onClick={handleExportCSV}>
          <i className="fas fa-file-export me-2"></i>
          {t('project.exportCsv')}
        </Button>
        <Button variant="outline-secondary" size="sm" as="a" href="/examples/projects_example.csv" download>
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
        <Table striped bordered hover className="project-table">
          <thead>
            <tr>
              <th style={{ fontFamily: 'monospace', textAlign: 'center', verticalAlign: 'middle' }}>{t('project.name')}</th>
              <th style={{ fontFamily: 'monospace', textAlign: 'center' }}>{t('project.trackingCode')}</th>
              <th style={{ textAlign: 'center', verticalAlign: 'middle' }}>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((item) => (
              <tr key={item.id}>
                <td style={{ fontFamily: 'monospace', textAlign: 'center' }}>
                  <div className="d-flex align-items-center justify-content-center gap-2">
                    <div
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '3px',
                        border: '1px solid #999',
                        flexShrink: 0,
                        ...getPatternStyle(item.color, item.pattern || 'solid'),
                      }}
                      title={`${item.color} · ${item.pattern || 'solid'}`}
                    />
                    <span>{item.name}</span>
                  </div>
                </td>
                <td style={{ fontFamily: 'monospace', textAlign: 'center' }}>{item.tracking_code?.code || 'N/A'}</td>
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
            {editingItem ? t('project.edit') : t('project.create')}
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            {error && <Alert variant="danger">{error}</Alert>}
            <Form.Group className="mb-3">
              <Form.Label>{t('project.name')}</Form.Label>
              <Form.Control
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('project.namePlaceholder')}
                required
                maxLength={128}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>{t('project.trackingCode')}</Form.Label>
              <Select
                options={trackingCodes.map((tc) => ({ value: tc.id, label: tc.code }))}
                value={formData.tracking_code_id ? { value: formData.tracking_code_id, label: trackingCodes.find(tc => tc.id === formData.tracking_code_id)?.code || '' } : null}
                onChange={(opt) => setFormData({ ...formData, tracking_code_id: opt ? opt.value : '' })}
                styles={customSelectStyles}
                classNamePrefix="rs"
                className="rs-select"
                isSearchable
                isClearable
                placeholder={t('common.selectCode') || 'Select a code'}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>{t('project.color')}</Form.Label>
              <div className="d-flex gap-2 align-items-center">
                <Form.Control
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="p-2"
                  style={{ width: '80px', height: '40px', cursor: 'pointer' }}
                />
                <Form.Control
                  type="text"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  placeholder="#3498db"
                  maxLength={7}
                  pattern="^#[0-9A-Fa-f]{6}$"
                />
              </div>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>{t('project.pattern')}</Form.Label>
              <Select
                options={[
                  { value: 'solid', label: t('project.patterns.solid') },
                  { value: 'striped', label: t('project.patterns.striped') },
                  { value: 'dotted', label: t('project.patterns.dotted') },
                ]}
                value={{ value: formData.pattern, label: t(`project.patterns.${formData.pattern}`) }}
                onChange={(opt) => setFormData({ ...formData, pattern: opt.value })}
                styles={customSelectStyles}
                classNamePrefix="rs"
                className="rs-select"
                isSearchable
                isClearable={false}
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

export default ProjectList;
