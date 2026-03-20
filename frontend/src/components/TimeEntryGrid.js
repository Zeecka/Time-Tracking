import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Table, Button, Modal, Form, Alert, Row, Col } from 'react-bootstrap';
import { Link, useSearchParams } from 'react-router-dom';
import Select from 'react-select';
import { useTranslation } from 'react-i18next';
import { timeEntryAPI, userAPI, projectAPI } from '../services/api';
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

  return { year: safeYear, week_number: safeWeek };
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
    start_date: monday.toISOString().split('T')[0],
    end_date: friday.toISOString().split('T')[0],
  };
};

const formatFrenchShortDate = (date) => new Intl.DateTimeFormat('en-US', {
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
  const date = new Date(dateString + 'T00:00:00Z');
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(date);
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
    if (periodeDebut === 'morning' && periodeFin === 'evening') {
      days = 1;
    } else if (periodeDebut === 'morning' && periodeFin === 'midday') {
      days = 0.5;
    } else if (periodeDebut === 'midday' && periodeFin === 'evening') {
      days = 0.5;
    } else {
      days = 0.5;
    }
  } else {
    // Jours différents - compter les jours complets + ajustements
    if (periodeDebut === 'midday') {
      days -= 0.5;
    }
    if (periodeFin === 'midday') {
      days += 0.5;
    } else {
      days += 1;
    }
  }

  return Math.max(0, days);
};

const CURRENT_WEEK_INFO = getCurrentIsoWeekInfo();
const PERIODES_DEBUT = [
  { value: 'morning', label: 'morning' },
  { value: 'midday', label: 'midday' },
];
const PERIODES_FIN = [
  { value: 'midday', label: 'midday' },
  { value: 'evening', label: 'evening' },
];
const PERIODE_LABELS = {
  morning: 'Morning',
  midday: 'Midday',
  evening: 'Evening',
  journee: 'Journée',
  apres_midi: 'Après-midi',
};
const PERIODE_ORDER = { morning: 0, midday: 1, evening: 2 };
const PERIODE_LEGACY_START_MAP = { journee: 'morning', apres_midi: 'midday' };
const PERIODE_LEGACY_END_MAP = { journee: 'evening', apres_midi: 'midday' };
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

