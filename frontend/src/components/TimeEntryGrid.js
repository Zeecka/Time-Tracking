import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Table, Button, Modal, Form, Alert, Row, Col } from 'react-bootstrap';
import { Link, useSearchParams } from 'react-router-dom';
import Select from 'react-select';
import { useTranslation } from 'react-i18next';
import { timeEntryAPI, userAPI, projectAPI } from '../services/api';
import './TimeEntryGrid.css';

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

const formatShortDate = (date, locale = 'en-US') => new Intl.DateTimeFormat(locale, {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
}).format(date);

const formatDateDDMMYYYY = (dateString) => {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-');
  return `${day}/${month}/${year}`;
};

const getDayName = (dateString, locale = 'en-US') => {
  if (!dateString) return '';
  const date = new Date(dateString + 'T00:00:00Z');
  return new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(date);
};

const calculateDays = (startDate, startPeriod, endDate, endPeriod) => {
  if (!startDate || !endDate) return 0;

  const rangeStart = new Date(startDate);
  const rangeEnd = new Date(endDate);
  const diffTime = rangeEnd - rangeStart;
  const diffDays = diffTime / (1000 * 60 * 60 * 24);

  let days = diffDays;

  if (startDate === endDate) {
    if (startPeriod === 'morning' && endPeriod === 'evening') {
      days = 1;
    } else if (startPeriod === 'morning' && endPeriod === 'midday') {
      days = 0.5;
    } else if (startPeriod === 'midday' && endPeriod === 'evening') {
      days = 0.5;
    } else {
      days = 0.5;
    }
  } else {
    if (startPeriod === 'midday') {
      days -= 0.5;
    }
    if (endPeriod === 'midday') {
      days += 0.5;
    } else {
      days += 1;
    }
  }

  return Math.max(0, days);
};

const CURRENT_WEEK_INFO = getCurrentIsoWeekInfo();
const START_PERIOD_OPTIONS = [
  { value: 'morning', label: 'morning' },
  { value: 'midday', label: 'midday' },
];
const END_PERIOD_OPTIONS = [
  { value: 'midday', label: 'midday' },
  { value: 'evening', label: 'evening' },
];
const PERIOD_ORDER = { morning: 0, midday: 1, evening: 2 };
const LEGACY_START_PERIOD_MAP = { journee: 'morning', apres_midi: 'midday' };
const LEGACY_END_PERIOD_MAP = { journee: 'evening', apres_midi: 'midday' };
const EXPECTED_WEEK_DAYS = 5;

const normalizePeriodValue = (value, isStart) => {
  if (isStart && LEGACY_START_PERIOD_MAP[value]) {
    return LEGACY_START_PERIOD_MAP[value];
  }
  if (!isStart && LEGACY_END_PERIOD_MAP[value]) {
    return LEGACY_END_PERIOD_MAP[value];
  }
  return value;
};

