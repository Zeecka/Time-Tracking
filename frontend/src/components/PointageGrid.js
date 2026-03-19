import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Table, Button, Modal, Form, Alert, Row, Col } from 'react-bootstrap';
import { Link, useSearchParams } from 'react-router-dom';
import Select from 'react-select';
import { pointageAPI, utilisateurAPI, projetAPI } from '../services/api';
import './PointageGrid.css';

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

const getIsoWeekNumber = (date) => {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  return Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
};

const getIsoWeeksInYear = (year) => getIsoWeekNumber(new Date(Date.UTC(year, 11, 28)));

const parseOptionalInteger = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
};

const sanitizeWeekYear = (year, week) => {
  const parsedYear = parseOptionalInteger(year) ?? CURRENT_WEEK_INFO.year;
  const safeYear = Math.min(2100, Math.max(2000, parsedYear));
  const maxWeeks = getIsoWeeksInYear(safeYear);
  const parsedWeek = parseOptionalInteger(week) ?? CURRENT_WEEK_INFO.week;
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

const formatFrenchShortDate = (date) => new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
}).format(date);

const formatDateDDMMYYYY = (dateString) => {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-');
  return `${day}/${month}/${year}`;
};

const getDayName = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString + 'T00:00:00');
  const days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  return days[date.getDay()];
};

