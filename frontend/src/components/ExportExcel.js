import React, { useState, useEffect, useCallback } from 'react';
import { Button, Form, Alert, Row, Col, Card, Table } from 'react-bootstrap';
import * as XLSX from 'xlsx';
import { pointageAPI } from '../services/api';

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

const EXPORT_COLUMNS = [
  {
    id: 'annee',
    label: 'Année',
    width: 8,
    getValue: (item) => item.annee,
  },
  {
    id: 'semaine',
    label: 'Semaine',
    width: 10,
    getValue: (item) => item.numero_semaine,
  },
  {
    id: 'utilisateur',
    label: 'Utilisateur',
    width: 20,
    getValue: (item) => item.utilisateur?.nom || 'N/A',
  },
  {
    id: 'projet',
    label: 'Projet',
    width: 30,
    getValue: (item) => item.projet?.nom || 'N/A',
  },
  {
    id: 'code_pointage',
    label: 'Code Pointage',
    width: 15,
    getValue: (item) => item.projet?.code_pointage?.code || 'N/A',
  },
  {
    id: 'date_debut',
    label: 'Date Début',
    width: 12,
    getValue: (item) => formatDateDDMMYYYY(item.date_debut),
  },
  {
    id: 'periode_debut',
    label: 'Période Début',
    width: 15,
    getValue: (item) => PERIODE_LABELS[item.periode_debut] || item.periode_debut,
  },
  {
    id: 'date_fin',
    label: 'Date Fin',
    width: 12,
    getValue: (item) => formatDateDDMMYYYY(item.date_fin),
  },
  {
    id: 'periode_fin',
    label: 'Période Fin',
    width: 15,
    getValue: (item) => PERIODE_LABELS[item.periode_fin] || item.periode_fin,
  },
  {
    id: 'jours',
    label: 'Jours',
    width: 8,
    getValue: (item) => calculateDays(item.date_debut, item.periode_debut, item.date_fin, item.periode_fin),
  },
  {
    id: 'note',
    label: 'Note',
    width: 50,
    getValue: (item) => item.note || '',
  },
];

const getDefaultSelectedColumns = () => EXPORT_COLUMNS.reduce((acc, column) => ({
  ...acc,
  [column.id]: true,
}), {});

const getActiveColumns = (selectedColumns) => EXPORT_COLUMNS.filter((column) => selectedColumns[column.id]);

const compareWeekYear = (left, right) => {
  if (left.annee !== right.annee) {
    return left.annee - right.annee;
  }
  return left.numero_semaine - right.numero_semaine;
};

const incrementWeekYear = ({ annee, numero_semaine }) => {
  const maxWeeks = getIsoWeeksInYear(annee);
  if (numero_semaine < maxWeeks) {
    return { annee, numero_semaine: numero_semaine + 1 };
  }
  return { annee: annee + 1, numero_semaine: 1 };
};

const buildWeekRange = (start, end) => {
  const weeks = [];
  let current = { ...start };

  while (compareWeekYear(current, end) <= 0) {
    weeks.push(current);
    current = incrementWeekYear(current);
  }

  return weeks;
};

const sanitizeRangeFilters = (inputFilters) => {
  const CURRENT_WEEK_INFO = getCurrentIsoWeekInfo();

  const parsedStartYear = Number.isFinite(Number(inputFilters.start_annee))
    ? parseInt(inputFilters.start_annee, 10)
    : CURRENT_WEEK_INFO.year;
  const start_annee = Math.min(2100, Math.max(2000, parsedStartYear));

  const parsedEndYear = Number.isFinite(Number(inputFilters.end_annee))
    ? parseInt(inputFilters.end_annee, 10)
    : CURRENT_WEEK_INFO.year;
  const end_annee = Math.min(2100, Math.max(2000, parsedEndYear));

  const startMaxWeeks = getIsoWeeksInYear(start_annee);
  const endMaxWeeks = getIsoWeeksInYear(end_annee);

  const parsedStartWeek = Number.isFinite(Number(inputFilters.start_numero_semaine))
    ? parseInt(inputFilters.start_numero_semaine, 10)
    : CURRENT_WEEK_INFO.week;
  const start_numero_semaine = Math.min(startMaxWeeks, Math.max(1, parsedStartWeek));

  const parsedEndWeek = Number.isFinite(Number(inputFilters.end_numero_semaine))
    ? parseInt(inputFilters.end_numero_semaine, 10)
    : CURRENT_WEEK_INFO.week;
  const end_numero_semaine = Math.min(endMaxWeeks, Math.max(1, parsedEndWeek));

  const start = { annee: start_annee, numero_semaine: start_numero_semaine };
  const end = { annee: end_annee, numero_semaine: end_numero_semaine };

  if (compareWeekYear(start, end) <= 0) {
    return {
      start_annee,
      start_numero_semaine,
      end_annee,
      end_numero_semaine,
    };
  }

  return {
    start_annee: end_annee,
    start_numero_semaine: end_numero_semaine,
    end_annee: start_annee,
    end_numero_semaine: start_numero_semaine,
  };
};