const getPatternStyle = (color, pattern) => {
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
  const { t, i18n } = useTranslation();
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

  const overlapErrorPrefix = 'This time entry overlaps an existing entry for this user';
  const isOverlapApiError = useCallback((rawError) => (
    typeof rawError === 'string' && rawError.startsWith(overlapErrorPrefix)
  ), []);

  const localizeApiError = useCallback((rawError, fallbackKey) => {
    if (!rawError) {
      return t(fallbackKey);
    }

    if (isOverlapApiError(rawError)) {
      const projectMatch = rawError.match(/\(project:\s*(.+)\)$/i);
      return t('timeEntry.errorOverlapWithProject', {
        project: projectMatch?.[1] || t('common.notAvailable'),
      });
    }

    return rawError;
  }, [isOverlapApiError, t]);

  const currentLocale = useMemo(() => {
    const requestedLocale = i18n.resolvedLanguage || i18n.language;
    if (!requestedLocale) {
      return 'en-US';
    }

    const supportedLocales = Intl.DateTimeFormat.supportedLocalesOf([requestedLocale]);
    return supportedLocales[0] || 'en-US';
  }, [i18n.language, i18n.resolvedLanguage]);

  const getPeriodLabel = useCallback((value) => {
    const keyMap = {
      morning: 'periods.morning',
      midday: 'periods.midday',
      evening: 'periods.evening',
      journee: 'periods.fullDay',
      apres_midi: 'periods.afternoon',
    };

    const key = keyMap[value];
    return key ? t(key) : value;
  }, [t]);

  useEffect(() => {
    ganttResizeStateRef.current = ganttResizeState;
  }, [ganttResizeState]);

  const loadTimeEntries = useCallback(async (filterParams) => {
    try {
      setLoading(true);
      const response = await timeEntryAPI.getAll(filterParams);
      setTimeEntries(response.data);
    } catch (err) {
      setError(t('timeEntry.errorLoad'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadUsers = useCallback(async () => {
    try {
      const response = await userAPI.getAll();
      setUsers(response.data);
    } catch (err) {
      console.error('Error loading users', err);
    }
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const response = await projectAPI.getAll();
      setProjects(response.data);
    } catch (err) {
      console.error('Error loading projects', err);
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
    const normalizeStartPeriod = (value) => {
      if (value === 'journee') return 'morning';
      if (value === 'apres_midi') return 'midday';
      return value === 'midday' ? 'midday' : 'morning';
    };

    const normalizeEndPeriod = (value) => {
      if (value === 'journee') return 'evening';
      if (value === 'apres_midi') return 'midday';
      return value === 'midday' ? 'midday' : 'evening';
    };

    if (item) {
      setEditingItem(item);
      const selectedProject = projects.find((p) => p.id === item.project_id);
      setProjectSearchText(selectedProject ? selectedProject.name : '');
      setFormData({
        start_date: item.start_date,
        start_period: normalizeStartPeriod(item.start_period),
        end_date: item.end_date,
        end_period: normalizeEndPeriod(item.end_period),
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
        start_period: firstAvailable.period,
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
    const hasConflict = await openConflictModalForData(data, editingItem);

    if (hasConflict) {
      // Il y a des conflits, demander confirmation
    } else {
      // Pas de conflit, sauvegarder directement
      try {
        await saveTimeEntry(data, editingItem);
      } catch (err) {
        const rawError = err.response?.data?.error;
        if (isOverlapApiError(rawError)) {
          const fallbackOpened = await openConflictModalForData(data, editingItem);
          if (fallbackOpened) {
            return;
          }
        }
        setError(localizeApiError(rawError, 'timeEntry.errorSave'));
      }
    }
  };

  const saveTimeEntry = async (data, editItem) => {
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
      setError(localizeApiError(err.response?.data?.error, 'timeEntry.errorDelete'));
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
      period: isAfternoon ? 'midday' : 'morning',
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
        period: isAfternoon ? 'midday' : 'morning',
      };
    }

    const adjustedIndex = safeBoundary - 1;
    const dayIndex = Math.floor(adjustedIndex / 2);
    const isMiddayBoundary = adjustedIndex % 2 === 0;
    const date = new Date(startOfWeekUtc);
    date.setUTCDate(startOfWeekUtc.getUTCDate() + dayIndex);

    return {
      date: date.toISOString().split('T')[0],
      period: isMiddayBoundary ? 'midday' : 'evening',
    };
  }, [startOfWeekUtc]);

  const computeOverlappingTimeEntries = useCallback((entries, userId, startDate, startPeriod, endDate, endPeriod, excludeId = null) => {
    return entries.filter((p) => {
      if (excludeId && p.id === excludeId) return false;
      if (p.user_id !== userId) return false;

      const newStart = new Date(startDate + 'T00:00:00Z');
      const newEnd = new Date(endDate + 'T00:00:00Z');
      const newStartPeriod = normalizePeriodValue(startPeriod, true);
      const newEndPeriod = normalizePeriodValue(endPeriod, false);

      const pStart = new Date(p.start_date + 'T00:00:00Z');
      const pEnd = new Date(p.end_date + 'T00:00:00Z');
      const pStartPeriod = normalizePeriodValue(p.start_period, true);
      const pEndPeriod = normalizePeriodValue(p.end_period, false);

      if (newEnd < pStart || newStart > pEnd) return false;

      if (newEnd.getTime() === pStart.getTime()) {
        if (newEndPeriod === 'midday' && pStartPeriod === 'midday') return false;
        if (newEndPeriod === 'midday' && pStartPeriod === 'morning') return false;
      }

      if (newStart.getTime() === pEnd.getTime()) {
        if (newStartPeriod === 'midday' && pEndPeriod === 'midday') return false;
      }

      if (startDate === endDate && p.start_date === p.end_date && startDate === p.start_date) {
        if (newStartPeriod === 'morning' && newEndPeriod === 'midday' && pStartPeriod === 'midday' && pEndPeriod === 'evening') {
          return false;
        }
        if (newStartPeriod === 'midday' && newEndPeriod === 'evening' && pStartPeriod === 'morning' && pEndPeriod === 'midday') {
          return false;
        }
      }

      return true;
    });
  }, []);

  const findOverlappingTimeEntries = useCallback((userId, startDate, startPeriod, endDate, endPeriod, excludeId = null) => (
    computeOverlappingTimeEntries(
      timeEntries,
      userId,
      startDate,
      startPeriod,
      endDate,
      endPeriod,
      excludeId
    )
  ), [computeOverlappingTimeEntries, timeEntries]);

  const openConflictModalForData = useCallback(async (data, editItem = null) => {
    let conflicts = computeOverlappingTimeEntries(
      timeEntries,
      data.user_id,
      data.start_date,
      data.start_period,
      data.end_date,
      data.end_period,
      editItem?.id
    );

    if (conflicts.length === 0) {
      try {
        const response = await timeEntryAPI.getAll(filters);
        const latestEntries = response.data || [];
        setTimeEntries(latestEntries);
        conflicts = computeOverlappingTimeEntries(
          latestEntries,
          data.user_id,
          data.start_date,
          data.start_period,
          data.end_date,
          data.end_period,
          editItem?.id
        );
      } catch (refreshErr) {
        console.error('Error refreshing entries for conflict detection', refreshErr);
      }
    }

    if (conflicts.length === 0) {
      return false;
    }

    setPendingFormData(data);
    setPendingEditingItem(editItem);
    setConflictingTimeEntries(conflicts);
    setShowConflictModal(true);
    setError('');
    return true;
  }, [computeOverlappingTimeEntries, filters, timeEntries]);

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
      entryId: bar.id,
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

      const targetTimeEntry = timeEntries.find((item) => item.id === resizeData.entryId);
      if (!targetTimeEntry) {
        return;
      }

      const nextStart = getDateAndPeriodFromBoundary(resizeData.currentStartSlot, true);
      const nextEnd = getDateAndPeriodFromBoundary(resizeData.currentEndSlot, false);
      const hasChanged = (
        nextStart.date !== targetTimeEntry.start_date
        || nextStart.period !== normalizePeriodValue(targetTimeEntry.start_period, true)
        || nextEnd.date !== targetTimeEntry.end_date
        || nextEnd.period !== normalizePeriodValue(targetTimeEntry.end_period, false)
      );

      if (!hasChanged) {
        return;
      }

      const conflicts = findOverlappingTimeEntries(
        targetTimeEntry.user_id,
        nextStart.date,
        nextStart.period,
        nextEnd.date,
        nextEnd.period,
        targetTimeEntry.id
      );

      if (conflicts.length > 0) {
        setPendingFormData({
          start_date: nextStart.date,
          start_period: nextStart.period,
          end_date: nextEnd.date,
          end_period: nextEnd.period,
          week_number: targetTimeEntry.week_number,
          year: targetTimeEntry.year,
          user_id: targetTimeEntry.user_id,
          project_id: targetTimeEntry.project_id,
          note: targetTimeEntry.note || '',
        });
        setPendingEditingItem(targetTimeEntry);
        setConflictingTimeEntries(conflicts);
        setShowConflictModal(true);
        return;
      }

      try {
        const resizedData = {
          start_date: nextStart.date,
          start_period: nextStart.period,
          end_date: nextEnd.date,
          end_period: nextEnd.period,
          week_number: targetTimeEntry.week_number,
          year: targetTimeEntry.year,
          user_id: targetTimeEntry.user_id,
          project_id: targetTimeEntry.project_id,
          note: targetTimeEntry.note || '',
        };
        await timeEntryAPI.update(targetTimeEntry.id, resizedData);
        await loadTimeEntries(filters);
      } catch (err) {
        const rawError = err.response?.data?.error;
        if (isOverlapApiError(rawError)) {
          const resizedData = {
            start_date: nextStart.date,
            start_period: nextStart.period,
            end_date: nextEnd.date,
            end_period: nextEnd.period,
            week_number: targetTimeEntry.week_number,
            year: targetTimeEntry.year,
            user_id: targetTimeEntry.user_id,
            project_id: targetTimeEntry.project_id,
            note: targetTimeEntry.note || '',
          };
          const fallbackOpened = await openConflictModalForData(
            resizedData,
            targetTimeEntry
          );
          if (fallbackOpened) {
            return;
          }
        }
        setError(localizeApiError(rawError, 'timeEntry.errorResize'));
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
  }, [filters, findOverlappingTimeEntries, ganttResizeState, getDateAndPeriodFromBoundary, isOverlapApiError, loadTimeEntries, localizeApiError, openConflictModalForData, timeEntries]);

  const handleSlotClick = (userId, projectId, slotIndex) => {
    const slotData = getDateAndPeriodFromSlot(slotIndex);

    openSlotCreation({
      user_id: userId,
      project_id: projectId,
      start_date: slotData.date,
      start_period: slotData.period,
      end_date: slotData.date,
      end_period: slotData.period === 'morning' ? 'midday' : 'evening',
    });
  };

  const openSlotCreation = (slotData) => {
    setEditingItem(null);
    const selectedProject = projects.find((p) => p.id === slotData.project_id);
    setProjectSearchText(selectedProject ? selectedProject.name : '');
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
      await saveTimeEntry(
        { ...pendingFormData, overwrite_conflicts: true },
        pendingEditingItem
      );

      // Clear conflict state only if everything succeeded.
      setShowConflictModal(false);
      setConflictingTimeEntries([]);
      setPendingFormData(null);
      setPendingEditingItem(null);
    } catch (err) {
      console.error('Error resolving conflicts:', err);
      const errorMsg = localizeApiError(
        err.response?.data?.error || err.message,
        'timeEntry.errorResolveConflicts'
      );
      setError(errorMsg);
      // Keep the modal open so the user can retry.
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

  const handleStartDateChange = (value) => {
    setFormData((prev) => {
      const next = { ...prev, start_date: value };
      if (next.end_date && next.end_date < next.start_date) {
        next.end_date = next.start_date;
        next.end_period = 'evening';
      }
      if (next.start_date === next.end_date && PERIOD_ORDER[next.end_period] <= PERIOD_ORDER[next.start_period]) {
        next.end_period = 'evening';
      }
      return next;
    });
  };

  const handleEndDateChange = (value) => {
    setFormData((prev) => {
      const next = { ...prev, end_date: value };
      if (next.start_date === next.end_date && PERIOD_ORDER[next.end_period] <= PERIOD_ORDER[next.start_period]) {
        next.end_period = next.start_period === 'midday' ? 'evening' : 'midday';
      }
      return next;
    });
  };

  const handleStartPeriodChange = (value) => {
    setFormData((prev) => {
      const next = { ...prev, start_period: value };
      if (next.end_date && next.end_date < next.start_date) {
        next.end_date = next.start_date;
        next.end_period = 'evening';
      }
      if (next.start_date === next.end_date && PERIOD_ORDER[next.end_period] <= PERIOD_ORDER[value]) {
        next.end_period = 'evening';
      }
      return next;
    });
  };

  const handleEndPeriodChange = (value) => {
    setFormData((prev) => ({ ...prev, end_period: value }));
  };

  const findFirstAvailableSlot = (userId, weekYear, weekNumber) => {
    if (!userId) {
      const dateRange = getIsoWeekDateRange(weekYear, weekNumber);
      return { date: dateRange.start_date, period: 'morning' };
    }

    const userEntries = timeEntries.filter(
      (p) => p.user_id === parseInt(userId) &&
             p.year === weekYear &&
             p.week_number === weekNumber
    );

    if (userEntries.length === 0) {
      const dateRange = getIsoWeekDateRange(weekYear, weekNumber);
      return { date: dateRange.start_date, period: 'morning' };
    }

    const occupiedSlots = new Set();
    userEntries.forEach((p) => {
      const start = new Date(p.start_date + 'T00:00:00Z');
      const end = new Date(p.end_date + 'T00:00:00Z');
      const startPeriod = normalizePeriodValue(p.start_period, true);
      const endPeriod = normalizePeriodValue(p.end_period, false);

      const daysCount = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
      for (let i = 0; i < daysCount; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];

        if (dateStr === p.start_date && dateStr === p.end_date) {
          // Same day
          if (startPeriod === 'morning' && endPeriod === 'evening') {
            occupiedSlots.add(`${dateStr}-morning`);
            occupiedSlots.add(`${dateStr}-midday`);
          } else if (startPeriod === 'morning' && endPeriod === 'midday') {
            occupiedSlots.add(`${dateStr}-morning`);
          } else if (startPeriod === 'midday' && endPeriod === 'evening') {
            occupiedSlots.add(`${dateStr}-midday`);
          } else {
            occupiedSlots.add(`${dateStr}-morning`);
            occupiedSlots.add(`${dateStr}-midday`);
          }
        } else if (dateStr === p.start_date) {
          if (startPeriod === 'morning') {
            occupiedSlots.add(`${dateStr}-morning`);
            occupiedSlots.add(`${dateStr}-midday`);
          } else {
            occupiedSlots.add(`${dateStr}-midday`);
          }
        } else if (dateStr === p.end_date) {
          if (endPeriod === 'evening') {
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
        return { date: dateStr, period: 'morning' };
      }
      if (!occupiedSlots.has(`${dateStr}-midday`)) {
        return { date: dateStr, period: 'midday' };
      }
    }

    return { date: dateRange.start_date, period: 'morning' };
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
          aVal = PERIOD_ORDER[a.start_period] || 0;
          bVal = PERIOD_ORDER[b.start_period] || 0;
          break;
        case 'end_date':
          aVal = a.end_date || '';
          bVal = b.end_date || '';
          break;
        case 'end_period':
          aVal = PERIOD_ORDER[a.end_period] || 0;
          bVal = PERIOD_ORDER[b.end_period] || 0;
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

  const selectedWeekLabel = t('grid.selectedWeekLabel', {
    startDay: t('days.monday'),
    startDate: formatShortDate(selectedWeekRange.monday, currentLocale),
    endDay: t('days.friday'),
    endDate: formatShortDate(selectedWeekRange.friday, currentLocale),
  });
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
          totalDays: 0,
        };
      }
      map[key].totalDays += calculateDays(item.start_date, item.start_period, item.end_date, item.end_period);
    });
    return Object.values(map).sort((a, b) => {
      const userNameA = a.user?.name || '';
      const userNameB = b.user?.name || '';
      const cmp = userNameA.localeCompare(userNameB, currentLocale, { sensitivity: 'base' });
      if (cmp !== 0) return cmp;
      return (a.project?.name || '').localeCompare(b.project?.name || '', currentLocale, { sensitivity: 'base' });
    });
  }, [currentLocale, timeEntries]);

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
        name: user.name || 'N/A',
        color: user.color || '#ccc',
        missingDays: userMissingDaysMap[user.id] ?? EXPECTED_WEEK_DAYS,
      }))
        .sort((a, b) => a.name.localeCompare(b.name, currentLocale, { sensitivity: 'base' }));
      }, [currentLocale, users, userMissingDaysMap]);

  const synthesisData = useMemo(() => {
    const usersMap = {};
    const projectsMap = {};
    const cellData = {};

    groupedTimeEntries.forEach((row) => {
      const userId = row.user?.id ?? 'unknown';
      const projectId = row.project?.id ?? 'unknown';

      usersMap[userId] = row.user;
      projectsMap[projectId] = row.project;

      if (!cellData[projectId]) cellData[projectId] = {};
      cellData[projectId][userId] = (cellData[projectId][userId] || 0) + row.totalDays;
    });

    const users = Object.values(usersMap).sort((a, b) =>
      (a?.name || '').localeCompare(b?.name || '', currentLocale, { sensitivity: 'base' })
    );
    const projects = Object.values(projectsMap).sort((a, b) =>
      (a?.name || '').localeCompare(b?.name || '', currentLocale, { sensitivity: 'base' })
    );

    return { users, projects, cellData };
  }, [currentLocale, groupedTimeEntries]);

  const ganttDays = Array.from({ length: 5 }, (_, index) => {
    const date = new Date(selectedWeekRange.monday);
    date.setUTCDate(selectedWeekRange.monday.getUTCDate() + index);
    return {
      label: new Intl.DateTimeFormat(currentLocale, { weekday: 'short', timeZone: 'UTC' }).format(date),
      shortDate: new Intl.DateTimeFormat(currentLocale, { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(date),
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
    const normalizedPeriod = normalizePeriodValue(period, !isEnd);

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
    const userCmp = (a.user?.name || '').localeCompare(b.user?.name || '', currentLocale, { sensitivity: 'base' });
    if (userCmp !== 0) return userCmp;
    return (a.project?.name || '').localeCompare(b.project?.name || '', currentLocale, { sensitivity: 'base' });
  });

  for (const item of ganttSortedItems) {
    const userId = item.user?.id ?? null;
    const projectId = item.project?.id ?? null;
    const key = `${userId}_${projectId}`;

    if (!ganttGroupMap.has(key)) {
      const row = {
        key,
        userId,
        userName: item.user?.name || 'N/A',
        userColor: item.user?.color || '#ccc',
        projectId,
        projectName: item.project?.name || 'N/A',
        projectColor: item.project?.color || '#6c757d',
        projectPattern: item.project?.pattern || 'solid',
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
      timeEntry: item,
      startSlot: clampedStart,
      endSlot: clampedEnd,
      leftPercent: (clampedStart / 10) * 100,
      widthPercent: (span / 10) * 100,
    });
  }

  const ganttRows = ganttRowsGrouped;

  const isSameUserRow = (currentRow, previousRow) => {
    if (!currentRow || !previousRow) {
      return false;
    }

    if (currentRow.userId !== null && previousRow.userId !== null) {
      return currentRow.userId === previousRow.userId;
    }

    return currentRow.userName === previousRow.userName;
  };

  let userGroupIndex = -1;
  const ganttRowsWithDisplayState = ganttRows.map((row, index) => {
    const previousRow = index > 0 ? ganttRows[index - 1] : null;
    const hasSameUserAsPrevious = isSameUserRow(row, previousRow);

    if (!hasSameUserAsPrevious) {
      userGroupIndex += 1;
    }

    return {
      ...row,
      isNewUserGroup: index > 0 && !hasSameUserAsPrevious,
      isAltUserPairBackground: userGroupIndex % 2 === 0,
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
      setMessage(t('timeEntry.exportCsvSuccess'));
    } catch (err) {
      setError(localizeApiError(err.response?.data?.error, 'timeEntry.errorExportCsv'));
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
        t('timeEntry.importSummary', {
          created: data.created || 0,
          errors: (data.errors || []).length,
        })
      );
      await loadTimeEntries(filters);
    } catch (err) {
      setError(localizeApiError(err.response?.data?.error, 'timeEntry.errorImportCsv'));
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
          <Button variant="outline-secondary" size="sm" as="a" href="/examples/time_entries_example.csv" download className="d-inline-flex align-items-center">
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

      <div className="app-content-panel time-entry-content-panel">
        <div className="time-entry-topbar mb-3">
          <div className="time-entry-topbar-main">
            <div className="app-route-tabs" aria-label={t('timeEntry.title')}>
              <Link
                to={`/time-entries/gantt${weekQueryString}`}
                className={`app-route-tab${isGanttView ? ' active' : ''}`}
              >
                <i className="fas fa-stream"></i>
                <span>{t('grid.ganttView')}</span>
              </Link>
              <Link
                to={`/time-entries/table${weekQueryString}`}
                className={`app-route-tab${isTableView ? ' active' : ''}`}
              >
                <i className="fas fa-table"></i>
                <span>{t('grid.tableView')}</span>
              </Link>
              <Link
                to={`/time-entries/synthesis${weekQueryString}`}
                className={`app-route-tab${isSynthesisView ? ' active' : ''}`}
              >
                <i className="fas fa-th-list"></i>
                <span>{t('grid.synthesisView')}</span>
              </Link>
            </div>
          </div>

          {isTableView && (
            <Button
              type="button"
              variant={groupedView ? 'primary' : 'outline-secondary'}
              size="sm"
              onClick={() => setGroupedView((prev) => !prev)}
              aria-pressed={groupedView}
              className={`time-entry-group-toggle ${groupedView ? 'is-active' : ''}`}
            >
              <i className={`fas ${groupedView ? 'fa-layer-group' : 'fa-bars-staggered'} me-2`}></i>
              <span className="time-entry-group-toggle-text">{t('grid.groupedView')}</span>
              <span className="time-entry-group-toggle-track" aria-hidden="true">
                <span className="time-entry-group-toggle-thumb" />
              </span>
            </Button>
          )}

          <div className="time-entry-period-controls" aria-label={t('grid.weekView')}>
            <Form.Group className="time-entry-period-field mb-0">
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
            <Form.Group className="time-entry-period-field mb-0">
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
            <div className="time-entry-period-nav">
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
            </div>
          </div>
        </div>

        {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
        {message && <Alert variant="success" dismissible onClose={() => setMessage('')}>{message}</Alert>}

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
              <div className="gantt-resource-head">{t('grid.resource')}</div>
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
                    className={`gantt-row ${row.isNewUserGroup ? 'gantt-row-user-separator' : ''} ${row.isAltUserPairBackground ? 'gantt-row-user-pair-alt' : ''}`.trim()}
                  >
                  <div className="gantt-resource-cell">
                    <div
                      className="gantt-user-color"
                      style={{ backgroundColor: row.userColor }}
                    />
                    <span className="gantt-user-name">{row.userName}</span>
                    <span className="gantt-project-name">· {row.projectName}</span>
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
                      const isResizingBar = ganttResizeState?.entryId === bar.id;
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
                            ...getPatternStyle(row.projectColor, row.projectPattern),
                          }}
                          title={`${row.userName} · ${row.projectName}${bar.timeEntry.note ? ` · 📝 ${bar.timeEntry.note}` : ''} · ${t('grid.ganttLeftClick')} · ${t('grid.ganttRightClick')} · ${t('grid.ganttResize')}`}
                          onClick={() => {
                            if (ganttResizeState || Date.now() < suppressGanttClickUntilRef.current) {
                              return;
                            }
                            handleShowModal(bar.timeEntry);
                          }}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            if (ganttResizeState || Date.now() < suppressGanttClickUntilRef.current) {
                              return;
                            }
                            handleDeleteClick(bar.timeEntry);
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
              {synthesisData.projects.length === 0 ? (
<p className="text-center text-muted py-4">{t('common.noData')}</p>
              ) : (
                <div className="table-responsive record-table-wrap">
                  <Table hover className="record-table">
                    <thead>
                      <tr>
                        <th>{t('timeEntry.project')}</th>
                        <th>{t('project.trackingCode')}</th>
                        {synthesisData.users.map((u) => (
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
                      {synthesisData.projects.map((project) => {
                        const projectId = project?.id ?? 'unknown';
                        const rowCells = synthesisData.users.map((u) => {
                          const userId = u?.id ?? 'unknown';
                          return synthesisData.cellData[projectId]?.[userId] || 0;
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
                                    ...getPatternStyle(project?.color || '#ccc', project?.pattern || 'solid'),
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
                        <td colSpan={2}>{t('grid.total') || 'Total'}</td>
                        {synthesisData.users.map((u) => {
                          const userId = u?.id ?? 'unknown';
                          const colTotal = synthesisData.projects.reduce((s, proj) => {
                            const pid = proj?.id ?? 'unknown';
                            return s + (synthesisData.cellData[pid]?.[userId] || 0);
                          }, 0);
                          return (
                            <td key={userId} className="text-center" style={{ fontFamily: 'monospace' }}>
                              {formatDayValue(colTotal)}
                            </td>
                          );
                        })}
                        <td className="text-center" style={{ fontFamily: 'monospace' }}>
                          {formatDayValue(
                            synthesisData.projects.reduce((s, proj) => {
                              const pid = proj?.id ?? 'unknown';
                              return s + synthesisData.users.reduce((ss, u) => {
                                const userId = u?.id ?? 'unknown';
                                return ss + (synthesisData.cellData[pid]?.[userId] || 0);
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
          <div className="record-table-wrap">
          <Table striped hover className="record-table">
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
                          ...getPatternStyle(row.project?.color || '#ccc', row.project?.pattern || 'solid'),
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
                    {formatDayValue(row.totalDays)}
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
          </div>
          )}

          {isTableView && !groupedView && (
          <div className="record-table-wrap">
          <Table striped hover className="record-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('user')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  {t('timeEntry.user')} {renderSortIcon('user')}
                </th>
                <th onClick={() => handleSort('project')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  {t('timeEntry.project')} {renderSortIcon('project')}
                </th>
                <th onClick={() => handleSort('days')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  {t('grid.days') || 'Day(s)'} {renderSortIcon('days')}
                </th>
                <th>{t('project.trackingCode')}</th>
                <th onClick={() => handleSort('start_date')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  {t('timeEntry.startDate')} {renderSortIcon('start_date')}
                </th>
                <th onClick={() => handleSort('end_date')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  {t('timeEntry.endDate')} {renderSortIcon('end_date')}
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
                        ...getPatternStyle(item.project?.color || '#ccc', item.project?.pattern || 'solid'),
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
                  <span style={{ fontSize: '0.85rem', fontStyle: 'italic' }}>
                    ({getPeriodLabel(item.start_period)})
                  </span>
                </td>
                <td className="text-center" style={{ fontFamily: 'monospace', fontSize: '0.95rem' }}>
                  {formatDateDDMMYYYY(item.end_date)}
                  {' '}
                  <span style={{ fontSize: '0.85rem', fontStyle: 'italic' }}>
                    ({getPeriodLabel(item.end_period)})
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
          </div>
          )}
        </>
        )}
      </div>

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
                      start_period: firstAvailable.period,
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
                  const newProjectId = selectedOption ? selectedOption.value : '';
                  const newProjectName = selectedOption ? selectedOption.label : '';
                  setFormData({ ...formData, project_id: newProjectId });
                  setProjectSearchText(newProjectName);
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
                    ({getDayName(formData.start_date, currentLocale)})
                  </span>
                )}
              </Form.Label>
              <Form.Control
                type="date"
                lang={currentLocale}
                value={formData.start_date}
                onChange={(e) => handleStartDateChange(e.target.value)}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>{t('timeEntry.startPeriod')}</Form.Label>
              <div className="period-switch" role="radiogroup" aria-label="Période de début">
                {START_PERIOD_OPTIONS.map((periodOption) => (
                  <button
                    key={periodOption.value}
                    type="button"
                    className={`period-switch-option ${formData.start_period === periodOption.value ? 'active' : ''}`}
                    onClick={() => handleStartPeriodChange(periodOption.value)}
                  >
                    {t(`periods.${periodOption.value}`)}
                  </button>
                ))}
              </div>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>
                {t('timeEntry.endDate')}
                {formData.end_date && (
                  <span style={{ fontStyle: 'italic', marginLeft: '8px', color: '#6c757d' }}>
                    ({getDayName(formData.end_date, currentLocale)})
                  </span>
                )}
              </Form.Label>
              <Form.Control
                type="date"
                lang={currentLocale}
                value={formData.end_date}
                onChange={(e) => handleEndDateChange(e.target.value)}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>{t('timeEntry.endPeriod')}</Form.Label>
              <div className="period-switch" role="radiogroup" aria-label="Période de fin">
                {END_PERIOD_OPTIONS.map((periodOption) => {
                  const isDisabled = formData.start_date === formData.end_date
                    && PERIOD_ORDER[periodOption.value] <= PERIOD_ORDER[formData.start_period];
                  return (
                    <button
                      key={periodOption.value}
                      type="button"
                      className={`period-switch-option ${formData.end_period === periodOption.value ? 'active' : ''}`}
                      onClick={() => !isDisabled && handleEndPeriodChange(periodOption.value)}
                      disabled={isDisabled}
                    >
                      {t(`periods.${periodOption.value}`)}
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
                  <strong>{t('timeEntry.period')}:</strong> {formatDateDDMMYYYY(itemToDelete.start_date)} {t('common.to')} {formatDateDDMMYYYY(itemToDelete.end_date)}
                </div>
              </div>
              <div className="alert alert-warning mb-0" role="alert">
                {t('timeEntry.deleteIrreversible')}
              </div>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={handleConfirmDelete}>
            <i className="fas fa-trash me-2" style={{ color: 'white' }}></i>
            {t('common.delete')}
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
              {t('grid.conflictDescription', { count: conflictingTimeEntries.length })}
            </p>
            <div className="alert alert-warning mb-3" role="alert">
              <strong>{t('grid.conflictEntriesTitle')}</strong>
              <ul className="mb-0 mt-2">
                {conflictingTimeEntries.map((conflict) => (
                  <li key={conflict.id}>
                    <strong>{conflict.project?.name || t('common.notAvailable')}</strong> -
                    {' '}{formatDateDDMMYYYY(conflict.start_date)} ({getPeriodLabel(conflict.start_period)})
                    {' '}{t('common.to')} {formatDateDDMMYYYY(conflict.end_date)} ({getPeriodLabel(conflict.end_period)})
                  </li>
                ))}
              </ul>
            </div>
            <div className="alert alert-danger mb-0" role="alert">
              {t('grid.conflictWarning')}
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleCancelConflict}>
            {t('common.cancel')}
          </Button>
          <Button variant="warning" onClick={handleConfirmConflictAndCreate}>
            <i className="fas fa-check me-2"></i>
            {t('grid.confirmAndSave')}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default TimeEntryGrid;