const calculateDays = (dateDebut, periodeDebut, dateFin, periodeFin) => {
  if (!dateDebut || !dateFin) return 0;

  const debut = new Date(dateDebut);
  const fin = new Date(dateFin);
  const diffTime = fin - debut;
  const diffDays = diffTime / (1000 * 60 * 60 * 24);

  let days = diffDays;

  // Ajuster selon les périodes
  if (dateDebut === dateFin) {
    // Même jour
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
    // Jours différents - compter les jours complets + ajustements
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

const CURRENT_WEEK_INFO = getCurrentIsoWeekInfo();
const PERIODES_DEBUT = [
  { value: 'matin', label: 'Matin' },
  { value: 'midi', label: 'Midi' },
];
const PERIODES_FIN = [
  { value: 'midi', label: 'Midi' },
  { value: 'soir', label: 'Soir' },
];
const PERIODE_LABELS = {
  matin: 'Matin',
  midi: 'Midi',
  soir: 'Soir',
  journee: 'Journée',
  apres_midi: 'Après-midi',
};
const PERIODE_ORDER = { matin: 0, midi: 1, soir: 2 };
const PERIODE_LEGACY_START_MAP = { journee: 'matin', apres_midi: 'midi' };
const PERIODE_LEGACY_END_MAP = { journee: 'soir', apres_midi: 'midi' };
const EXPECTED_WEEK_DAYS = 5;

const normalizePeriodeValue = (value, isStart) => {
  if (isStart && PERIODE_LEGACY_START_MAP[value]) {
    return PERIODE_LEGACY_START_MAP[value];
  }
  if (!isStart && PERIODE_LEGACY_END_MAP[value]) {
    return PERIODE_LEGACY_END_MAP[value];
  }
  return value;
};

const getMotifStyle = (couleur, motif) => {
  const baseColor = couleur || '#6c757d';
  if (motif === 'raye') {
    return {
      backgroundColor: baseColor,
      backgroundImage: `repeating-linear-gradient(45deg, ${baseColor} 0px, ${baseColor} 7px, rgba(255, 255, 255, 0.45) 7px, rgba(255, 255, 255, 0.45) 12px)`,
    };
  }
  if (motif === 'pointille') {
    return {
      backgroundColor: baseColor,
      backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.7) 18%, transparent 20%)`,
      backgroundSize: '7px 7px',
    };
  }
  return { backgroundColor: baseColor };
};

const formatDayValue = (value) => {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function PointageGrid({ viewMode = 'table' }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialYear = searchParams.get('year');
  const initialWeek = searchParams.get('week');
  const initialFilters = sanitizeWeekYear(initialYear, initialWeek);

  const [pointages, setPointages] = useState([]);
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [projets, setProjets] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    date_debut: '',
    periode_debut: 'matin',
    date_fin: '',
    periode_fin: 'soir',
    numero_semaine: CURRENT_WEEK_INFO.week,
    annee: CURRENT_WEEK_INFO.year,
    utilisateur_id: '',
    projet_id: '',
    note: '',
  });
  const [filters, setFilters] = useState({
    annee: initialFilters.annee,
    numero_semaine: initialFilters.numero_semaine,
  });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [projectSearchText, setProjectSearchText] = useState('');
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictingPointages, setConflictingPointages] = useState([]);
  const [pendingFormData, setPendingFormData] = useState(null);
  const [pendingEditingItem, setPendingEditingItem] = useState(null);
  const [ganttResizeState, setGanttResizeState] = useState(null);
  const ganttResizeStateRef = useRef(null);
  const suppressGanttClickUntilRef = useRef(0);
  const importCsvInputRef = useRef(null);
  const isTableView = viewMode === 'table';
  const isGanttView = viewMode === 'gantt';

  useEffect(() => {
    ganttResizeStateRef.current = ganttResizeState;
  }, [ganttResizeState]);

  const loadPointages = useCallback(async (filterParams) => {
    try {
      setLoading(true);
      const response = await pointageAPI.getAll(filterParams);
      setPointages(response.data);
    } catch (err) {
      setError('Erreur lors du chargement des pointages');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUtilisateurs = useCallback(async () => {
    try {
      const response = await utilisateurAPI.getAll();
      setUtilisateurs(response.data);
    } catch (err) {
      console.error('Erreur lors du chargement des utilisateurs', err);
    }
  }, []);

  const loadProjets = useCallback(async () => {
    try {
      const response = await projetAPI.getAll();
      setProjets(response.data);
    } catch (err) {
      console.error('Erreur lors du chargement des projets', err);
    }
  }, []);

  useEffect(() => {
    loadPointages(filters);
  }, [filters, loadPointages]);

  useEffect(() => {
    loadUtilisateurs();
    loadProjets();
  }, [loadUtilisateurs, loadProjets]);

  useEffect(() => {
    const year = searchParams.get('year');
    const week = searchParams.get('week');
    const next = sanitizeWeekYear(year, week);

    if (next.annee !== filters.annee || next.numero_semaine !== filters.numero_semaine) {
      setFilters(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get('year'), searchParams.get('week')]);

  useEffect(() => {
    const currentYear = searchParams.get('year');
    const currentWeek = searchParams.get('week');
    const targetYear = String(filters.annee);
    const targetWeek = String(filters.numero_semaine);

    if (currentYear !== targetYear || currentWeek !== targetWeek) {
      setSearchParams({ year: targetYear, week: targetWeek }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.annee, filters.numero_semaine]);

  const selectedWeekRange = useMemo(() => {
    if (!Number.isFinite(filters.annee) || !Number.isFinite(filters.numero_semaine)) {
      return getIsoWeekDateRange(CURRENT_WEEK_INFO.year, CURRENT_WEEK_INFO.week);
    }
    return getIsoWeekDateRange(filters.annee, filters.numero_semaine);
  }, [filters.annee, filters.numero_semaine]);

  const startOfWeekUtc = useMemo(
    () => new Date(`${selectedWeekRange.date_debut}T00:00:00Z`),
    [selectedWeekRange.date_debut]
  );
  const endOfWeekUtc = useMemo(
    () => new Date(`${selectedWeekRange.date_fin}T23:59:59Z`),
    [selectedWeekRange.date_fin]
  );

  const handleShowModal = (item = null) => {
    const normalizePeriodeDebut = (value) => {
      if (value === 'journee') return 'matin';
      if (value === 'apres_midi') return 'midi';
      return value === 'midi' ? 'midi' : 'matin';
    };

    const normalizePeriodeFin = (value) => {
      if (value === 'journee') return 'soir';
      if (value === 'apres_midi') return 'midi';
      return value === 'midi' ? 'midi' : 'soir';
    };

    if (item) {
      setEditingItem(item);
      const selectedProjet = projets.find((p) => p.id === item.projet_id);
      setProjectSearchText(selectedProjet ? selectedProjet.nom : '');
      setFormData({
        date_debut: item.date_debut,
        periode_debut: normalizePeriodeDebut(item.periode_debut),
        date_fin: item.date_fin,
        periode_fin: normalizePeriodeFin(item.periode_fin),
        numero_semaine: item.numero_semaine,
        annee: item.annee,
        utilisateur_id: item.utilisateur_id,
        projet_id: item.projet_id,
        note: item.note || '',
      });
    } else {
      setEditingItem(null);
      setProjectSearchText('');
      const selectedYear = parseInt(filters.annee, 10) || CURRENT_WEEK_INFO.year;
      const selectedWeek = parseInt(filters.numero_semaine, 10) || CURRENT_WEEK_INFO.week;
      const firstAvailable = findFirstAvailableSlot('', selectedYear, selectedWeek);

      setFormData({
        date_debut: firstAvailable.date,
        periode_debut: firstAvailable.periode,
        date_fin: firstAvailable.date,
        periode_fin: 'soir',
        numero_semaine: selectedWeek,
        annee: selectedYear,
        utilisateur_id: '',
        projet_id: '',
        note: '',
      });
    }
    setShowModal(true);
    setError('');
  };

  const handleCloseModal = () => {
    const dateRange = getIsoWeekDateRange(CURRENT_WEEK_INFO.year, CURRENT_WEEK_INFO.week);

    setShowModal(false);
    setEditingItem(null);
    setProjectSearchText('');
    setFormData({
      date_debut: dateRange.date_debut,
      periode_debut: 'matin',
      date_fin: dateRange.date_debut,
      periode_fin: 'soir',
      numero_semaine: CURRENT_WEEK_INFO.week,
      annee: CURRENT_WEEK_INFO.year,
      utilisateur_id: '',
      projet_id: '',
      note: '',
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const data = {
      ...formData,
      numero_semaine: parseInt(formData.numero_semaine),
      annee: parseInt(formData.annee),
      utilisateur_id: parseInt(formData.utilisateur_id),
      projet_id: parseInt(formData.projet_id),
    };

    // Vérifier les chevauchements avant la sauvegarde
    const conflicts = findOverlappingPointages(
      data.utilisateur_id,
      data.date_debut,
      data.periode_debut,
      data.date_fin,
      data.periode_fin,
      editingItem?.id
    );

    if (conflicts.length > 0) {
      // Il y a des conflits, demander confirmation
      setPendingFormData(data);
      setPendingEditingItem(editingItem);
      setConflictingPointages(conflicts);
      setShowConflictModal(true);
    } else {
      // Pas de conflit, sauvegarder directement
      try {
        await savePointage(data, editingItem);
      } catch (err) {
        setError(err.response?.data?.error || 'Erreur lors de la sauvegarde');
      }
    }
  };

  const savePointage = async (data, editItem) => {
    if (editItem) {
      await pointageAPI.update(editItem.id, data);
    } else {
      await pointageAPI.create(data);
    }
    handleCloseModal();
    await loadPointages(filters);
  };

  const handleDeleteClick = (item) => {
    setItemToDelete(item);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await pointageAPI.delete(itemToDelete.id);
      setShowDeleteModal(false);
      setItemToDelete(null);
      loadPointages(filters);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la suppression');
    }
  };

  const getDateAndPeriodFromSlot = (slotIndex) => {
    const dayIndex = Math.floor(slotIndex / 2);
    const isAfternoon = slotIndex % 2 === 1;

    const date = new Date(startOfWeekUtc);
    date.setUTCDate(startOfWeekUtc.getUTCDate() + dayIndex);
    const dateString = date.toISOString().split('T')[0];

    return {
      date: dateString,
      periode: isAfternoon ? 'midi' : 'matin',
    };
  };

  const getDateAndPeriodFromBoundary = useCallback((boundaryIndex, isStart) => {
    const safeBoundary = clamp(boundaryIndex, isStart ? 0 : 1, isStart ? 9 : 10);

    if (isStart) {
      const dayIndex = Math.floor(safeBoundary / 2);
      const isAfternoon = safeBoundary % 2 === 1;
      const date = new Date(startOfWeekUtc);
      date.setUTCDate(startOfWeekUtc.getUTCDate() + dayIndex);

      return {
        date: date.toISOString().split('T')[0],
        periode: isAfternoon ? 'midi' : 'matin',
      };
    }

    const adjustedIndex = safeBoundary - 1;
    const dayIndex = Math.floor(adjustedIndex / 2);
    const isMiddayBoundary = adjustedIndex % 2 === 0;
    const date = new Date(startOfWeekUtc);
    date.setUTCDate(startOfWeekUtc.getUTCDate() + dayIndex);

    return {
      date: date.toISOString().split('T')[0],
      periode: isMiddayBoundary ? 'midi' : 'soir',
    };
  }, [startOfWeekUtc]);

  const findOverlappingPointages = useCallback((utilisateurId, dateDebut, periodeDebut, dateFin, periodeFin, excludeId = null) => {
    return pointages.filter((p) => {
      if (excludeId && p.id === excludeId) return false;
      if (p.utilisateur_id !== utilisateurId) return false;

      const newStart = new Date(dateDebut + 'T00:00:00Z');
      const newEnd = new Date(dateFin + 'T00:00:00Z');
      const newStartPeriode = normalizePeriodeValue(periodeDebut, true);
      const newEndPeriode = normalizePeriodeValue(periodeFin, false);

      const pStart = new Date(p.date_debut + 'T00:00:00Z');
      const pEnd = new Date(p.date_fin + 'T00:00:00Z');
      const pStartPeriode = normalizePeriodeValue(p.periode_debut, true);
      const pEndPeriode = normalizePeriodeValue(p.periode_fin, false);

      if (newEnd < pStart || newStart > pEnd) return false;

      if (newEnd.getTime() === pStart.getTime()) {
        if (newEndPeriode === 'midi' && pStartPeriode === 'midi') return false;
        if (newEndPeriode === 'midi' && pStartPeriode === 'matin') return false;
      }

      if (newStart.getTime() === pEnd.getTime()) {
        if (newStartPeriode === 'midi' && pEndPeriode === 'midi') return false;
      }

      if (dateDebut === dateFin && p.date_debut === p.date_fin && dateDebut === p.date_debut) {
        if (newStartPeriode === 'matin' && newEndPeriode === 'midi' && pStartPeriode === 'midi' && pEndPeriode === 'soir') {
          return false;
        }
        if (newStartPeriode === 'midi' && newEndPeriode === 'soir' && pStartPeriode === 'matin' && pEndPeriode === 'midi') {
          return false;
        }
      }

      return true;
    });
  }, [pointages]);

  const startGanttResize = (event, bar, edge) => {
    event.preventDefault();
    event.stopPropagation();
    suppressGanttClickUntilRef.current = Date.now() + 250;

    const timelineCell = event.currentTarget.closest('.gantt-timeline-cell');
    if (!timelineCell) {
      return;
    }

    const rect = timelineCell.getBoundingClientRect();
    setGanttResizeState({
      pointageId: bar.id,
      edge,
      startSlot: bar.startSlot,
      endSlot: bar.endSlot,
      currentStartSlot: bar.startSlot,
      currentEndSlot: bar.endSlot,
      timelineLeft: rect.left,
      timelineWidth: rect.width,
    });
  };

  useEffect(() => {
    if (!ganttResizeState) {
      return undefined;
    }

    const commitGanttResize = async (resizeData) => {
      if (!resizeData || resizeData.currentStartSlot >= resizeData.currentEndSlot) {
        return;
      }

      const targetPointage = pointages.find((item) => item.id === resizeData.pointageId);
      if (!targetPointage) {
        return;
      }

      const nextStart = getDateAndPeriodFromBoundary(resizeData.currentStartSlot, true);
      const nextEnd = getDateAndPeriodFromBoundary(resizeData.currentEndSlot, false);
      const hasChanged = (
        nextStart.date !== targetPointage.date_debut
        || nextStart.periode !== normalizePeriodeValue(targetPointage.periode_debut, true)
        || nextEnd.date !== targetPointage.date_fin
        || nextEnd.periode !== normalizePeriodeValue(targetPointage.periode_fin, false)
      );

      if (!hasChanged) {
        return;
      }

      const conflicts = findOverlappingPointages(
        targetPointage.utilisateur_id,
        nextStart.date,
        nextStart.periode,
        nextEnd.date,
        nextEnd.periode,
        targetPointage.id
      );

      if (conflicts.length > 0) {
        setError('Impossible de redimensionner: la nouvelle période chevauche un autre pointage.');
        return;
      }

      try {
        await pointageAPI.update(targetPointage.id, {
          date_debut: nextStart.date,
          periode_debut: nextStart.periode,
          date_fin: nextEnd.date,
          periode_fin: nextEnd.periode,
          numero_semaine: targetPointage.numero_semaine,
          annee: targetPointage.annee,
          utilisateur_id: targetPointage.utilisateur_id,
          projet_id: targetPointage.projet_id,
          note: targetPointage.note || '',
        });
        await loadPointages(filters);
      } catch (err) {
        setError(err.response?.data?.error || 'Erreur lors du redimensionnement du pointage');
      }
    };

    const handleMouseMove = (event) => {
      setGanttResizeState((prev) => {
        if (!prev) {
          return prev;
        }

        const ratio = (event.clientX - prev.timelineLeft) / prev.timelineWidth;
        const normalizedRatio = clamp(ratio, 0, 1);

        if (prev.edge === 'start') {
          const rawStartSlot = Math.floor(normalizedRatio * 10);
          const nextStartSlot = clamp(rawStartSlot, 0, prev.currentEndSlot - 1);
          return { ...prev, currentStartSlot: nextStartSlot };
        }

        const rawEndSlot = Math.ceil(normalizedRatio * 10);
        const nextEndSlot = clamp(rawEndSlot, prev.currentStartSlot + 1, 10);
        return { ...prev, currentEndSlot: nextEndSlot };
      });
    };

    const handleMouseUp = () => {
      const currentResizeState = ganttResizeStateRef.current;
      suppressGanttClickUntilRef.current = Date.now() + 250;
      setGanttResizeState(null);

      if (!currentResizeState) {
        return;
      }

      commitGanttResize(currentResizeState);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [filters, findOverlappingPointages, ganttResizeState, getDateAndPeriodFromBoundary, loadPointages, pointages]);

  const handleSlotClick = (utilisateurId, projetId, slotIndex) => {
    const slotData = getDateAndPeriodFromSlot(slotIndex);

    // Ouvrir directement la modale de création sans vérification
    openSlotCreation({
      utilisateur_id: utilisateurId,
      projet_id: projetId,
      date_debut: slotData.date,
      periode_debut: slotData.periode,
      date_fin: slotData.date,
      periode_fin: slotData.periode === 'matin' ? 'midi' : 'soir',
    });
  };

  const openSlotCreation = (slotData) => {
    setEditingItem(null);
    const selectedProjet = projets.find((p) => p.id === slotData.projet_id);
    setProjectSearchText(selectedProjet ? selectedProjet.nom : '');
    setFormData({
      date_debut: slotData.date_debut,
      periode_debut: slotData.periode_debut,
      date_fin: slotData.date_fin,
      periode_fin: slotData.periode_fin,
      numero_semaine: filters.numero_semaine,
      annee: filters.annee,
      utilisateur_id: slotData.utilisateur_id,
      projet_id: slotData.projet_id || '',
    });
    setShowModal(true);
    setError('');
  };

  const handleConfirmConflictAndCreate = async () => {
    if (!pendingFormData) return;

    try {
      // Supprimer les pointages en conflit
      for (const conflict of conflictingPointages) {
        await pointageAPI.delete(conflict.id);
      }

      // Recharger pour avoir les données à jour
      await loadPointages(filters);

      // Sauvegarder le nouveau pointage
      await savePointage(pendingFormData, pendingEditingItem);

      // Nettoyer l'état seulement si tout s'est bien passé
      setShowConflictModal(false);
      setConflictingPointages([]);
      setPendingFormData(null);
      setPendingEditingItem(null);
    } catch (err) {
      console.error('Erreur lors de la résolution des conflits:', err);
      const errorMsg = err.response?.data?.error || err.message || 'Erreur lors de la suppression des conflits';
      setError(errorMsg);
      // Ne pas fermer la modale pour que l'utilisateur voie l'erreur et puisse réessayer
    }
  };

  const handleCancelConflict = () => {
    setShowConflictModal(false);
    setConflictingPointages([]);
    setPendingFormData(null);
    setPendingEditingItem(null);
    setError('');
  };

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

  const handleDateDebutChange = (value) => {
    setFormData((prev) => {
      const next = { ...prev, date_debut: value };
      if (next.date_fin && next.date_fin < next.date_debut) {
        next.date_fin = next.date_debut;
        next.periode_fin = 'soir';
      }
      if (next.date_debut === next.date_fin && PERIODE_ORDER[next.periode_fin] <= PERIODE_ORDER[next.periode_debut]) {
        next.periode_fin = 'soir';
      }
      return next;
    });
  };

  const handleDateFinChange = (value) => {
    setFormData((prev) => {
      const next = { ...prev, date_fin: value };
      if (next.date_debut === next.date_fin && PERIODE_ORDER[next.periode_fin] <= PERIODE_ORDER[next.periode_debut]) {
        next.periode_fin = next.periode_debut === 'midi' ? 'soir' : 'midi';
      }
      return next;
    });
  };

  const handlePeriodeDebutChange = (value) => {
    setFormData((prev) => {
      const next = { ...prev, periode_debut: value };
      if (next.date_fin && next.date_fin < next.date_debut) {
        next.date_fin = next.date_debut;
        next.periode_fin = 'soir';
      }
      if (next.date_debut === next.date_fin && PERIODE_ORDER[next.periode_fin] <= PERIODE_ORDER[value]) {
        next.periode_fin = 'soir';
      }
      return next;
    });
  };

  const handlePeriodeFinChange = (value) => {
    setFormData((prev) => ({ ...prev, periode_fin: value }));
  };

  const findFirstAvailableSlot = (utilisateurId, weekYear, weekNumber) => {
    if (!utilisateurId) {
      const dateRange = getIsoWeekDateRange(weekYear, weekNumber);
      return { date: dateRange.date_debut, periode: 'matin' };
    }

    // Get all pointages for this user in the selected week
    const userPointages = pointages.filter(
      (p) => p.utilisateur_id === parseInt(utilisateurId) &&
             p.annee === weekYear &&
             p.numero_semaine === weekNumber
    );

    if (userPointages.length === 0) {
      const dateRange = getIsoWeekDateRange(weekYear, weekNumber);
      return { date: dateRange.date_debut, periode: 'matin' };
    }

    // Build a map of occupied slots
    const occupiedSlots = new Set();
    userPointages.forEach((p) => {
      const start = new Date(p.date_debut + 'T00:00:00Z');
      const end = new Date(p.date_fin + 'T00:00:00Z');
      const startPeriode = normalizePeriodeValue(p.periode_debut, true);
      const endPeriode = normalizePeriodeValue(p.periode_fin, false);

      const daysCount = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
      for (let i = 0; i < daysCount; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];

        if (dateStr === p.date_debut && dateStr === p.date_fin) {
          // Same day
          if (startPeriode === 'matin' && endPeriode === 'soir') {
            occupiedSlots.add(`${dateStr}-matin`);
            occupiedSlots.add(`${dateStr}-midi`);
          } else if (startPeriode === 'matin' && endPeriode === 'midi') {
            occupiedSlots.add(`${dateStr}-matin`);
          } else if (startPeriode === 'midi' && endPeriode === 'soir') {
            occupiedSlots.add(`${dateStr}-midi`);
          } else {
            occupiedSlots.add(`${dateStr}-matin`);
            occupiedSlots.add(`${dateStr}-midi`);
          }
        } else if (dateStr === p.date_debut) {
          // First day
          if (startPeriode === 'matin') {
            occupiedSlots.add(`${dateStr}-matin`);
            occupiedSlots.add(`${dateStr}-midi`);
          } else {
            occupiedSlots.add(`${dateStr}-midi`);
          }
        } else if (dateStr === p.date_fin) {
          // Last day
          if (endPeriode === 'soir') {
            occupiedSlots.add(`${dateStr}-matin`);
            occupiedSlots.add(`${dateStr}-midi`);
          } else {
            occupiedSlots.add(`${dateStr}-matin`);
          }
        } else {
          // Full day in between
          occupiedSlots.add(`${dateStr}-matin`);
          occupiedSlots.add(`${dateStr}-midi`);
        }
      }
    });

    // Find first available slot
    const dateRange = getIsoWeekDateRange(weekYear, weekNumber);
    const startDate = new Date(dateRange.date_debut + 'T00:00:00Z');
    const endDate = new Date(dateRange.date_fin + 'T00:00:00Z');

    const daysCount = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    for (let i = 0; i < daysCount; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];

      if (!occupiedSlots.has(`${dateStr}-matin`)) {
        return { date: dateStr, periode: 'matin' };
      }
      if (!occupiedSlots.has(`${dateStr}-midi`)) {
        return { date: dateStr, periode: 'midi' };
      }
    }

    // If no slot available, return first date
    return { date: dateRange.date_debut, periode: 'matin' };
  };

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortedPointages = () => {
    if (!sortColumn) return pointages;

    return [...pointages].sort((a, b) => {
      let aVal, bVal;

      switch (sortColumn) {
        case 'utilisateur':
          aVal = a.utilisateur?.nom || '';
          bVal = b.utilisateur?.nom || '';
          break;
        case 'projet':
          aVal = a.projet?.nom || '';
          bVal = b.projet?.nom || '';
          break;
        case 'date_debut':
          aVal = a.date_debut || '';
          bVal = b.date_debut || '';
          break;
        case 'periode_debut':
          aVal = PERIODE_ORDER[a.periode_debut] || 0;
          bVal = PERIODE_ORDER[b.periode_debut] || 0;
          break;
        case 'date_fin':
          aVal = a.date_fin || '';
          bVal = b.date_fin || '';
          break;
        case 'periode_fin':
          aVal = PERIODE_ORDER[a.periode_fin] || 0;
          bVal = PERIODE_ORDER[b.periode_fin] || 0;
          break;
        case 'jours':
          aVal = calculateDays(a.date_debut, a.periode_debut, a.date_fin, a.periode_fin);
          bVal = calculateDays(b.date_debut, b.periode_debut, b.date_fin, b.periode_fin);
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const renderSortIcon = (column) => {
    if (sortColumn !== column) return <i className="fas fa-sort ms-1 text-muted"></i>;
    return sortDirection === 'asc' ? <i className="fas fa-sort-up ms-1"></i> : <i className="fas fa-sort-down ms-1"></i>;
  };

  const selectedWeekLabel = `Lundi ${formatFrenchShortDate(selectedWeekRange.monday)} - Vendredi ${formatFrenchShortDate(selectedWeekRange.friday)}`;
  const weekQueryString = `?year=${filters.annee}&week=${filters.numero_semaine}`;
  const sortedPointages = getSortedPointages();
  const userMissingDaysMap = useMemo(() => {
    const pointedDaysByUser = pointages.reduce((acc, item) => {
      const userId = item.utilisateur_id ?? item.utilisateur?.id;
      if (!userId) {
        return acc;
      }

      const pointedDays = calculateDays(item.date_debut, item.periode_debut, item.date_fin, item.periode_fin);
      acc[userId] = (acc[userId] || 0) + pointedDays;
      return acc;
    }, {});

    return Object.entries(pointedDaysByUser).reduce((acc, [userId, pointedDays]) => {
      acc[userId] = Math.max(0, EXPECTED_WEEK_DAYS - pointedDays);
      return acc;
    }, {});
  }, [pointages]);

  const missingDaysSummary = useMemo(() => {
    return utilisateurs
      .map((user) => ({
        id: user.id,
        nom: user.nom || 'N/A',
        couleur: user.couleur || '#ccc',
        missingDays: userMissingDaysMap[user.id] ?? EXPECTED_WEEK_DAYS,
      }))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));
  }, [utilisateurs, userMissingDaysMap]);

  const ganttDays = Array.from({ length: 5 }, (_, index) => {
    const date = new Date(selectedWeekRange.monday);
    date.setUTCDate(selectedWeekRange.monday.getUTCDate() + index);
    return {
      label: new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' }).format(date),
      shortDate: new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(date),
    };
  });

  const ganttVisiblePointages = pointages.filter((item) => {
    if (!item?.date_debut || !item?.date_fin) {
      return false;
    }

    const itemStartUtc = new Date(`${item.date_debut}T00:00:00Z`);
    const itemEndUtc = new Date(`${item.date_fin}T23:59:59Z`);

    return itemEndUtc >= startOfWeekUtc && itemStartUtc <= endOfWeekUtc;
  });

  const getSlotIndex = (dateString, period, isEnd = false) => {
    const dateUtc = new Date(`${dateString}T00:00:00Z`);
    const dayDiff = Math.floor((dateUtc - startOfWeekUtc) / (1000 * 60 * 60 * 24));
    const clampedDay = Math.min(4, Math.max(0, dayDiff));
    const normalizedPeriod = normalizePeriodeValue(period, !isEnd);

    if (isEnd) {
      const endOffset = normalizedPeriod === 'midi' ? 1 : 2;
      return (clampedDay * 2) + endOffset;
    }

    const startOffset = normalizedPeriod === 'midi' ? 1 : 0;
    return (clampedDay * 2) + startOffset;
  };

  // Build Gantt rows: one row per (utilisateur, projet) pair, with multiple bars
  const ganttGroupMap = new Map();
  const ganttRowsGrouped = [];
  const ganttSortedItems = [...ganttVisiblePointages].sort((a, b) => {
    const userCmp = (a.utilisateur?.nom || '').localeCompare(b.utilisateur?.nom || '', 'fr', { sensitivity: 'base' });
    if (userCmp !== 0) return userCmp;
    return (a.projet?.nom || '').localeCompare(b.projet?.nom || '', 'fr', { sensitivity: 'base' });
  });

  for (const item of ganttSortedItems) {
    const userId = item.utilisateur?.id ?? null;
    const projetId = item.projet?.id ?? null;
    const key = `${userId}_${projetId}`;

    if (!ganttGroupMap.has(key)) {
      const row = {
        key,
        utilisateurId: userId,
        utilisateurNom: item.utilisateur?.nom || 'N/A',
        utilisateurCouleur: item.utilisateur?.couleur || '#ccc',
        projetId,
        projetNom: item.projet?.nom || 'N/A',
        projetCouleur: item.projet?.couleur || '#6c757d',
        projetMotif: item.projet?.motif || 'uni',
        bars: [],
      };
      ganttGroupMap.set(key, row);
      ganttRowsGrouped.push(row);
    }

    const row = ganttGroupMap.get(key);
    const startSlot = getSlotIndex(item.date_debut, item.periode_debut, false);
    const endSlot = getSlotIndex(item.date_fin, item.periode_fin, true);
    const clampedStart = Math.min(9, Math.max(0, startSlot));
    const clampedEnd = Math.min(10, Math.max(clampedStart + 1, endSlot));
    const span = clampedEnd - clampedStart;

    row.bars.push({
      id: item.id,
      pointage: item,
      startSlot: clampedStart,
      endSlot: clampedEnd,
      leftPercent: (clampedStart / 10) * 100,
      widthPercent: (span / 10) * 100,
    });
  }

  const ganttRows = ganttRowsGrouped;

  const isSameUtilisateurRow = (currentRow, previousRow) => {
    if (!currentRow || !previousRow) {
      return false;
    }

    if (currentRow.utilisateurId !== null && previousRow.utilisateurId !== null) {
      return currentRow.utilisateurId === previousRow.utilisateurId;
    }

    return currentRow.utilisateurNom === previousRow.utilisateurNom;
  };

  let utilisateurGroupIndex = -1;
  const ganttRowsWithDisplayState = ganttRows.map((row, index) => {
    const previousRow = index > 0 ? ganttRows[index - 1] : null;
    const hasSameUtilisateurAsPrevious = isSameUtilisateurRow(row, previousRow);

    if (!hasSameUtilisateurAsPrevious) {
      utilisateurGroupIndex += 1;
    }

    return {
      ...row,
      isNewUtilisateurGroup: index > 0 && !hasSameUtilisateurAsPrevious,
      isAltUserPairBackground: utilisateurGroupIndex % 2 === 0,
    };
  });

  const normalizedProjectSearch = projectSearchText.trim().toLowerCase();
  const filteredProjets = projets.filter((projet) => {
    if (!normalizedProjectSearch) {
      return true;
    }
    return projet.nom?.toLowerCase().includes(normalizedProjectSearch);
  });

  // React-select options
  const utilisateurOptions = utilisateurs.map((user) => ({
    value: user.id,
    label: user.nom,
  }));

  const projetOptions = filteredProjets.map((projet) => ({
    value: projet.id,
    label: projet.nom,
  }));

  // Custom styles for react-select
  const customSelectStyles = {
    control: (provided, state) => ({
      ...provided,
      backgroundColor: 'var(--rs-bg)',
      borderColor: state.isFocused ? 'var(--rs-focus-border)' : 'var(--rs-border)',
      boxShadow: state.isFocused ? '0 0 0 0.25rem var(--rs-focus-shadow)' : 'none',
      '&:hover': {
        borderColor: 'var(--rs-focus-border)',
      },
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
          ? 'var(--rs-option-hover)'
          : 'var(--rs-option-bg)',
      color: 'var(--rs-text)',
    }),
    singleValue: (provided) => ({
      ...provided,
      color: 'var(--rs-text)',
    }),
    placeholder: (provided) => ({
      ...provided,
      color: 'var(--rs-placeholder)',
    }),
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
      const response = await pointageAPI.exportCSV({
        annee: filters.annee,
        numero_semaine: filters.numero_semaine,
      });
      downloadBlob(response.data, `pointages_${filters.annee}_S${filters.numero_semaine}.csv`);
      setMessage('Export CSV des pointages terminé pour la semaine filtrée.');
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de l’export CSV');
    }
  };

  const handleImportCSVClick = () => {
    importCsvInputRef.current?.click();
  };

  const handleImportCSV = async (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const response = await pointageAPI.importCSV(file);
      const data = response.data || {};
      setMessage(
        `Import CSV pointages : ${data.created || 0} créé(s), ${(data.errors || []).length} erreur(s).`
      );
      await loadPointages(filters);
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
          <i className="fas fa-clock me-2" style={{ color: '#2ecc71' }}></i>
          {isGanttView ? 'Pointages - Vue Gantt' : 'Pointages - Vue Tableau'}
        </h2>
        <div className="d-flex gap-2 flex-wrap justify-content-end align-items-center">
          <Button variant="outline-primary" size="sm" onClick={handleImportCSVClick} className="d-inline-flex align-items-center">
            <i className="fas fa-file-import me-2"></i>
            Import CSV
          </Button>
          <Button variant="outline-success" size="sm" onClick={handleExportCSV} className="d-inline-flex align-items-center">
            <i className="fas fa-file-export me-2"></i>
            Export CSV
          </Button>
          <Button variant="outline-secondary" size="sm" as="a" href="/examples/pointages_exemple.csv" download className="d-inline-flex align-items-center">
            <i className="fas fa-download me-2"></i>
            CSV exemple
          </Button>
          <Button variant="primary" onClick={() => handleShowModal()} className="d-inline-flex align-items-center">
            <i className="fas fa-plus me-2"></i>
            Nouveau pointage
          </Button>
          <Form.Control
            ref={importCsvInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleImportCSV}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      <Row className="mb-3">
        <Col>
          <div className="d-flex gap-2">
            <Button
              as={Link}
              to={`/pointages/table${weekQueryString}`}
              variant={isTableView ? 'dark' : 'outline-secondary'}
              size="sm"
            >
              Vue tableau
            </Button>
            <Button
              as={Link}
              to={`/pointages/gantt${weekQueryString}`}
              variant={isGanttView ? 'dark' : 'outline-secondary'}
              size="sm"
            >
              Vue Gantt
            </Button>
          </div>
        </Col>
      </Row>

      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
      {message && <Alert variant="success" dismissible onClose={() => setMessage('')}>{message}</Alert>}

      {/* Filters */}
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
              placeholder="Toutes"
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

      <Row className="mb-3">
        <Col>
          <div className="d-flex flex-wrap align-items-center gap-2">
            <strong>Jours manquants :</strong>
            {missingDaysSummary.length > 0 ? (
              missingDaysSummary.map((user) => (
                <span key={user.id} className="badge bg-light text-dark border d-flex align-items-center gap-2">
                  <span
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      backgroundColor: user.couleur,
                      display: 'inline-block',
                    }}
                  />
                  {user.nom}: {formatDayValue(user.missingDays)} j
                </span>
              ))
            ) : (
              <span className="text-muted">Aucun utilisateur</span>
            )}
          </div>
        </Col>
      </Row>

      {loading ? (
        <p>Chargement...</p>
      ) : (
        <>
          {isGanttView && (
          <div className="gantt-view mb-3">
            <div className="gantt-header">
              <div className="gantt-resource-head">Ressource</div>
              <div className="gantt-timeline-head">
                {ganttDays.map((day, dayIndex) => (
                  <div key={`${day.shortDate}-${dayIndex}`} className="gantt-day-head">
                    <span>{day.label}</span>
                    <small>{day.shortDate}</small>
                  </div>
                ))}
              </div>
            </div>

            {ganttRowsWithDisplayState.length === 0 ? (
              <div className="gantt-empty">Aucun pointage à afficher en vue Gantt</div>
            ) : (
              ganttRowsWithDisplayState.map((row) => {
                return (
                  <div
                    key={row.key}
                    className={`gantt-row ${row.isNewUtilisateurGroup ? 'gantt-row-user-separator' : ''} ${row.isAltUserPairBackground ? 'gantt-row-user-pair-alt' : ''}`.trim()}
                  >
                  <div className="gantt-resource-cell">
                    <div
                      className="gantt-user-color"
                      style={{ backgroundColor: row.utilisateurCouleur }}
                    />
                    <span className="gantt-user-name">{row.utilisateurNom}</span>
                    <span className="gantt-project-name">· {row.projetNom}</span>
                  </div>
                  <div className="gantt-timeline-cell">
                    <div className="gantt-slot-grid">
                      {Array.from({ length: 10 }).map((_, slotIndex) => (
                        <div
                          key={`${row.key}-slot-${slotIndex}`}
                          className="gantt-slot gantt-slot-clickable"
                          onClick={() => {
                            if (ganttResizeState || Date.now() < suppressGanttClickUntilRef.current) {
                              return;
                            }
                            handleSlotClick(row.utilisateurId, row.projetId, slotIndex);
                          }}
                          title="Cliquer pour ajouter un pointage"
                        />
                      ))}
                    </div>
                    {row.bars.map((bar) => {
                      const isResizingBar = ganttResizeState?.pointageId === bar.id;
                      const previewStart = isResizingBar ? ganttResizeState.currentStartSlot : bar.startSlot;
                      const previewEnd = isResizingBar ? ganttResizeState.currentEndSlot : bar.endSlot;
                      const previewSpan = previewEnd - previewStart;

                      return (
                        <div
                          key={bar.id}
                          className={`gantt-bar ${isResizingBar ? 'gantt-bar-resizing' : ''}`}
                          style={{
                            left: `${(previewStart / 10) * 100}%`,
                            width: `${(previewSpan / 10) * 100}%`,
                            ...getMotifStyle(row.projetCouleur, row.projetMotif),
                          }}
                          title={`${row.utilisateurNom} · ${row.projetNom}${bar.pointage.note ? ` · 📝 ${bar.pointage.note}` : ''} · Clic gauche: modifier · Clic droit: supprimer · Poignées: étirer/réduire`}
                          onClick={() => {
                            if (ganttResizeState || Date.now() < suppressGanttClickUntilRef.current) {
                              return;
                            }
                            handleShowModal(bar.pointage);
                          }}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            if (ganttResizeState || Date.now() < suppressGanttClickUntilRef.current) {
                              return;
                            }
                            handleDeleteClick(bar.pointage);
                          }}
                        >
                          <div
                            className="gantt-bar-handle gantt-bar-handle-start"
                            onMouseDown={(event) => startGanttResize(event, bar, 'start')}
                            onClick={(event) => event.stopPropagation()}
                            title="Réduire/étirer le début"
                          />
                          <div
                            className="gantt-bar-handle gantt-bar-handle-end"
                            onMouseDown={(event) => startGanttResize(event, bar, 'end')}
                            onClick={(event) => event.stopPropagation()}
                            title="Réduire/étirer la fin"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
                );
              })
            )}
          </div>
          )}

          {isTableView && (
          <Table striped bordered hover className="pointage-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('utilisateur')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  Utilisateur {renderSortIcon('utilisateur')}
                </th>
                <th onClick={() => handleSort('projet')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  Projet {renderSortIcon('projet')}
                </th>
                <th onClick={() => handleSort('jours')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  Jour(s) {renderSortIcon('jours')}
                </th>
                <th>Code Pointage</th>
                <th onClick={() => handleSort('date_debut')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  Début {renderSortIcon('date_debut')}
                </th>
                <th onClick={() => handleSort('date_fin')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  Fin {renderSortIcon('date_fin')}
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedPointages.map((item) => (
              <tr key={item.id}>
                <td className="text-center" style={{ fontFamily: 'monospace' }}>
                  <div className="d-flex align-items-center justify-content-center">
                    <div
                      style={{
                        width: '20px',
                        height: '20px',
                        backgroundColor: item.utilisateur?.couleur || '#ccc',
                        border: '1px solid #999',
                        borderRadius: '3px',
                        marginRight: '8px',
                      }}
                    />
                    {item.utilisateur?.nom || 'N/A'}
                  </div>
                </td>
                <td style={{ fontFamily: 'monospace' }}>
                  <div className="d-flex align-items-center gap-2">
                    <div
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '3px',
                        border: '1px solid #999',
                        flexShrink: 0,
                        ...getMotifStyle(item.projet?.couleur || '#ccc', item.projet?.motif || 'uni'),
                      }}
                      title={`${item.projet?.couleur || '#ccc'} · ${item.projet?.motif || 'uni'}`}
                    />
                    {item.projet?.nom || 'N/A'}
                  </div>
                </td>
                <td className="text-center" style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '0.95rem' }}>
                  {calculateDays(item.date_debut, item.periode_debut, item.date_fin, item.periode_fin)}
                </td>
                <td className="text-center" style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                  {item.projet?.code_pointage?.code || ''}
                </td>
                <td className="text-center" style={{ fontFamily: 'monospace', fontSize: '0.95rem' }}>
                  {formatDateDDMMYYYY(item.date_debut)}
                  {' '}
                  <span style={{ fontSize: '0.85rem', fontStyle: 'italic', textTransform: 'lowercase' }}>
                    ({PERIODE_LABELS[item.periode_debut] || item.periode_debut})
                  </span>
                </td>
                <td className="text-center" style={{ fontFamily: 'monospace', fontSize: '0.95rem' }}>
                  {formatDateDDMMYYYY(item.date_fin)}
                  {' '}
                  <span style={{ fontSize: '0.85rem', fontStyle: 'italic', textTransform: 'lowercase' }}>
                    ({PERIODE_LABELS[item.periode_fin] || item.periode_fin})
                  </span>
                </td>
                <td>
                  <div className="d-flex align-items-center justify-content-center gap-2">
                    {item.note && (
                      <Button
                        variant="outline-info"
                        size="sm"
                        title={item.note}
                        className="d-flex align-items-center justify-content-center"
                        style={{ width: '36px', height: '36px', padding: '0', cursor: 'default' }}
                        onClick={() => handleShowModal(item)}
                      >
                        <i className="fas fa-sticky-note"></i>
                      </Button>
                    )}
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
                      onClick={() => handleDeleteClick(item)}
                      className="d-flex align-items-center justify-content-center"
                      style={{ width: '36px', height: '36px', padding: '0' }}
                    >
                      <i className="fas fa-trash"></i>
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
              {pointages.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-center">
                    Aucun pointage trouvé
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
          )}
        </>
      )}

      <Modal show={showModal} onHide={handleCloseModal} keyboard onEscapeKeyDown={handleCloseModal}>
        <Modal.Header closeButton>
          <Modal.Title>
            {editingItem ? 'Modifier' : 'Nouveau'} Pointage
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            {error && <Alert variant="danger">{error}</Alert>}
            <Form.Group className="mb-3">
              <Form.Label>Utilisateur</Form.Label>
              <Select
                options={utilisateurOptions}
                value={utilisateurOptions.find(opt => opt.value === parseInt(formData.utilisateur_id)) || null}
                onChange={(selectedOption) => {
                  const newUserId = selectedOption ? selectedOption.value : '';
                  if (!editingItem) {
                    const selectedYear = parseInt(filters.annee, 10) || CURRENT_WEEK_INFO.year;
                    const selectedWeek = parseInt(filters.numero_semaine, 10) || CURRENT_WEEK_INFO.week;
                    const firstAvailable = findFirstAvailableSlot(newUserId, selectedYear, selectedWeek);

                    setFormData((prev) => ({
                      ...prev,
                      utilisateur_id: newUserId,
                      date_debut: firstAvailable.date,
                      periode_debut: firstAvailable.periode,
                      date_fin: firstAvailable.date,
                      periode_fin: 'soir',
                    }));
                  } else {
                    setFormData({ ...formData, utilisateur_id: newUserId });
                  }
                }}
                isClearable
                placeholder="Sélectionnez un utilisateur"
                styles={customSelectStyles}
                classNamePrefix="rs"
                className="rs-select"
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Projet</Form.Label>
              <Select
                options={projetOptions}
                value={projetOptions.find(opt => opt.value === parseInt(formData.projet_id)) || null}
                onChange={(selectedOption) => {
                  const newProjetId = selectedOption ? selectedOption.value : '';
                  const newProjetNom = selectedOption ? selectedOption.label : '';
                  setFormData({ ...formData, projet_id: newProjetId });
                  setProjectSearchText(newProjetNom);
                }}
                onInputChange={(inputValue) => {
                  setProjectSearchText(inputValue);
                }}
                isClearable
                placeholder="Commencez à saisir le nom du projet..."
                styles={customSelectStyles}
                classNamePrefix="rs"
                className="rs-select"
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>
                Date de début
                {formData.date_debut && (
                  <span style={{ fontStyle: 'italic', marginLeft: '8px', color: '#6c757d' }}>
                    ({getDayName(formData.date_debut)})
                  </span>
                )}
              </Form.Label>
              <Form.Control
                type="date"
                lang="fr-FR"
                value={formData.date_debut}
                onChange={(e) => handleDateDebutChange(e.target.value)}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Période de début</Form.Label>
              <div className="period-switch" role="radiogroup" aria-label="Période de début">
                {PERIODES_DEBUT.map((periode) => (
                  <button
                    key={periode.value}
                    type="button"
                    className={`period-switch-option ${formData.periode_debut === periode.value ? 'active' : ''}`}
                    onClick={() => handlePeriodeDebutChange(periode.value)}
                  >
                    {periode.label}
                  </button>
                ))}
              </div>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>
                Date de fin
                {formData.date_fin && (
                  <span style={{ fontStyle: 'italic', marginLeft: '8px', color: '#6c757d' }}>
                    ({getDayName(formData.date_fin)})
                  </span>
                )}
              </Form.Label>
              <Form.Control
                type="date"
                lang="fr-FR"
                value={formData.date_fin}
                onChange={(e) => handleDateFinChange(e.target.value)}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Période de fin</Form.Label>
              <div className="period-switch" role="radiogroup" aria-label="Période de fin">
                {PERIODES_FIN.map((periode) => {
                  const isDisabled = formData.date_debut === formData.date_fin
                    && PERIODE_ORDER[periode.value] <= PERIODE_ORDER[formData.periode_debut];
                  return (
                    <button
                      key={periode.value}
                      type="button"
                      className={`period-switch-option ${formData.periode_fin === periode.value ? 'active' : ''}`}
                      onClick={() => !isDisabled && handlePeriodeFinChange(periode.value)}
                      disabled={isDisabled}
                    >
                      {periode.label}
                    </button>
                  );
                })}
              </div>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>
                <i className="fas fa-sticky-note me-1 text-info"></i>
                Note
                <span className="text-muted ms-1" style={{ fontSize: '0.85em', fontWeight: 'normal' }}>(facultatif)</span>
              </Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                placeholder="Ajouter une note..."
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                style={{ resize: 'vertical' }}
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

      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)} centered>
        <Modal.Header closeButton style={{ borderColor: '#dc3545' }}>
          <Modal.Title style={{ color: '#dc3545' }}>
            <i className="fas fa-trash me-2" style={{ color: '#dc3545' }}></i>
            Supprimer ce pointage
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {itemToDelete && (
            <div>
              <p className="mb-3">
                Êtes-vous sûr de vouloir supprimer ce pointage ?
              </p>
              <div className="alert alert-light mb-3" role="alert">
                <div className="mb-2">
                  <strong>Utilisateur:</strong> {itemToDelete.utilisateur?.nom || 'N/A'}
                </div>
                <div className="mb-2">
                  <strong>Projet:</strong> {itemToDelete.projet?.nom || 'N/A'}
                </div>
                <div>
                  <strong>Période:</strong> {formatDateDDMMYYYY(itemToDelete.date_debut)} au {formatDateDDMMYYYY(itemToDelete.date_fin)}
                </div>
              </div>
              <div className="alert alert-warning mb-0" role="alert">
                ⚠️ Cette action ne peut pas être annulée.
              </div>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
            Annuler
          </Button>
          <Button variant="danger" onClick={handleConfirmDelete}>
            <i className="fas fa-trash me-2" style={{ color: 'white' }}></i>
            Supprimer
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showConflictModal} onHide={handleCancelConflict} centered>
        <Modal.Header closeButton style={{ borderColor: '#ffc107' }}>
          <Modal.Title style={{ color: '#856404' }}>
            <i className="fas fa-exclamation-triangle me-2" style={{ color: '#ffc107' }}></i>
            Conflit détecté
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
          <div>
            <p className="mb-3">
              La période sélectionnée chevauche {conflictingPointages.length} pointage(s) existant(s).
            </p>
            <div className="alert alert-warning mb-3" role="alert">
              <strong>Pointages en conflit :</strong>
              <ul className="mb-0 mt-2">
                {conflictingPointages.map((conflict) => (
                  <li key={conflict.id}>
                    <strong>{conflict.projet?.nom || 'N/A'}</strong> -
                    {' '}{formatDateDDMMYYYY(conflict.date_debut)} ({PERIODE_LABELS[conflict.periode_debut] || conflict.periode_debut})
                    {' '}au {formatDateDDMMYYYY(conflict.date_fin)} ({PERIODE_LABELS[conflict.periode_fin] || conflict.periode_fin})
                  </li>
                ))}
              </ul>
            </div>
            <div className="alert alert-danger mb-0" role="alert">
              ⚠️ En confirmant, ces pointages seront supprimés définitivement avant d'enregistrer le nouveau.
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleCancelConflict}>
            Annuler
          </Button>
          <Button variant="warning" onClick={handleConfirmConflictAndCreate}>
            <i className="fas fa-check me-2"></i>
            Confirmer et enregistrer
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default PointageGrid;