const formatWeekYearLabel = ({ annee, numero_semaine }) => `S${numero_semaine}-${annee}`;

const buildStatsRows = (pointages, rangeLabel) => {
  const totalJours = pointages.reduce((sum, item) => (
    sum + calculateDays(item.date_debut, item.periode_debut, item.date_fin, item.periode_fin)
  ), 0);

  const utilisateursMap = {};
  const projetsMap = {};

  pointages.forEach((item) => {
    const jours = calculateDays(item.date_debut, item.periode_debut, item.date_fin, item.periode_fin);

    const utilisateurNom = item.utilisateur?.nom || 'N/A';
    if (!utilisateursMap[utilisateurNom]) {
      utilisateursMap[utilisateurNom] = { jours: 0, pointages: 0 };
    }
    utilisateursMap[utilisateurNom].jours += jours;
    utilisateursMap[utilisateurNom].pointages += 1;

    const projetNom = item.projet?.nom || 'N/A';
    const codePointage = item.projet?.code_pointage?.code || 'N/A';
    const projetKey = `${projetNom}__${codePointage}`;
    if (!projetsMap[projetKey]) {
      projetsMap[projetKey] = {
        nom: projetNom,
        code: codePointage,
        jours: 0,
        pointages: 0,
      };
    }
    projetsMap[projetKey].jours += jours;
    projetsMap[projetKey].pointages += 1;
  });

  const utilisateursRows = Object.entries(utilisateursMap)
    .map(([nom, values]) => [nom, Number(values.jours.toFixed(2)), values.pointages])
    .sort((left, right) => right[1] - left[1]);

  const projetsRows = Object.values(projetsMap)
    .map((projet) => [projet.nom, projet.code, Number(projet.jours.toFixed(2)), projet.pointages])
    .sort((left, right) => right[2] - left[2]);

  return [
    ['Synthèse export'],
    ['Période', rangeLabel],
    ['Pointages exportés', pointages.length],
    ['Total jours', Number(totalJours.toFixed(2))],
    ['Utilisateurs uniques', Object.keys(utilisateursMap).length],
    ['Projets uniques', Object.keys(projetsMap).length],
    [],
    ['Répartition par utilisateur'],
    ['Utilisateur', 'Jours', 'Pointages'],
    ...utilisateursRows,
    [],
    ['Répartition par projet'],
    ['Projet', 'Code Pointage', 'Jours', 'Pointages'],
    ...projetsRows,
  ];
};

