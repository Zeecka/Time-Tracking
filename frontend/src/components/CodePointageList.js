import React, { useState, useEffect, useRef } from 'react';
import { Table, Button, Modal, Form, Alert } from 'react-bootstrap';
import { codePointageAPI } from '../services/api';

function CodePointageList() {
  const [codePointages, setCodePointages] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({ code: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const importInputRef = useRef(null);

  useEffect(() => {
    loadCodePointages();
  }, []);

  const loadCodePointages = async () => {
    try {
      setLoading(true);
      const response = await codePointageAPI.getAll();
      setCodePointages(response.data);
    } catch (err) {
      setError('Erreur lors du chargement des codes pointage');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleShowModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({ code: item.code });
    } else {
      setEditingItem(null);
      setFormData({ code: '' });
    }
    setShowModal(true);
    setError('');
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingItem(null);
    setFormData({ code: '' });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await codePointageAPI.update(editingItem.id, formData);
      } else {
        await codePointageAPI.create(formData);
      }
      handleCloseModal();
      loadCodePointages();
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la sauvegarde');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer ce code pointage ?')) {
      try {
        await codePointageAPI.delete(id);
        loadCodePointages();
      } catch (err) {
        setError(err.response?.data?.error || 'Erreur lors de la suppression');
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
      const response = await codePointageAPI.exportCSV();
      downloadBlob(response.data, 'codes_pointage.csv');
      setMessage('Export CSV des codes terminé.');
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de l’export CSV');
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
      const response = await codePointageAPI.importCSV(file);
      const data = response.data || {};
      setMessage(
        `Import CSV codes terminé : ${data.created || 0} créé(s), ${data.skipped || 0} ignoré(s), ${(data.errors || []).length} erreur(s).`
      );
      loadCodePointages();
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de l’import CSV');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="mb-0" style={{ fontWeight: 700 }}>
          <i className="fas fa-tags me-2" style={{ color: '#e67e22' }}></i>
          Codes Pointage
        </h2>
        <Button variant="primary" onClick={() => handleShowModal()}>
          <i className="fas fa-plus me-2"></i>
          Nouveau Code
        </Button>
      </div>

      <div className="d-flex gap-2 mb-3">
        <Button variant="outline-primary" size="sm" onClick={handleImportClick}>
          <i className="fas fa-file-import me-2"></i>
          Import CSV
        </Button>
        <Button variant="outline-success" size="sm" onClick={handleExportCSV}>
          <i className="fas fa-file-export me-2"></i>
          Export CSV
        </Button>
        <Button variant="outline-secondary" size="sm" as="a" href="/examples/codes_pointage_exemple.csv" download>
          <i className="fas fa-download me-2"></i>
          CSV exemple
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
        <p>Chargement...</p>
      ) : (
        <Table striped bordered hover className="code-pointage-table">
          <thead>
            <tr>
              <th style={{ fontFamily: 'monospace', textAlign: 'center' }}>Code</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {codePointages.map((item) => (
              <tr key={item.id}>
                <td style={{ fontFamily: 'monospace', textAlign: 'center' }}>{item.code}</td>
                <td style={{ textAlign: 'center' }}>
                  <div className="d-flex align-items-center justify-content-center gap-2">
                    <Button
                      variant="outline-warning"
                      size="sm"
                      title="Modifier"
                      onClick={() => handleShowModal(item)}
                      className="d-flex align-items-center justify-content-center"
                      style={{ width: '36px', height: '36px', padding: '0' }}
                    >
                      <i className="fas fa-pen"></i>
                    </Button>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      title="Supprimer"
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
            {editingItem ? 'Modifier' : 'Nouveau'} Code Pointage
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            {error && <Alert variant="danger">{error}</Alert>}
            <Form.Group className="mb-3">
              <Form.Label>Code</Form.Label>
              <Form.Control
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ code: e.target.value })}
                placeholder="Entrez le code"
                required
                maxLength={128}
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={handleCloseModal}>
              Annuler
            </Button>
            <Button variant="primary" type="submit">
              Enregistrer
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
}

export default CodePointageList;
