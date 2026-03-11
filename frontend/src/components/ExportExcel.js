import React, { useState, useEffect, useCallback } from 'react';
import { Button, Form, Alert, Row, Col, Card, Table } from 'react-bootstrap';
import * as XLSX from 'xlsx';
import { pointageAPI, utilisateurAPI, projetAPI } from '../services/api';

const getCurrentIsoWeekInfo = () => {
  const now = new Date();
  const utcDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const year = utcDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);

  return { year, week };
};

const getIsoWeeksInYear = (year) => {
  const date = new Date(Date.UTC(year, 11, 28));
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  return Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
};

const sanitizeWeekYear = (year, week) => {
  const CURRENT_WEEK_INFO = getCurrentIsoWeekInfo();
  const parsedYear = Number.isFinite(Number(year)) ? parseInt(year, 10) : CURRENT_WEEK_INFO.year;
  const safeYear = Math.min(2100, Math.max(2000, parsedYear));
  const maxWeeks = getIsoWeeksInYear(safeYear);
  const parsedWeek = Number.isFinite(Number(week)) ? parseInt(week, 10) : CURRENT_WEEK_INFO.week;
  const safeWeek = Math.min(maxWeeks, Math.max(1, parsedWeek));

  return { annee: safeYear, numero_semaine: safeWeek };
};

const getIsoWeekDateRange = (year, week) => {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setUTCDate(jan4.getUTCDate() - jan4Day + 1);

  const monday = new Date(mondayWeek1);
  monday.setUTCDate(mondayWeek1.getUTCDate() + ((week - 1) * 7));
  const friday = new Date(monday);
  friday.setUTCDate(monday.getUTCDate() + 4);

  return {
    monday,
    friday,
    date_debut: monday.toISOString().split('T')[0],
    date_fin: friday.toISOString().split('T')[0],
  };
};

const formatDateDDMMYYYY = (dateString) => {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-');
  return `${day}/${month}/${year}`;
};

const calculateDays = (dateDebut, periodeDebut, dateFin, periodeFin) => {
  if (!dateDebut || !dateFin) return 0;

  const debut = new Date(dateDebut);
  const fin = new Date(dateFin);
  const diffTime = fin - debut;
  const diffDays = diffTime / (1000 * 60 * 60 * 24);

  let days = diffDays;

  if (dateDebut === dateFin) {
    if (periodeDebut === 'matin' && periodeFin === 'soir') {
      days = 1;
    } else if (periodeDebut === 'matin' && periodeFin === 'midi') {
      days = 0.5;
    } else if (periodeDebut === 'midi' && periodeFin === 'soir') {
      days = 0.5;
    } else {
      days = 0.5;
    }
  } else {
    if (periodeDebut === 'midi') {
      days -= 0.5;
    }
    if (periodeFin === 'midi') {
      days += 0.5;
    } else {
      days += 1;
    }
  }

  return Math.max(0, days);
};

const PERIODE_LABELS = {
  matin: 'Matin',
  midi: 'Midi',
  soir: 'Soir',
  journee: 'Journée',
  apres_midi: 'Après-midi',
};