function ExportExcel() {
  const CURRENT_WEEK_INFO = getCurrentIsoWeekInfo();
  const [filters, setFilters] = useState({
    start_annee: CURRENT_WEEK_INFO.year,
    start_numero_semaine: CURRENT_WEEK_INFO.week,
    end_annee: CURRENT_WEEK_INFO.year,
    end_numero_semaine: CURRENT_WEEK_INFO.week,
  });
  const [pointages, setPointages] = useState([]);
  const [selectedColumns, setSelectedColumns] = useState(getDefaultSelectedColumns);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const loadPointages = useCallback(async (filterParams) => {
    try {
      setLoading(true);
      const start = {
        annee: filterParams.start_annee,
        numero_semaine: filterParams.start_numero_semaine,
      };
      const end = {
        annee: filterParams.end_annee,
        numero_semaine: filterParams.end_numero_semaine,
      };

      const weeksToLoad = buildWeekRange(start, end);
      const responses = await Promise.all(
        weeksToLoad.map((week) => pointageAPI.getAll({
          annee: week.annee,
          numero_semaine: week.numero_semaine,
        })),
      );

      const merged = responses.flatMap((response) => response.data || []);
      const uniquePointagesMap = new Map();
      merged.forEach((item) => {
        uniquePointagesMap.set(item.id, item);
      });

      const sortedPointages = Array.from(uniquePointagesMap.values()).sort((left, right) => {
        if (left.annee !== right.annee) return left.annee - right.annee;
        if (left.numero_semaine !== right.numero_semaine) return left.numero_semaine - right.numero_semaine;
        if (left.utilisateur?.nom !== right.utilisateur?.nom) {
          return (left.utilisateur?.nom || '').localeCompare(right.utilisateur?.nom || '');
        }
        return left.id - right.id;
      });

      setPointages(sortedPointages);
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
    setFilters(sanitizeRangeFilters(nextFilters));
  };

  const handleToggleColumn = (columnId) => {
    setSelectedColumns((prev) => ({
      ...prev,
      [columnId]: !prev[columnId],
    }));
  };

  const handleExportExcel = () => {
    if (pointages.length === 0) {
      setError('Aucun pointage à exporter pour cette période');
      return;
    }

    const activeColumns = getActiveColumns(selectedColumns);
    if (activeColumns.length === 0) {
      setError('Sélectionnez au moins une colonne à exporter');
      return;
    }

    try {
      setExporting(true);

      // Préparer les données pour Excel
      const excelData = pointages.map((item) => {
        const row = {};
        activeColumns.forEach((column) => {
          row[column.label] = column.getValue(item);
        });
        return row;
      });

      // Créer le workbook et la feuille
      const wb = XLSX.utils.book_new();
      const pointagesSheet = XLSX.utils.json_to_sheet(excelData);

      // Ajuster la largeur des colonnes
      pointagesSheet['!cols'] = activeColumns.map((column) => ({ wch: column.width }));

      // Ajouter la feuille de pointages au workbook
      XLSX.utils.book_append_sheet(wb, pointagesSheet, 'Pointages');

      const statsRangeLabel = `${formatWeekYearLabel({
        annee: filters.start_annee,
        numero_semaine: filters.start_numero_semaine,
      })} à ${formatWeekYearLabel({
        annee: filters.end_annee,
        numero_semaine: filters.end_numero_semaine,
      })}`;
      const statsRows = buildStatsRows(pointages, statsRangeLabel);
      const statsSheet = XLSX.utils.aoa_to_sheet(statsRows);
      statsSheet['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 12 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, statsSheet, 'Stats');

      // Générer et télécharger le fichier
      const fileName = `pointages_${filters.start_annee}_S${filters.start_numero_semaine}_a_${filters.end_annee}_S${filters.end_numero_semaine}.xlsx`;
      XLSX.writeFile(wb, fileName);

      setError('');
    } catch (err) {
      setError('Erreur lors de l\'export Excel');
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

  const startWeekRange = getIsoWeekDateRange(filters.start_annee, filters.start_numero_semaine);
  const endWeekRange = getIsoWeekDateRange(filters.end_annee, filters.end_numero_semaine);
  const formatFrenchShortDate = (date) => new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(date);
  const selectedWeekLabel = `Du lundi ${formatFrenchShortDate(startWeekRange.monday)} ${filters.start_annee} au vendredi ${formatFrenchShortDate(endWeekRange.friday)} ${filters.end_annee}`;
  const selectedColumnCount = EXPORT_COLUMNS.filter((column) => selectedColumns[column.id]).length;
  const previewColumns = getActiveColumns(selectedColumns);

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
                <Form.Label>Année début</Form.Label>
                <Form.Control
                  type="number"
                  name="start_annee"
                  value={Number.isFinite(filters.start_annee) ? filters.start_annee : ''}
                  onChange={handleFilterChange}
                  min="2000"
                  max="2100"
                />
              </Form.Group>
            </Col>
            <Col md={3}>
              <Form.Group>
                <Form.Label>Semaine début</Form.Label>
                <Form.Control
                  type="number"
                  name="start_numero_semaine"
                  value={Number.isFinite(filters.start_numero_semaine) ? filters.start_numero_semaine : ''}
                  onChange={handleFilterChange}
                  min="1"
                  max="53"
                />
              </Form.Group>
            </Col>
            <Col md={3}>
              <Form.Group>
                <Form.Label>Année fin</Form.Label>
                <Form.Control
                  type="number"
                  name="end_annee"
                  value={Number.isFinite(filters.end_annee) ? filters.end_annee : ''}
                  onChange={handleFilterChange}
                  min="2000"
                  max="2100"
                />
              </Form.Group>
            </Col>
            <Col md={3}>
              <Form.Group>
                <Form.Label>Semaine fin</Form.Label>
                <Form.Control
                  type="number"
                  name="end_numero_semaine"
                  value={Number.isFinite(filters.end_numero_semaine) ? filters.end_numero_semaine : ''}
                  onChange={handleFilterChange}
                  min="1"
                  max="53"
                />
              </Form.Group>
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
        <Card.Header>
          <h5 className="mb-0">Colonnes à exporter</h5>
        </Card.Header>
        <Card.Body>
          <Row>
            {EXPORT_COLUMNS.map((column) => (
              <Col key={column.id} md={4} className="mb-2">
                <Form.Check
                  type="checkbox"
                  id={`export-col-${column.id}`}
                  label={column.label}
                  checked={!!selectedColumns[column.id]}
                  onChange={() => handleToggleColumn(column.id)}
                />
              </Col>
            ))}
          </Row>
          <div className="text-muted mt-2">
            {selectedColumnCount} colonne(s) sélectionnée(s)
          </div>
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
            <Alert variant="info">Aucun pointage trouvé pour la période sélectionnée</Alert>
          ) : (
            <>
              <p className="mb-3">
                <strong>{pointages.length}</strong>
                {' '}
                pointage(s) trouvé(s) de
                {' '}
                {formatWeekYearLabel({ annee: filters.start_annee, numero_semaine: filters.start_numero_semaine })}
                {' '}
                à
                {' '}
                {formatWeekYearLabel({ annee: filters.end_annee, numero_semaine: filters.end_numero_semaine })}
              </p>
              <Table striped bordered hover responsive>
                <thead>
                  <tr>
                    {previewColumns.map((column) => (
                      <th key={column.id} className="text-center align-middle">{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pointages.slice(0, 10).map((item) => (
                    <tr key={item.id}>
                      {previewColumns.map((column) => {
                        const value = column.getValue(item);
                        return (
                          <td key={`${item.id}-${column.id}`}>
                            {value === '' ? <span className="text-muted">—</span> : value}
                          </td>
                        );
                      })}
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
