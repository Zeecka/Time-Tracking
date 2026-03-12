import React, { useState, useEffect, useRef } from 'react';
import { Table, Button, Modal, Form, Alert } from 'react-bootstrap';
import { projetAPI, codePointageAPI } from '../services/api';

const getMotifStyle = (couleur, motif) => {
  const baseColor = couleur || '#3498db';
  if (motif === 'raye') {
    return {
      backgroundColor: baseColor,
      backgroundImage: `repeating-linear-gradient(45deg, ${baseColor} 0px, ${baseColor} 5px, rgba(255, 255, 255, 0.45) 5px, rgba(255, 255, 255, 0.45) 9px)`,
    };
  }
  if (motif === 'pointille') {
    return {
      backgroundColor: baseColor,
      backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.65) 18%, transparent 20%)`,
      backgroundSize: '6px 6px',
    };
  }
  return { backgroundColor: baseColor };
};

function ProjetList() {
  const [projets, setProjets] = useState([]);
  const [codePointages, setCodePointages] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({ nom: '', code_pointage_id: '', couleur: '#3498db', motif: 'uni' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const importInputRef = useRef(null);

  useEffect(() => {
    loadProjets();
    loadCodePointages();
  }, []);

  const loadProjets = async () => {
    try {
      setLoading(true);
      const response = await projetAPI.getAll();
      setProjets(response.data);
    } catch (err) {
      setError('Erreur lors du chargement des projets');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadCodePointages = async () => {
    try {
      const response = await codePointageAPI.getAll();
      setCodePointages(response.data);
    } catch (err) {
      console.error('Erreur lors du chargement des codes pointage', err);
    }
  };

  const handleShowModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        nom: item.nom,
        code_pointage_id: item.code_pointage_id,
        couleur: item.couleur,
        motif: item.motif || 'uni',
      });
    } else {
      setEditingItem(null);
      setFormData({ nom: '', code_pointage_id: '', couleur: '#3498db', motif: 'uni' });
    }
    setShowModal(true);
    setError('');
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingItem(null);
    setFormData({ nom: '', code_pointage_id: '', couleur: '#3498db', motif: 'uni' });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        code_pointage_id: parseInt(formData.code_pointage_id),
      };

      if (editingItem) {
        await projetAPI.update(editingItem.id, data);
      } else {
        await projetAPI.create(data);
      }
      handleCloseModal();
      loadProjets();
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la sauvegarde');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer ce projet ?')) {
      try {
        await projetAPI.delete(id);
        loadProjets();
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
      const response = await projetAPI.exportCSV();
      downloadBlob(response.data, 'projets.csv');
      setMessage('Export CSV des projets terminé.');
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
      const response = await projetAPI.importCSV(file);
      const data = response.data || {};
      setMessage(
        `Import CSV projets : ${data.created || 0} créé(s), ${data.updated || 0} mis à jour, ${(data.errors || []).length} erreur(s).`
      );
      await Promise.all([loadProjets(), loadCodePointages()]);
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
          <i className="fas fa-folder-open me-2" style={{ color: '#f39c12' }}></i>
          Projets
        </h2>
        <Button variant="primary" onClick={() => handleShowModal()}>
          <i className="fas fa-plus me-2"></i>
          Nouveau Projet
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
        <Button variant="outline-secondary" size="sm" as="a" href="/examples/projets_exemple.csv" download>
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
        <Table striped bordered hover className="projet-table">
          <thead>
            <tr>
              <th style={{ fontFamily: 'monospace', textAlign: 'center', verticalAlign: 'middle' }}>Nom du projet</th>
              <th style={{ fontFamily: 'monospace', textAlign: 'center' }}>Code pointage</th>
              <th style={{ textAlign: 'center', verticalAlign: 'middle' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {projets.map((item) => (
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
                        ...getMotifStyle(item.couleur, item.motif || 'uni'),
                      }}
                      title={`${item.couleur} · ${item.motif || 'uni'}`}
                    />
                    <span>{item.nom}</span>
                  </div>
                </td>
                <td style={{ fontFamily: 'monospace', textAlign: 'center' }}>{item.code_pointage?.code || 'N/A'}</td>
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
            {editingItem ? 'Modifier' : 'Nouveau'} Projet
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            {error && <Alert variant="danger">{error}</Alert>}
            <Form.Group className="mb-3">
              <Form.Label>Nom du projet</Form.Label>
              <Form.Control
                type="text"
                value={formData.nom}
                onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                placeholder="Entrez le nom du projet"
                required
                maxLength={128}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Code pointage</Form.Label>
              <Form.Select
                value={formData.code_pointage_id}
                onChange={(e) => setFormData({ ...formData, code_pointage_id: e.target.value })}
                required
              >
                <option value="">Sélectionnez un code</option>
                {codePointages.map((cp) => (
                  <option key={cp.id} value={cp.id}>
                    {cp.code}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Couleur du projet</Form.Label>
              <div className="d-flex gap-2 align-items-center">
                <Form.Control
                  type="color"
                  value={formData.couleur}
                  onChange={(e) => setFormData({ ...formData, couleur: e.target.value })}
                  className="p-2"
                  style={{ width: '80px', height: '40px', cursor: 'pointer' }}
                />
                <Form.Control
                  type="text"
                  value={formData.couleur}
                  onChange={(e) => setFormData({ ...formData, couleur: e.target.value })}
                  placeholder="#3498db"
                  maxLength={7}
                  pattern="^#[0-9A-Fa-f]{6}$"
                />
              </div>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Motif</Form.Label>
              <Form.Select
                value={formData.motif}
                onChange={(e) => setFormData({ ...formData, motif: e.target.value })}
                required
              >
                <option value="uni">Uni</option>
                <option value="raye">Rayé</option>
                <option value="pointille">Pointillé</option>
              </Form.Select>
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

export default ProjetList;