function ExportExcel() {
  const CURRENT_WEEK_INFO = getCurrentIsoWeekInfo();
  const [filters, setFilters] = useState({
    annee: CURRENT_WEEK_INFO.year,
    numero_semaine: CURRENT_WEEK_INFO.week,
  });
  const [pointages, setPointages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const loadPointages = useCallback(async (filterParams) => {
    try {
      setLoading(true);
      const response = await pointageAPI.getAll(filterParams);
      setPointages(response.data);
      setError('');
    } catch (err) {
      setError('Erreur lors du chargement des pointages');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPointages(filters);
  }, [filters, loadPointages]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    const nextFilters = { ...filters, [name]: value };
    setFilters(sanitizeWeekYear(nextFilters.annee, nextFilters.numero_semaine));
  };

  const handleWeekShift = (direction) => {
    setFilters((prev) => {
      const maxWeeks = getIsoWeeksInYear(prev.annee);

      if (direction < 0) {
        if (prev.numero_semaine > 1) {
          return { ...prev, numero_semaine: prev.numero_semaine - 1 };
        }
        const previousYear = prev.annee - 1;
        const safeYear = Math.max(2000, previousYear);
        return { annee: safeYear, numero_semaine: getIsoWeeksInYear(safeYear) };
      }

      if (prev.numero_semaine < maxWeeks) {
        return { ...prev, numero_semaine: prev.numero_semaine + 1 };
      }

      const nextYear = prev.annee + 1;
      const safeYear = Math.min(2100, nextYear);
      return { annee: safeYear, numero_semaine: 1 };
    });
  };

  const handleExportExcel = () => {
    if (pointages.length === 0) {
      setError('Aucun pointage à exporter pour cette période');
      return;
    }

    try {
      setExporting(true);

      // Préparer les données pour Excel
      const excelData = pointages.map((item) => ({
        Utilisateur: item.utilisateur?.nom || 'N/A',
        Projet: item.projet?.nom || 'N/A',
        'Code Pointage': item.projet?.code_pointage?.code || 'N/A',
        'Date Début': formatDateDDMMYYYY(item.date_debut),
        'Période Début': PERIODE_LABELS[item.periode_debut] || item.periode_debut,
        'Date Fin': formatDateDDMMYYYY(item.date_fin),
        'Période Fin': PERIODE_LABELS[item.periode_fin] || item.periode_fin,
        'Jours': calculateDays(item.date_debut, item.periode_debut, item.date_fin, item.periode_fin),
        Semaine: item.numero_semaine,
        Année: item.annee,
      }));

      // Créer le workbook et la feuille
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData);

      // Ajuster la largeur des colonnes
      const columnWidths = [
        { wch: 20 }, // Utilisateur
        { wch: 30 }, // Projet
        { wch: 15 }, // Code Pointage
        { wch: 12 }, // Date Début
        { wch: 15 }, // Période Début
        { wch: 12 }, // Date Fin
        { wch: 15 }, // Période Fin
        { wch: 8 },  // Jours
        { wch: 10 }, // Semaine
        { wch: 8 },  // Année
      ];
      ws['!cols'] = columnWidths;

      // Ajouter la feuille au workbook
      const weekRange = getIsoWeekDateRange(filters.annee, filters.numero_semaine);
      const sheetName = `S${filters.numero_semaine}_${filters.annee}`;
      XLSX.utils.book_append_sheet(wb, ws, sheetName);

      // Générer et télécharger le fichier
      const fileName = `pointages_semaine_${filters.numero_semaine}_${filters.annee}.xlsx`;
      XLSX.writeFile(wb, fileName);

      setError('');
    } catch (err) {
      setError('Erreur lors de l\'export Excel');
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

  const weekRange = getIsoWeekDateRange(filters.annee, filters.numero_semaine);
  const formatFrenchShortDate = (date) => new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(date);
  const selectedWeekLabel = `Lundi ${formatFrenchShortDate(weekRange.monday)} - Vendredi ${formatFrenchShortDate(weekRange.friday)}`;

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="mb-0" style={{ fontWeight: 700 }}>
          <i className="fas fa-file-excel me-2" style={{ color: '#27ae60' }}></i>
          Export Excel
        </h2>
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

      <Card className="mb-4">
        <Card.Header>
          <h5 className="mb-0">Sélection de la période</h5>
        </Card.Header>
        <Card.Body>
          <Row className="mb-3">
            <Col md={3}>
              <Form.Group>
                <Form.Label>Année</Form.Label>
                <Form.Control
                  type="number"
                  name="annee"
                  value={Number.isFinite(filters.annee) ? filters.annee : ''}
                  onChange={handleFilterChange}
                  min="2000"
                  max="2100"
                />
              </Form.Group>
            </Col>
            <Col md={3}>
              <Form.Group>
                <Form.Label>Semaine</Form.Label>
                <Form.Control
                  type="number"
                  name="numero_semaine"
                  value={Number.isFinite(filters.numero_semaine) ? filters.numero_semaine : ''}
                  onChange={handleFilterChange}
                  min="1"
                  max="53"
                />
              </Form.Group>
            </Col>
            <Col md={3} className="d-flex align-items-end gap-2">
              <Button
                variant="outline-secondary"
                onClick={() => handleWeekShift(-1)}
                aria-label="Semaine précédente"
                className="d-flex align-items-center justify-content-center"
                style={{ width: '40px', height: '38px' }}
              >
                <i className="fas fa-chevron-left"></i>
              </Button>
              <Button
                variant="outline-secondary"
                onClick={() => handleWeekShift(1)}
                aria-label="Semaine suivante"
                className="d-flex align-items-center justify-content-center"
                style={{ width: '40px', height: '38px' }}
              >
                <i className="fas fa-chevron-right"></i>
              </Button>
            </Col>
          </Row>
          <Row className="mb-3">
            <Col>
              <div className="text-muted">{selectedWeekLabel}</div>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Card className="mb-4">
        <Card.Header className="d-flex justify-content-between align-items-center">
          <h5 className="mb-0">Aperçu des données</h5>
          <Button
            variant="success"
            onClick={handleExportExcel}
            disabled={loading || exporting || pointages.length === 0}
          >
            <i className="fas fa-file-excel me-2"></i>
            {exporting ? 'Export en cours...' : 'Exporter vers Excel'}
          </Button>
        </Card.Header>
        <Card.Body>
          {loading ? (
            <p>Chargement...</p>
          ) : pointages.length === 0 ? (
            <Alert variant="info">Aucun pointage trouvé pour cette période</Alert>
          ) : (
            <>
              <p className="mb-3">
                <strong>{pointages.length}</strong> pointage(s) trouvé(s) pour la semaine {filters.numero_semaine} de {filters.annee}
              </p>
              <Table striped bordered hover responsive>
                <thead>
                  <tr>
                    <th>Utilisateur</th>
                    <th>Projet</th>
                    <th>Code Pointage</th>
                    <th>Début</th>
                    <th>Fin</th>
                    <th>Jours</th>
                  </tr>
                </thead>
                <tbody>
                  {pointages.slice(0, 10).map((item) => (
                    <tr key={item.id}>
                      <td>{item.utilisateur?.nom || 'N/A'}</td>
                      <td>{item.projet?.nom || 'N/A'}</td>
                      <td>{item.projet?.code_pointage?.code || 'N/A'}</td>
                      <td>
                        {formatDateDDMMYYYY(item.date_debut)}
                        {' '}
                        <small className="text-muted">
                          ({PERIODE_LABELS[item.periode_debut] || item.periode_debut})
                        </small>
                      </td>
                      <td>
                        {formatDateDDMMYYYY(item.date_fin)}
                        {' '}
                        <small className="text-muted">
                          ({PERIODE_LABELS[item.periode_fin] || item.periode_fin})
                        </small>
                      </td>
                      <td>
                        <strong>
                          {calculateDays(item.date_debut, item.periode_debut, item.date_fin, item.periode_fin)}
                        </strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {pointages.length > 10 && (
                <p className="text-muted text-center mt-2">
                  ... et {pointages.length - 10} autre(s) pointage(s)
                </p>
              )}
            </>
          )}
        </Card.Body>
      </Card>
    </div>
  );
}

export default ExportExcel;
