import React, { useState, useEffect, useRef } from 'react';
import { Table, Button, Modal, Form, Alert } from 'react-bootstrap';
import { utilisateurAPI } from '../services/api';

function UtilisateurList() {
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({ nom: '', couleur: '#3498db' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const importInputRef = useRef(null);

  useEffect(() => {
    loadUtilisateurs();
  }, []);

  const loadUtilisateurs = async () => {
    try {
      setLoading(true);
      const response = await utilisateurAPI.getAll();
      setUtilisateurs(response.data);
    } catch (err) {
      setError('Erreur lors du chargement des utilisateurs');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleShowModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({ nom: item.nom, couleur: item.couleur });
    } else {
      setEditingItem(null);
      setFormData({ nom: '', couleur: '#3498db' });
    }
    setShowModal(true);
    setError('');
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingItem(null);
    setFormData({ nom: '', couleur: '#3498db' });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await utilisateurAPI.update(editingItem.id, formData);
      } else {
        await utilisateurAPI.create(formData);
      }
      handleCloseModal();
      loadUtilisateurs();
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la sauvegarde');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')) {
      try {
        await utilisateurAPI.delete(id);
        loadUtilisateurs();
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
      const response = await utilisateurAPI.exportCSV();
      downloadBlob(response.data, 'utilisateurs.csv');
      setMessage('Export CSV des utilisateurs terminé.');
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
      const response = await utilisateurAPI.importCSV(file);
      const data = response.data || {};
      setMessage(
        `Import CSV utilisateurs : ${data.created || 0} créé(s), ${data.updated || 0} mis à jour, ${(data.errors || []).length} erreur(s).`
      );
      loadUtilisateurs();
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
          <i className="fas fa-users me-2" style={{ color: '#9b59b6' }}></i>
          Utilisateurs
        </h2>
        <Button variant="primary" onClick={() => handleShowModal()}>
          <i className="fas fa-plus me-2"></i>
          Nouvel Utilisateur
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
        <Button variant="outline-secondary" size="sm" as="a" href="/examples/utilisateurs_exemple.csv" download>
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
        <Table striped bordered hover className="utilisateur-table">
          <thead>
            <tr>
              <th style={{ fontFamily: 'monospace', textAlign: 'center' }}>Nom</th>
              <th style={{ fontFamily: 'monospace', textAlign: 'center' }}>Date de création</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {utilisateurs.map((item) => (
              <tr key={item.id}>
                <td style={{ fontFamily: 'monospace', textAlign: 'center' }}>
                  <div className="d-flex align-items-center gap-2 justify-content-center">
                    <div
                      style={{
                        width: '20px',
                        height: '20px',
                        backgroundColor: item.couleur,
                        border: '1px solid #999',
                        borderRadius: '3px',
                        flexShrink: 0,
                      }}
                      title={item.couleur}
                    />
                    <span>{item.nom}</span>
                  </div>
                </td>
                <td style={{ fontFamily: 'monospace', textAlign: 'center' }}>{new Date(item.created_at).toLocaleDateString('fr-FR')}</td>
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
            {editingItem ? 'Modifier' : 'Nouvel'} Utilisateur
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            {error && <Alert variant="danger">{error}</Alert>}
            <Form.Group className="mb-3">
              <Form.Label>Nom</Form.Label>
              <Form.Control
                type="text"
                value={formData.nom}
                onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                placeholder="Entrez le nom"
                required
                maxLength={128}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Couleur</Form.Label>
              <div className="d-flex align-items-center">
                <Form.Control
                  type="color"
                  value={formData.couleur}
                  onChange={(e) => setFormData({ ...formData, couleur: e.target.value })}
                  style={{ width: '60px', height: '40px', marginRight: '10px' }}
                  required
                />
                <Form.Control
                  type="text"
                  value={formData.couleur}
                  onChange={(e) => setFormData({ ...formData, couleur: e.target.value })}
                  placeholder="#RRGGBB"
                  pattern="^#[0-9A-Fa-f]{6}$"
                  required
                />
              </div>
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

export default UtilisateurList;