const getMotifStyle = (color, pattern) => {
  const baseColor = color || '#6c757d';
  if (pattern === 'striped') {
    return {
      backgroundColor: baseColor,
      backgroundImage: `repeating-linear-gradient(45deg, ${baseColor} 0px, ${baseColor} 7px, rgba(255, 255, 255, 0.45) 7px, rgba(255, 255, 255, 0.45) 12px)`,
    };
  }
  if (pattern === 'dotted') {
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

function TimeEntryGrid({ viewMode = 'table' }) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialYear = searchParams.get('year');
  const initialWeek = searchParams.get('week');
  const initialFilters = sanitizeWeekYear(initialYear, initialWeek);

  const [timeEntries, setTimeEntries] = useState([]);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    start_date: '',
    start_period: 'morning',
    end_date: '',
    end_period: 'evening',
    week_number: CURRENT_WEEK_INFO.week,
    year: CURRENT_WEEK_INFO.year,
    user_id: '',
    project_id: '',
    note: '',
  });
  const [filters, setFilters] = useState({
    year: initialFilters.year,
    week_number: initialFilters.week_number,
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
  const [conflictingTimeEntries, setConflictingTimeEntries] = useState([]);
  const [pendingFormData, setPendingFormData] = useState(null);
  const [pendingEditingItem, setPendingEditingItem] = useState(null);
  const [ganttResizeState, setGanttResizeState] = useState(null);
  const ganttResizeStateRef = useRef(null);
  const suppressGanttClickUntilRef = useRef(0);
  const importCsvInputRef = useRef(null);
  const isTableView = viewMode === 'table';
  const isGanttView = viewMode === 'gantt';
  const isSynthesisView = viewMode === 'synthesis';
  const [groupedView, setGroupedView] = useState(false);

  useEffect(() => {
    ganttResizeStateRef.current = ganttResizeState;
  }, [ganttResizeState]);

  const loadTimeEntries = useCallback(async (filterParams) => {
    try {
      setLoading(true);
      const response = await timeEntryAPI.getAll(filterParams);
      setTimeEntries(response.data);
    } catch (err) {
      setError('Erreur lors du chargement des timeEntries');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const response = await userAPI.getAll();
      setUsers(response.data);
    } catch (err) {
      console.error('Erreur lors du chargement des users', err);
    }
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const response = await projectAPI.getAll();
      setProjects(response.data);
    } catch (err) {
      console.error('Erreur lors du chargement des projects', err);
    }
  }, []);

  useEffect(() => {
    loadTimeEntries(filters);
  }, [filters, loadTimeEntries]);

  useEffect(() => {
    loadUsers();
    loadProjects();
  }, [loadUsers, loadProjects]);

  useEffect(() => {
    const year = searchParams.get('year');
    const week = searchParams.get('week');
    const next = sanitizeWeekYear(year, week);

    if (next.year !== filters.year || next.week_number !== filters.week_number) {
      setFilters(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get('year'), searchParams.get('week')]);

  useEffect(() => {
    const currentYear = searchParams.get('year');
    const currentWeek = searchParams.get('week');
    const targetYear = String(filters.year);
    const targetWeek = String(filters.week_number);

    if (currentYear !== targetYear || currentWeek !== targetWeek) {
      setSearchParams({ year: targetYear, week: targetWeek }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.year, filters.week_number]);

  const selectedWeekRange = useMemo(() => {
    if (!Number.isFinite(filters.year) || !Number.isFinite(filters.week_number)) {
      return getIsoWeekDateRange(CURRENT_WEEK_INFO.year, CURRENT_WEEK_INFO.week);
    }
    return getIsoWeekDateRange(filters.year, filters.week_number);
  }, [filters.year, filters.week_number]);

  const startOfWeekUtc = useMemo(
    () => new Date(`${selectedWeekRange.start_date}T00:00:00Z`),
    [selectedWeekRange.start_date]
  );
  const endOfWeekUtc = useMemo(
    () => new Date(`${selectedWeekRange.end_date}T23:59:59Z`),
    [selectedWeekRange.end_date]
  );

  const handleShowModal = (item = null) => {
    const normalizePeriodeDebut = (value) => {
      if (value === 'journee') return 'morning';
      if (value === 'apres_midi') return 'midday';
      return value === 'midday' ? 'midday' : 'morning';
    };

    const normalizePeriodeFin = (value) => {
      if (value === 'journee') return 'evening';
      if (value === 'apres_midi') return 'midday';
      return value === 'midday' ? 'midday' : 'evening';
    };

    if (item) {
      setEditingItem(item);
      const selectedProjet = projects.find((p) => p.id === item.project_id);
      setProjectSearchText(selectedProjet ? selectedProjet.name : '');
      setFormData({
        start_date: item.start_date,
        start_period: normalizePeriodeDebut(item.start_period),
        end_date: item.end_date,
        end_period: normalizePeriodeFin(item.end_period),
        week_number: item.week_number,
        year: item.year,
        user_id: item.user_id,
        project_id: item.project_id,
        note: item.note || '',
      });
    } else {
      setEditingItem(null);
      setProjectSearchText('');
      const selectedYear = parseInt(filters.year, 10) || CURRENT_WEEK_INFO.year;
      const selectedWeek = parseInt(filters.week_number, 10) || CURRENT_WEEK_INFO.week;
      const firstAvailable = findFirstAvailableSlot('', selectedYear, selectedWeek);

      setFormData({
        start_date: firstAvailable.date,
        start_period: firstAvailable.periode,
        end_date: firstAvailable.date,
        end_period: 'evening',
        week_number: selectedWeek,
        year: selectedYear,
        user_id: '',
        project_id: '',
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
      start_date: dateRange.start_date,
      start_period: 'morning',
      end_date: dateRange.start_date,
      end_period: 'evening',
      week_number: CURRENT_WEEK_INFO.week,
      year: CURRENT_WEEK_INFO.year,
      user_id: '',
      project_id: '',
      note: '',
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const data = {
      ...formData,
      week_number: parseInt(formData.week_number),
      year: parseInt(formData.year),
      user_id: parseInt(formData.user_id),
      project_id: parseInt(formData.project_id),
    };

    // Vérifier les chevauchements avant la sauvegarde
    const conflicts = findOverlappingTimeEntries(
      data.user_id,
      data.start_date,
      data.start_period,
      data.end_date,
      data.end_period,
      editingItem?.id
    );

    if (conflicts.length > 0) {
      // Il y a des conflits, demander confirmation
      setPendingFormData(data);
      setPendingEditingItem(editingItem);
      setConflictingTimeEntries(conflicts);
      setShowConflictModal(true);
    } else {
      // Pas de conflit, sauvegarder directement
      try {
        await savePointage(data, editingItem);
      } catch (err) {
        setError(err.response?.data?.error || t('timeEntry.errorSave'));
      }
    }
  };

  const savePointage = async (data, editItem) => {
    if (editItem) {
      await timeEntryAPI.update(editItem.id, data);
    } else {
      await timeEntryAPI.create(data);
    }
    handleCloseModal();
    await loadTimeEntries(filters);
  };

  const handleDeleteClick = (item) => {
    setItemToDelete(item);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await timeEntryAPI.delete(itemToDelete.id);
      setShowDeleteModal(false);
      setItemToDelete(null);
      loadTimeEntries(filters);
    } catch (err) {
      setError(err.response?.data?.error || t('timeEntry.errorDelete'));
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
      periode: isAfternoon ? 'midday' : 'morning',
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
        periode: isAfternoon ? 'midday' : 'morning',
      };
    }

    const adjustedIndex = safeBoundary - 1;
    const dayIndex = Math.floor(adjustedIndex / 2);
    const isMiddayBoundary = adjustedIndex % 2 === 0;
    const date = new Date(startOfWeekUtc);
    date.setUTCDate(startOfWeekUtc.getUTCDate() + dayIndex);

    return {
      date: date.toISOString().split('T')[0],
      periode: isMiddayBoundary ? 'midday' : 'evening',
    };
  }, [startOfWeekUtc]);

  const findOverlappingTimeEntries = useCallback((utilisateurId, dateDebut, periodeDebut, dateFin, periodeFin, excludeId = null) => {
    return timeEntries.filter((p) => {
      if (excludeId && p.id === excludeId) return false;
      if (p.user_id !== utilisateurId) return false;

      const newStart = new Date(dateDebut + 'T00:00:00Z');
      const newEnd = new Date(dateFin + 'T00:00:00Z');
      const newStartPeriode = normalizePeriodeValue(periodeDebut, true);
      const newEndPeriode = normalizePeriodeValue(periodeFin, false);

      const pStart = new Date(p.start_date + 'T00:00:00Z');
      const pEnd = new Date(p.end_date + 'T00:00:00Z');
      const pStartPeriode = normalizePeriodeValue(p.start_period, true);
      const pEndPeriode = normalizePeriodeValue(p.end_period, false);

      if (newEnd < pStart || newStart > pEnd) return false;

      if (newEnd.getTime() === pStart.getTime()) {
        if (newEndPeriode === 'midday' && pStartPeriode === 'midday') return false;
        if (newEndPeriode === 'midday' && pStartPeriode === 'morning') return false;
      }

      if (newStart.getTime() === pEnd.getTime()) {
        if (newStartPeriode === 'midday' && pEndPeriode === 'midday') return false;
      }

      if (dateDebut === dateFin && p.start_date === p.end_date && dateDebut === p.start_date) {
        if (newStartPeriode === 'morning' && newEndPeriode === 'midday' && pStartPeriode === 'midday' && pEndPeriode === 'evening') {
          return false;
        }
        if (newStartPeriode === 'midday' && newEndPeriode === 'evening' && pStartPeriode === 'morning' && pEndPeriode === 'midday') {
          return false;
        }
      }

      return true;
    });
  }, [timeEntries]);

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

      const targetPointage = timeEntries.find((item) => item.id === resizeData.pointageId);
      if (!targetPointage) {
        return;
      }

      const nextStart = getDateAndPeriodFromBoundary(resizeData.currentStartSlot, true);
      const nextEnd = getDateAndPeriodFromBoundary(resizeData.currentEndSlot, false);
      const hasChanged = (
        nextStart.date !== targetPointage.start_date
        || nextStart.periode !== normalizePeriodeValue(targetPointage.start_period, true)
        || nextEnd.date !== targetPointage.end_date
        || nextEnd.periode !== normalizePeriodeValue(targetPointage.end_period, false)
      );

      if (!hasChanged) {
        return;
      }

      const conflicts = findOverlappingTimeEntries(
        targetPointage.user_id,
        nextStart.date,
        nextStart.periode,
        nextEnd.date,
        nextEnd.periode,
        targetPointage.id
      );

      if (conflicts.length > 0) {
        setError(t('timeEntry.errorResize'));
        return;
      }

      try {
        await timeEntryAPI.update(targetPointage.id, {
          start_date: nextStart.date,
          start_period: nextStart.periode,
          end_date: nextEnd.date,
          end_period: nextEnd.periode,
          week_number: targetPointage.week_number,
          year: targetPointage.year,
          user_id: targetPointage.user_id,
          project_id: targetPointage.project_id,
          note: targetPointage.note || '',
        });
        await loadTimeEntries(filters);
      } catch (err) {
        setError(err.response?.data?.error || t('timeEntry.errorResize'));
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
  }, [filters, findOverlappingTimeEntries, ganttResizeState, getDateAndPeriodFromBoundary, loadTimeEntries, t, timeEntries]);

  const handleSlotClick = (utilisateurId, projetId, slotIndex) => {
    const slotData = getDateAndPeriodFromSlot(slotIndex);

    // Ouvrir directement la modale de création sans vérification
    openSlotCreation({
      user_id: utilisateurId,
      project_id: projetId,
      start_date: slotData.date,
      start_period: slotData.periode,
      end_date: slotData.date,
      end_period: slotData.periode === 'morning' ? 'midday' : 'evening',
    });
  };

  const openSlotCreation = (slotData) => {
    setEditingItem(null);
    const selectedProjet = projects.find((p) => p.id === slotData.project_id);
    setProjectSearchText(selectedProjet ? selectedProjet.name : '');
    setFormData({
      start_date: slotData.start_date,
      start_period: slotData.start_period,
      end_date: slotData.end_date,
      end_period: slotData.end_period,
      week_number: filters.week_number,
      year: filters.year,
      user_id: slotData.user_id,
      project_id: slotData.project_id || '',
    });
    setShowModal(true);
    setError('');
  };

  const handleConfirmConflictAndCreate = async () => {
    if (!pendingFormData) return;

    try {
      // Supprimer les timeEntries en conflit
      for (const conflict of conflictingTimeEntries) {
        await timeEntryAPI.delete(conflict.id);
      }

      // Recharger pour avoir les données à jour
      await loadTimeEntries(filters);

      // Sauvegarder le nouveau pointage
      await savePointage(pendingFormData, pendingEditingItem);

      // Nettoyer l'état seulement si tout s'est bien passé
      setShowConflictModal(false);
      setConflictingTimeEntries([]);
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
    setConflictingTimeEntries([]);
    setPendingFormData(null);
    setPendingEditingItem(null);
    setError('');
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    const nextFilters = { ...filters, [name]: value };
    setFilters(sanitizeWeekYear(nextFilters.year, nextFilters.week_number));
  };

  const handleWeekShift = (direction) => {
    setFilters((prev) => {
      const maxWeeks = getIsoWeeksInYear(prev.year);

      if (direction < 0) {
        if (prev.week_number > 1) {
          return { ...prev, week_number: prev.week_number - 1 };
        }
        const previousYear = prev.year - 1;
        const safeYear = Math.max(2000, previousYear);
        return { year: safeYear, week_number: getIsoWeeksInYear(safeYear) };
      }

      if (prev.week_number < maxWeeks) {
        return { ...prev, week_number: prev.week_number + 1 };
      }

      const nextYear = prev.year + 1;
      const safeYear = Math.min(2100, nextYear);
      return { year: safeYear, week_number: 1 };
    });
  };

  const handleDateDebutChange = (value) => {
    setFormData((prev) => {
      const next = { ...prev, start_date: value };
      if (next.end_date && next.end_date < next.start_date) {
        next.end_date = next.start_date;
        next.end_period = 'evening';
      }
      if (next.start_date === next.end_date && PERIODE_ORDER[next.end_period] <= PERIODE_ORDER[next.start_period]) {
        next.end_period = 'evening';
      }
      return next;
    });
  };

  const handleDateFinChange = (value) => {
    setFormData((prev) => {
      const next = { ...prev, end_date: value };
      if (next.start_date === next.end_date && PERIODE_ORDER[next.end_period] <= PERIODE_ORDER[next.start_period]) {
        next.end_period = next.start_period === 'midday' ? 'evening' : 'midday';
      }
      return next;
    });
  };

  const handlePeriodeDebutChange = (value) => {
    setFormData((prev) => {
      const next = { ...prev, start_period: value };
      if (next.end_date && next.end_date < next.start_date) {
        next.end_date = next.start_date;
        next.end_period = 'evening';
      }
      if (next.start_date === next.end_date && PERIODE_ORDER[next.end_period] <= PERIODE_ORDER[value]) {
        next.end_period = 'evening';
      }
      return next;
    });
  };

  const handlePeriodeFinChange = (value) => {
    setFormData((prev) => ({ ...prev, end_period: value }));
  };

  const findFirstAvailableSlot = (utilisateurId, weekYear, weekNumber) => {
    if (!utilisateurId) {
      const dateRange = getIsoWeekDateRange(weekYear, weekNumber);
      return { date: dateRange.start_date, periode: 'morning' };
    }

    // Get all timeEntries for this user in the selected week
    const userPointages = timeEntries.filter(
      (p) => p.user_id === parseInt(utilisateurId) &&
             p.year === weekYear &&
             p.week_number === weekNumber
    );

    if (userPointages.length === 0) {
      const dateRange = getIsoWeekDateRange(weekYear, weekNumber);
      return { date: dateRange.start_date, periode: 'morning' };
    }

    // Build a map of occupied slots
    const occupiedSlots = new Set();
    userPointages.forEach((p) => {
      const start = new Date(p.start_date + 'T00:00:00Z');
      const end = new Date(p.end_date + 'T00:00:00Z');
      const startPeriode = normalizePeriodeValue(p.start_period, true);
      const endPeriode = normalizePeriodeValue(p.end_period, false);

      const daysCount = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
      for (let i = 0; i < daysCount; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];

        if (dateStr === p.start_date && dateStr === p.end_date) {
          // Same day
          if (startPeriode === 'morning' && endPeriode === 'evening') {
            occupiedSlots.add(`${dateStr}-morning`);
            occupiedSlots.add(`${dateStr}-midday`);
          } else if (startPeriode === 'morning' && endPeriode === 'midday') {
            occupiedSlots.add(`${dateStr}-morning`);
          } else if (startPeriode === 'midday' && endPeriode === 'evening') {
            occupiedSlots.add(`${dateStr}-midday`);
          } else {
            occupiedSlots.add(`${dateStr}-morning`);
            occupiedSlots.add(`${dateStr}-midday`);
          }
        } else if (dateStr === p.start_date) {
          // First day
          if (startPeriode === 'morning') {
            occupiedSlots.add(`${dateStr}-morning`);
            occupiedSlots.add(`${dateStr}-midday`);
          } else {
            occupiedSlots.add(`${dateStr}-midday`);
          }
        } else if (dateStr === p.end_date) {
          // Last day
          if (endPeriode === 'evening') {
            occupiedSlots.add(`${dateStr}-morning`);
            occupiedSlots.add(`${dateStr}-midday`);
          } else {
            occupiedSlots.add(`${dateStr}-morning`);
          }
        } else {
          // Full day in between
          occupiedSlots.add(`${dateStr}-morning`);
          occupiedSlots.add(`${dateStr}-midday`);
        }
      }
    });

    // Find first available slot
    const dateRange = getIsoWeekDateRange(weekYear, weekNumber);
    const startDate = new Date(dateRange.start_date + 'T00:00:00Z');
    const endDate = new Date(dateRange.end_date + 'T00:00:00Z');

    const daysCount = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    for (let i = 0; i < daysCount; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];

      if (!occupiedSlots.has(`${dateStr}-morning`)) {
        return { date: dateStr, periode: 'morning' };
      }
      if (!occupiedSlots.has(`${dateStr}-midday`)) {
        return { date: dateStr, periode: 'midday' };
      }
    }

    // If no slot available, return first date
    return { date: dateRange.start_date, periode: 'morning' };
  };

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortedTimeEntries = () => {
    if (!sortColumn) return timeEntries;

    return [...timeEntries].sort((a, b) => {
      let aVal, bVal;

      switch (sortColumn) {
        case 'user':
          aVal = a.user?.name || '';
          bVal = b.user?.name || '';
          break;
        case 'project':
          aVal = a.project?.name || '';
          bVal = b.project?.name || '';
          break;
        case 'start_date':
          aVal = a.start_date || '';
          bVal = b.start_date || '';
          break;
        case 'start_period':
          aVal = PERIODE_ORDER[a.start_period] || 0;
          bVal = PERIODE_ORDER[b.start_period] || 0;
          break;
        case 'end_date':
          aVal = a.end_date || '';
          bVal = b.end_date || '';
          break;
        case 'end_period':
          aVal = PERIODE_ORDER[a.end_period] || 0;
          bVal = PERIODE_ORDER[b.end_period] || 0;
          break;
        case 'days':
          aVal = calculateDays(a.start_date, a.start_period, a.end_date, a.end_period);
          bVal = calculateDays(b.start_date, b.start_period, b.end_date, b.end_period);
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
  const weekQueryString = `?year=${filters.year}&week=${filters.week_number}`;
  const sortedTimeEntries = getSortedTimeEntries();

  const groupedTimeEntries = useMemo(() => {
    const map = {};
    timeEntries.forEach((item) => {
      const userId = item.user?.id ?? item.user_id;
      const projectId = item.project?.id ?? item.project_id;
      const key = `${userId}-${projectId}`;
      if (!map[key]) {
        map[key] = {
          key,
          user: item.user,
          project: item.project,
          totalJours: 0,
        };
      }
      map[key].totalJours += calculateDays(item.start_date, item.start_period, item.end_date, item.end_period);
    });
    return Object.values(map).sort((a, b) => {
      const nomA = a.user?.name || '';
      const nomB = b.user?.name || '';
      const cmp = nomA.localeCompare(nomB, 'fr', { sensitivity: 'base' });
      if (cmp !== 0) return cmp;
      return (a.project?.name || '').localeCompare(b.project?.name || '', 'en', { sensitivity: 'base' });
    });
  }, [timeEntries]);

  const userMissingDaysMap = useMemo(() => {
    const pointedDaysByUser = timeEntries.reduce((acc, item) => {
      const userId = item.user_id ?? item.user?.id;
      if (!userId) {
        return acc;
      }

      const pointedDays = calculateDays(item.start_date, item.start_period, item.end_date, item.end_period);
      acc[userId] = (acc[userId] || 0) + pointedDays;
      return acc;
    }, {});

    return Object.entries(pointedDaysByUser).reduce((acc, [userId, pointedDays]) => {
      acc[userId] = Math.max(0, EXPECTED_WEEK_DAYS - pointedDays);
      return acc;
    }, {});
  }, [timeEntries]);

  const missingDaysSummary = useMemo(() => {
    return users
      .map((user) => ({
        id: user.id,
        nom: user.name || 'N/A',
        couleur: user.color || '#ccc',
        missingDays: userMissingDaysMap[user.id] ?? EXPECTED_WEEK_DAYS,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  }, [users, userMissingDaysMap]);

  const syntheseData = useMemo(() => {
    const usersMap = {};
    const projectsMap = {};
    const cellData = {};

    groupedTimeEntries.forEach((row) => {
      const userId = row.user?.id ?? 'unknown';
      const projectId = row.project?.id ?? 'unknown';

      usersMap[userId] = row.user;
      projectsMap[projectId] = row.project;

      if (!cellData[projectId]) cellData[projectId] = {};
      cellData[projectId][userId] = (cellData[projectId][userId] || 0) + row.totalJours;
    });

    const users = Object.values(usersMap).sort((a, b) =>
      (a?.name || '').localeCompare(b?.name || '', 'en', { sensitivity: 'base' })
    );
    const projects = Object.values(projectsMap).sort((a, b) =>
      (a?.name || '').localeCompare(b?.name || '', 'en', { sensitivity: 'base' })
    );

    return { users, projects, cellData };
  }, [groupedTimeEntries]);

  const ganttDays = Array.from({ length: 5 }, (_, index) => {
    const date = new Date(selectedWeekRange.monday);
    date.setUTCDate(selectedWeekRange.monday.getUTCDate() + index);
    return {
      label: new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(date),
      shortDate: new Intl.DateTimeFormat('en-US', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(date),
    };
  });

  const ganttVisibleTimeEntries = timeEntries.filter((item) => {
    if (!item?.start_date || !item?.end_date) {
      return false;
    }

    const itemStartUtc = new Date(`${item.start_date}T00:00:00Z`);
    const itemEndUtc = new Date(`${item.end_date}T23:59:59Z`);

    return itemEndUtc >= startOfWeekUtc && itemStartUtc <= endOfWeekUtc;
  });

  const getSlotIndex = (dateString, period, isEnd = false) => {
    const dateUtc = new Date(`${dateString}T00:00:00Z`);
    const dayDiff = Math.floor((dateUtc - startOfWeekUtc) / (1000 * 60 * 60 * 24));
    const clampedDay = Math.min(4, Math.max(0, dayDiff));
    const normalizedPeriod = normalizePeriodeValue(period, !isEnd);

    if (isEnd) {
      const endOffset = normalizedPeriod === 'midday' ? 1 : 2;
      return (clampedDay * 2) + endOffset;
    }

    const startOffset = normalizedPeriod === 'midday' ? 1 : 0;
    return (clampedDay * 2) + startOffset;
  };

  // Build Gantt rows: one row per (utilisateur, projet) pair, with multiple bars
  const ganttGroupMap = new Map();
  const ganttRowsGrouped = [];
  const ganttSortedItems = [...ganttVisibleTimeEntries].sort((a, b) => {
    const userCmp = (a.user?.name || '').localeCompare(b.user?.name || '', 'fr', { sensitivity: 'base' });
    if (userCmp !== 0) return userCmp;
    return (a.project?.name || '').localeCompare(b.project?.name || '', 'en', { sensitivity: 'base' });
  });

  for (const item of ganttSortedItems) {
    const userId = item.user?.id ?? null;
    const projetId = item.project?.id ?? null;
    const key = `${userId}_${projetId}`;

    if (!ganttGroupMap.has(key)) {
      const row = {
        key,
        utilisateurId: userId,
        utilisateurNom: item.user?.name || 'N/A',
        utilisateurCouleur: item.user?.color || '#ccc',
        projetId,
        projetNom: item.project?.name || 'N/A',
        projetCouleur: item.project?.color || '#6c757d',
        projetMotif: item.project?.pattern || 'solid',
        bars: [],
      };
      ganttGroupMap.set(key, row);
      ganttRowsGrouped.push(row);
    }

    const row = ganttGroupMap.get(key);
    const startSlot = getSlotIndex(item.start_date, item.start_period, false);
    const endSlot = getSlotIndex(item.end_date, item.end_period, true);
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

    if (currentRow.userId !== null && previousRow.userId !== null) {
      return currentRow.userId === previousRow.userId;
    }

    return currentRow.userNom === previousRow.userNom;
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
  const filteredProjects = projects.filter((project) => {
    if (!normalizedProjectSearch) {
      return true;
    }
    return project.name?.toLowerCase().includes(normalizedProjectSearch);
  });

  // React-select options
  const userOptions = users.map((user) => ({
    value: user.id,
    label: user.name,
  }));

  const projectOptions = filteredProjects.map((project) => ({
    value: project.id,
    label: project.name,
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
      const response = await timeEntryAPI.exportCSV({
        year: filters.year,
        week_number: filters.week_number,
      });
      downloadBlob(response.data, `time_entries_${filters.year}_W${filters.week_number}.csv`);
      setMessage('Export CSV des timeEntries terminé pour la semaine filtrée.');
    } catch (err) {
      setError(err.response?.data?.error || t('timeEntry.errorExportCsv'));
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
      const response = await timeEntryAPI.importCSV(file);
      const data = response.data || {};
      setMessage(
        `Import CSV timeEntries : ${data.created || 0} créé(s), ${(data.errors || []).length} erreur(s).`
      );
      await loadTimeEntries(filters);
    } catch (err) {
      setError(err.response?.data?.error || t('timeEntry.errorImportCsv'));
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="mb-0" style={{ fontWeight: 700 }}>
          <i className="fas fa-clock me-2" style={{ color: '#2ecc71' }}></i>
          {isGanttView ? t('grid.ganttView') : isSynthesisView ? t('grid.synthesisView') : t('grid.tableView')}
        </h2>
        <div className="d-flex gap-2 flex-wrap justify-content-end align-items-center">
          <Button variant="outline-primary" size="sm" onClick={handleImportCSVClick} className="d-inline-flex align-items-center">
            <i className="fas fa-file-import me-2"></i>
            {t('timeEntry.importCsv')}
          </Button>
          <Button variant="outline-success" size="sm" onClick={handleExportCSV} className="d-inline-flex align-items-center">
            <i className="fas fa-file-export me-2"></i>
            {t('timeEntry.exportCsv')}
          </Button>
          <Button variant="outline-secondary" size="sm" as="a" href="/examples/pointages_exemple.csv" download className="d-inline-flex align-items-center">
            <i className="fas fa-download me-2"></i>
            {t('grid.csvExample') || 'CSV example'}
          </Button>
          <Button variant="primary" onClick={() => handleShowModal()} className="d-inline-flex align-items-center">
            <i className="fas fa-plus me-2"></i>
            {t('timeEntry.new')}
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
          <div className="d-flex gap-2 align-items-center flex-wrap">
            <Button
              as={Link}
              to={`/timeEntries/gantt${weekQueryString}`}
              variant={isGanttView ? 'dark' : 'outline-secondary'}
              size="sm"
            >
              {t('grid.ganttView')}
            </Button>
            <Button
              as={Link}
              to={`/timeEntries/table${weekQueryString}`}
              variant={isTableView ? 'dark' : 'outline-secondary'}
              size="sm"
            >
              {t('grid.tableView')}
            </Button>
            <Button
              as={Link}
              to={`/timeEntries/synthese${weekQueryString}`}
              variant={isSynthesisView ? 'dark' : 'outline-secondary'}
              size="sm"
            >
              {t('grid.synthesisView')}
            </Button>
            {isTableView && (
              <Form.Check
                type="switch"
                id="grouped-view-switch"
                label="Vue regroupée"
                checked={groupedView}
                onChange={(e) => setGroupedView(e.target.checked)}
                className="ms-2 mb-0"
              />
            )}
          </div>
        </Col>
      </Row>

      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
      {message && <Alert variant="success" dismissible onClose={() => setMessage('')}>{message}</Alert>}

      {/* Filters */}
      <Row className="mb-3">
        <Col md={3}>
          <Form.Group>
            <Form.Label>{t('common.year')}</Form.Label>
            <Form.Control
              type="number"
              name="year"
              value={Number.isFinite(filters.year) ? filters.year : ''}
              onChange={handleFilterChange}
              min="2000"
              max="2100"
            />
          </Form.Group>
        </Col>
        <Col md={3}>
          <Form.Group>
            <Form.Label>{t('common.week')}</Form.Label>
            <Form.Control
              type="number"
              name="week_number"
              value={Number.isFinite(filters.week_number) ? filters.week_number : ''}
              onChange={handleFilterChange}
              min="1"
              max="53"
              placeholder={t('grid.allWeeks') || 'All'}
            />
          </Form.Group>
        </Col>
        <Col md={3} className="d-flex align-items-end gap-2">
          <Button
            variant="outline-secondary"
            onClick={() => handleWeekShift(-1)}
            aria-label={t('grid.prevWeek')}
            className="d-flex align-items-center justify-content-center"
            style={{ width: '40px', height: '38px' }}
          >
            <i className="fas fa-chevron-left"></i>
          </Button>
          <Button
            variant="outline-secondary"
            onClick={() => handleWeekShift(1)}
            aria-label={t('grid.nextWeek')}
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
            <strong>{t('grid.missingDays') || 'Missing days:'}:</strong>
            {missingDaysSummary.length > 0 ? (
              missingDaysSummary.map((user) => (
                <span key={user.id} className="badge bg-light text-dark border d-flex align-items-center gap-2">
                  <span
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      backgroundColor: user.color,
                      display: 'inline-block',
                    }}
                  />
                  {user.name}: {formatDayValue(user.missingDays)} j
                </span>
              ))
            ) : (
              <span className="text-muted">{t('stats.allUsers')}</span>
            )}
          </div>
        </Col>
      </Row>

      {loading ? (
        <p>{t('common.loading')}</p>
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
              <div className="gantt-empty">{t('common.noData')}</div>
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
                      style={{ backgroundColor: row.userCouleur }}
                    />
                    <span className="gantt-user-name">{row.userNom}</span>
                    <span className="gantt-project-name">· {row.projectNom}</span>
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
                            handleSlotClick(row.userId, row.projectId, slotIndex);
                          }}
                          title={t('grid.clickToAdd') || 'Click to add a time entry'}
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
                            ...getMotifStyle(row.projectCouleur, row.projectMotif),
                          }}
                          title={`${row.userNom} · ${row.projectNom}${bar.pointage.note ? ` · 📝 ${bar.pointage.note}` : ''} · Clic gauche: modifier · Clic droit: supprimer · Poignées: étirer/réduire`}
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
                            title={t('grid.resizeStart') || 'Resize start'}
                          />
                          <div
                            className="gantt-bar-handle gantt-bar-handle-end"
                            onMouseDown={(event) => startGanttResize(event, bar, 'end')}
                            onClick={(event) => event.stopPropagation()}
                            title={t('grid.resizeEnd') || 'Resize end'}
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

          {isSynthesisView && (
            <div>
              {syntheseData.projects.length === 0 ? (
<p className="text-center text-muted py-4">{t('common.noData')}</p>
              ) : (
                <div className="table-responsive">
                  <Table bordered hover className="pointage-table">
                    <thead>
                      <tr>
                        <th>{t('timeEntry.project')}</th>
                        <th>{t('project.trackingCode')}</th>
                        {syntheseData.users.map((u) => (
                          <th key={u?.id} className="text-center">
                            <div className="d-flex align-items-center justify-content-center gap-1">
                              <span
                                style={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: '50%',
                                  backgroundColor: u?.color || '#ccc',
                                  display: 'inline-block',
                                  flexShrink: 0,
                                }}
                              />
                              {u?.name || 'N/A'}
                            </div>
                          </th>
                        ))}
                        <th className="text-center fw-bold">{t('grid.total') || 'Total'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {syntheseData.projects.map((project) => {
                        const projectId = project?.id ?? 'unknown';
                        const rowCells = syntheseData.users.map((u) => {
                          const userId = u?.id ?? 'unknown';
                          return syntheseData.cellData[projectId]?.[userId] || 0;
                        });
                        const rowTotal = rowCells.reduce((s, v) => s + v, 0);
                        return (
                          <tr key={projectId}>
                            <td>
                              <div className="d-flex align-items-center gap-2">
                                <div
                                  style={{
                                    width: 18,
                                    height: 18,
                                    borderRadius: 3,
                                    border: '1px solid #999',
                                    flexShrink: 0,
                                    ...getMotifStyle(project?.color || '#ccc', project?.pattern || 'solid'),
                                  }}
                                />
                                {project?.name || 'N/A'}
                              </div>
                            </td>
                            <td className="text-center" style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                              {project?.tracking_code?.code || ''}
                            </td>
                            {rowCells.map((val, i) => (
                              <td key={i} className="text-center" style={{ fontFamily: 'monospace' }}>
                                {val > 0 ? formatDayValue(val) : '—'}
                              </td>
                            ))}
                            <td className="text-center fw-bold" style={{ fontFamily: 'monospace' }}>
                              {formatDayValue(rowTotal)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="fw-bold">
                        <td colSpan={2}>Total</td>
                        {syntheseData.users.map((u) => {
                          const userId = u?.id ?? 'unknown';
                          const colTotal = syntheseData.projects.reduce((s, proj) => {
                            const pid = proj?.id ?? 'unknown';
                            return s + (syntheseData.cellData[pid]?.[userId] || 0);
                          }, 0);
                          return (
                            <td key={userId} className="text-center" style={{ fontFamily: 'monospace' }}>
                              {formatDayValue(colTotal)}
                            </td>
                          );
                        })}
                        <td className="text-center" style={{ fontFamily: 'monospace' }}>
                          {formatDayValue(
                            syntheseData.projects.reduce((s, proj) => {
                              const pid = proj?.id ?? 'unknown';
                              return s + syntheseData.users.reduce((ss, u) => {
                                const userId = u?.id ?? 'unknown';
                                return ss + (syntheseData.cellData[pid]?.[userId] || 0);
                              }, 0);
                            }, 0)
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </Table>
                </div>
              )}
            </div>
          )}

          {isTableView && groupedView && (
          <Table striped bordered hover className="pointage-table">
            <thead>
              <tr>
                <th>{t('timeEntry.user')}</th>
                <th>{t('timeEntry.project')}</th>
                <th>{t('project.trackingCode')}</th>
                <th className="text-center">{t('grid.total') || 'Total Day(s)'}</th>
              </tr>
            </thead>
            <tbody>
              {groupedTimeEntries.map((row) => (
                <tr key={row.key}>
                  <td className="text-center" style={{ fontFamily: 'monospace' }}>
                    <div className="d-flex align-items-center justify-content-center">
                      <div
                        style={{
                          width: '20px',
                          height: '20px',
                          backgroundColor: row.user?.color || '#ccc',
                          border: '1px solid #999',
                          borderRadius: '3px',
                          marginRight: '8px',
                        }}
                      />
                      {row.user?.name || 'N/A'}
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
                          ...getMotifStyle(row.project?.color || '#ccc', row.project?.pattern || 'solid'),
                        }}
                        title={`${row.project?.color || '#ccc'} · ${row.project?.pattern || 'solid'}`}
                      />
                      {row.project?.name || 'N/A'}
                    </div>
                  </td>
                  <td className="text-center" style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                    {row.project?.tracking_code?.code || ''}
                  </td>
                  <td className="text-center" style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '0.95rem' }}>
                    {formatDayValue(row.totalJours)}
                  </td>
                </tr>
              ))}
              {groupedTimeEntries.length === 0 && (
                <tr>
                  <td colSpan="4" className="text-center">
                    {t('common.noData')}
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
          )}

          {isTableView && !groupedView && (
          <Table striped bordered hover className="pointage-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('user')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  Utilisateur {renderSortIcon('user')}
                </th>
                <th onClick={() => handleSort('project')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  Projet {renderSortIcon('project')}
                </th>
                <th onClick={() => handleSort('days')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  {t('grid.days') || 'Day(s)'} {renderSortIcon('days')}
                </th>
                <th>{t('project.trackingCode')}</th>
                <th onClick={() => handleSort('start_date')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  Début {renderSortIcon('start_date')}
                </th>
                <th onClick={() => handleSort('end_date')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  Fin {renderSortIcon('end_date')}
                </th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedTimeEntries.map((item) => (
              <tr key={item.id}>
                <td className="text-center" style={{ fontFamily: 'monospace' }}>
                  <div className="d-flex align-items-center justify-content-center">
                    <div
                      style={{
                        width: '20px',
                        height: '20px',
                        backgroundColor: item.user?.color || '#ccc',
                        border: '1px solid #999',
                        borderRadius: '3px',
                        marginRight: '8px',
                      }}
                    />
                    {item.user?.name || 'N/A'}
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
                        ...getMotifStyle(item.project?.color || '#ccc', item.project?.pattern || 'solid'),
                      }}
                      title={`${item.project?.color || '#ccc'} · ${item.project?.pattern || 'solid'}`}
                    />
                    {item.project?.name || 'N/A'}
                  </div>
                </td>
                <td className="text-center" style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '0.95rem' }}>
                  {calculateDays(item.start_date, item.start_period, item.end_date, item.end_period)}
                </td>
                <td className="text-center" style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                  {item.project?.tracking_code?.code || ''}
                </td>
                <td className="text-center" style={{ fontFamily: 'monospace', fontSize: '0.95rem' }}>
                  {formatDateDDMMYYYY(item.start_date)}
                  {' '}
                  <span style={{ fontSize: '0.85rem', fontStyle: 'italic', textTransform: 'lowercase' }}>
                    ({PERIODE_LABELS[item.start_period] || item.start_period})
                  </span>
                </td>
                <td className="text-center" style={{ fontFamily: 'monospace', fontSize: '0.95rem' }}>
                  {formatDateDDMMYYYY(item.end_date)}
                  {' '}
                  <span style={{ fontSize: '0.85rem', fontStyle: 'italic', textTransform: 'lowercase' }}>
                    ({PERIODE_LABELS[item.end_period] || item.end_period})
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
              {timeEntries.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-center">
                    {t('common.noData')}
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
            {editingItem ? t('timeEntry.edit') : t('timeEntry.new')}
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            {error && <Alert variant="danger">{error}</Alert>}
            <Form.Group className="mb-3">
              <Form.Label>{t('timeEntry.user')}</Form.Label>
              <Select
                options={userOptions}
                value={userOptions.find(opt => opt.value === parseInt(formData.user_id)) || null}
                onChange={(selectedOption) => {
                  const newUserId = selectedOption ? selectedOption.value : '';
                  if (!editingItem) {
                    const selectedYear = parseInt(filters.year, 10) || CURRENT_WEEK_INFO.year;
                    const selectedWeek = parseInt(filters.week_number, 10) || CURRENT_WEEK_INFO.week;
                    const firstAvailable = findFirstAvailableSlot(newUserId, selectedYear, selectedWeek);

                    setFormData((prev) => ({
                      ...prev,
                      user_id: newUserId,
                      start_date: firstAvailable.date,
                      start_period: firstAvailable.periode,
                      end_date: firstAvailable.date,
                      end_period: 'evening',
                    }));
                  } else {
                    setFormData({ ...formData, user_id: newUserId });
                  }
                }}
                isClearable
                placeholder={t('grid.selectUser')}
                styles={customSelectStyles}
                classNamePrefix="rs"
                className="rs-select"
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>{t('timeEntry.project')}</Form.Label>
              <Select
                options={projectOptions}
                value={projectOptions.find(opt => opt.value === parseInt(formData.project_id)) || null}
                onChange={(selectedOption) => {
                  const newProjetId = selectedOption ? selectedOption.value : '';
                  const newProjetNom = selectedOption ? selectedOption.label : '';
                  setFormData({ ...formData, project_id: newProjetId });
                  setProjectSearchText(newProjetNom);
                }}
                onInputChange={(inputValue) => {
                  setProjectSearchText(inputValue);
                }}
                isClearable
                placeholder={t('project.namePlaceholder')}
                styles={customSelectStyles}
                classNamePrefix="rs"
                className="rs-select"
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>
                {t('timeEntry.startDate')}
                {formData.start_date && (
                  <span style={{ fontStyle: 'italic', marginLeft: '8px', color: '#6c757d' }}>
                    ({getDayName(formData.start_date)})
                  </span>
                )}
              </Form.Label>
              <Form.Control
                type="date"
                lang="fr-FR"
                value={formData.start_date}
                onChange={(e) => handleDateDebutChange(e.target.value)}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>{t('timeEntry.startPeriod')}</Form.Label>
              <div className="period-switch" role="radiogroup" aria-label="Période de début">
                {PERIODES_DEBUT.map((periode) => (
                  <button
                    key={periode.value}
                    type="button"
                    className={`period-switch-option ${formData.start_period === periode.value ? 'active' : ''}`}
                    onClick={() => handlePeriodeDebutChange(periode.value)}
                  >
                    {t(`periods.${periode.value}`)}
                  </button>
                ))}
              </div>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>
                {t('timeEntry.endDate')}
                {formData.end_date && (
                  <span style={{ fontStyle: 'italic', marginLeft: '8px', color: '#6c757d' }}>
                    ({getDayName(formData.end_date)})
                  </span>
                )}
              </Form.Label>
              <Form.Control
                type="date"
                lang="fr-FR"
                value={formData.end_date}
                onChange={(e) => handleDateFinChange(e.target.value)}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>{t('timeEntry.endPeriod')}</Form.Label>
              <div className="period-switch" role="radiogroup" aria-label="Période de fin">
                {PERIODES_FIN.map((periode) => {
                  const isDisabled = formData.start_date === formData.end_date
                    && PERIODE_ORDER[periode.value] <= PERIODE_ORDER[formData.start_period];
                  return (
                    <button
                      key={periode.value}
                      type="button"
                      className={`period-switch-option ${formData.end_period === periode.value ? 'active' : ''}`}
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
                <span className="text-muted ms-1" style={{ fontSize: '0.85em', fontWeight: 'normal' }}>{t('common.optional') || '(optional)'}</span>
              </Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                placeholder={t('common.addNote')}
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                style={{ resize: 'vertical' }}
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

      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)} centered>
        <Modal.Header closeButton style={{ borderColor: '#dc3545' }}>
          <Modal.Title style={{ color: '#dc3545' }}>
            <i className="fas fa-trash me-2" style={{ color: '#dc3545' }}></i>
            {t('timeEntry.deleteTitle') || 'Delete time entry'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {itemToDelete && (
            <div>
              <p className="mb-3">
                {t('timeEntry.deleteConfirm')}
              </p>
              <div className="alert alert-light mb-3" role="alert">
                <div className="mb-2">
                  <strong>{t('timeEntry.user')}:</strong> {itemToDelete.user?.name || 'N/A'}
                </div>
                <div className="mb-2">
                  <strong>{t('timeEntry.project')}:</strong> {itemToDelete.project?.name || 'N/A'}
                </div>
                <div>
                  <strong>{t('timeEntry.period') || 'Period'}:</strong> {formatDateDDMMYYYY(itemToDelete.start_date)} au {formatDateDDMMYYYY(itemToDelete.end_date)}
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
            {t('grid.conflictDetected') || 'Conflict detected'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
          <div>
            <p className="mb-3">
              La période sélectionnée chevauche {conflictingTimeEntries.length} pointage(s) existant(s).
            </p>
            <div className="alert alert-warning mb-3" role="alert">
              <strong>Pointages en conflit :</strong>
              <ul className="mb-0 mt-2">
                {conflictingTimeEntries.map((conflict) => (
                  <li key={conflict.id}>
                    <strong>{conflict.project?.name || 'N/A'}</strong> -
                    {' '}{formatDateDDMMYYYY(conflict.start_date)} ({PERIODE_LABELS[conflict.start_period] || conflict.start_period})
                    {' '}au {formatDateDDMMYYYY(conflict.end_date)} ({PERIODE_LABELS[conflict.end_period] || conflict.end_period})
                  </li>
                ))}
              </ul>
            </div>
            <div className="alert alert-danger mb-0" role="alert">
              ⚠️ En confirmant, ces timeEntries seront supprimés définitivement avant d'enregistrer le nouveau.
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

export default TimeEntryGrid;
