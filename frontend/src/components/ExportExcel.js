import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button, Form, Alert, Row, Col, Card, Table } from 'react-bootstrap';
import * as XLSX from 'xlsx';
import { useTranslation } from 'react-i18next';
import { timeEntryAPI } from '../services/api';

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
    start_date: monday.toISOString().split('T')[0],
    end_date: friday.toISOString().split('T')[0],
  };
};

const formatDateDDMMYYYY = (dateString) => {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-');
  return `${day}/${month}/${year}`;
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

const EXPORT_COLUMN_DEFS = [
  {
    id: 'year',
    width: 8,
  },
  {
    id: 'week',
    width: 10,
  },
  {
    id: 'user',
    width: 20,
  },
  {
    id: 'project',
    width: 30,
  },
  {
    id: 'tracking_code',
    width: 15,
  },
  {
    id: 'start_date',
    width: 12,
  },
  {
    id: 'start_period',
    width: 15,
  },
  {
    id: 'end_date',
    width: 12,
  },
  {
    id: 'end_period',
    width: 15,
  },
  {
    id: 'days',
    width: 8,
  },
  {
    id: 'note',
    width: 50,
  },
];

const getPeriodLabel = (period, t) => {
  const keyMap = {
    morning: 'periods.morning',
    midday: 'periods.midday',
    evening: 'periods.evening',
    journee: 'periods.fullDay',
    apres_midi: 'periods.afternoon',
  };

  const key = keyMap[period];
  return key ? t(key) : period;
};

const getExportColumns = (t) => {
  const notAvailable = t('common.notAvailable');

  return EXPORT_COLUMN_DEFS.map((column) => {
    switch (column.id) {
      case 'year':
        return { ...column, label: t('common.year'), getValue: (item) => item.year };
      case 'week':
        return { ...column, label: t('common.week'), getValue: (item) => item.week_number };
      case 'user':
        return { ...column, label: t('timeEntry.user'), getValue: (item) => item.user?.name || notAvailable };
      case 'project':
        return { ...column, label: t('timeEntry.project'), getValue: (item) => item.project?.name || notAvailable };
      case 'tracking_code':
        return { ...column, label: t('project.trackingCode'), getValue: (item) => item.project?.tracking_code?.code || notAvailable };
      case 'start_date':
        return { ...column, label: t('timeEntry.startDate'), getValue: (item) => formatDateDDMMYYYY(item.start_date) };
      case 'start_period':
        return { ...column, label: t('timeEntry.startPeriod'), getValue: (item) => getPeriodLabel(item.start_period, t) };
      case 'end_date':
        return { ...column, label: t('timeEntry.endDate'), getValue: (item) => formatDateDDMMYYYY(item.end_date) };
      case 'end_period':
        return { ...column, label: t('timeEntry.endPeriod'), getValue: (item) => getPeriodLabel(item.end_period, t) };
      case 'days':
        return { ...column, label: t('grid.days'), getValue: (item) => calculateDays(item.start_date, item.start_period, item.end_date, item.end_period) };
      case 'note':
      default:
        return { ...column, label: t('common.note'), getValue: (item) => item.note || '' };
    }
  });
};

const getDefaultSelectedColumns = (columns) => columns.reduce((acc, column) => ({
  ...acc,
  [column.id]: true,
}), {});

const getActiveColumns = (selectedColumns, columns) => columns.filter((column) => selectedColumns[column.id]);

const compareWeekYear = (left, right) => {
  if (left.year !== right.year) {
    return left.year - right.year;
  }
  return left.week_number - right.week_number;
};

const incrementWeekYear = ({ year, week_number }) => {
  const maxWeeks = getIsoWeeksInYear(year);
  if (week_number < maxWeeks) {
    return { year, week_number: week_number + 1 };
  }
  return { year: year + 1, week_number: 1 };
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

  const parsedStartYear = Number.isFinite(Number(inputFilters.start_year))
    ? parseInt(inputFilters.start_year, 10)
    : CURRENT_WEEK_INFO.year;
  const start_year = Math.min(2100, Math.max(2000, parsedStartYear));

  const parsedEndYear = Number.isFinite(Number(inputFilters.end_year))
    ? parseInt(inputFilters.end_year, 10)
    : CURRENT_WEEK_INFO.year;
  const end_year = Math.min(2100, Math.max(2000, parsedEndYear));

  const startMaxWeeks = getIsoWeeksInYear(start_year);
  const endMaxWeeks = getIsoWeeksInYear(end_year);

  const parsedStartWeek = Number.isFinite(Number(inputFilters.start_week_number))
    ? parseInt(inputFilters.start_week_number, 10)
    : CURRENT_WEEK_INFO.week;
  const start_week_number = Math.min(startMaxWeeks, Math.max(1, parsedStartWeek));

  const parsedEndWeek = Number.isFinite(Number(inputFilters.end_week_number))
    ? parseInt(inputFilters.end_week_number, 10)
    : CURRENT_WEEK_INFO.week;
  const end_week_number = Math.min(endMaxWeeks, Math.max(1, parsedEndWeek));

  const start = { year: start_year, week_number: start_week_number };
  const end = { year: end_year, week_number: end_week_number };

  if (compareWeekYear(start, end) <= 0) {
    return {
      start_year,
      start_week_number,
      end_year,
      end_week_number,
    };
  }

  return {
    start_year: end_year,
    start_week_number: end_week_number,
    end_year: start_year,
    end_week_number: start_week_number,
  };
};

const formatWeekYearLabel = ({ year, week_number }) => `W${week_number}-${year}`;

const buildStatsRows = (timeEntries, rangeLabel, t) => {
  const totalJours = timeEntries.reduce((sum, item) => (
    sum + calculateDays(item.start_date, item.start_period, item.end_date, item.end_period)
  ), 0);

  const usersMap = {};
  const projectsMap = {};

  timeEntries.forEach((item) => {
    const jours = calculateDays(item.start_date, item.start_period, item.end_date, item.end_period);

    const userName = item.user?.name || t('common.notAvailable');
    if (!usersMap[userName]) {
      usersMap[userName] = { jours: 0, entries: 0 };
    }
    usersMap[userName].jours += jours;
    usersMap[userName].entries += 1;

    const projectName = item.project?.name || t('common.notAvailable');
    const trackingCode = item.project?.tracking_code?.code || t('common.notAvailable');
    const projectKey = `${projectName}__${trackingCode}`;
    if (!projectsMap[projectKey]) {
      projectsMap[projectKey] = {
        name: projectName,
        code: trackingCode,
        jours: 0,
        entries: 0,
      };
    }
    projectsMap[projectKey].jours += jours;
    projectsMap[projectKey].entries += 1;
  });

  const usersRows = Object.entries(usersMap)
    .map(([name, values]) => [name, Number(values.jours.toFixed(2)), values.entries])
    .sort((left, right) => right[1] - left[1]);

  const projectsRows = Object.values(projectsMap)
    .map((project) => [project.name, project.code, Number(project.jours.toFixed(2)), project.entries])
    .sort((left, right) => right[2] - left[2]);

  return [
    [t('export.summaryTitle')],
    [t('export.periodLabel'), rangeLabel],
    [t('export.entriesExported'), timeEntries.length],
    [t('export.totalDays'), Number(totalJours.toFixed(2))],
    [t('export.uniqueUsers'), Object.keys(usersMap).length],
    [t('export.uniqueProjects'), Object.keys(projectsMap).length],
    [],
    [t('export.breakdownByUser')],
    [t('timeEntry.user'), t('grid.days'), t('export.entriesLabel')],
    ...usersRows,
    [],
    [t('export.breakdownByProject')],
    [t('timeEntry.project'), t('project.trackingCode'), t('grid.days'), t('export.entriesLabel')],
    ...projectsRows,
  ];
};

function ExportExcel() {
  const { t, i18n } = useTranslation();
  const exportColumns = useMemo(() => getExportColumns(t), [t]);
  const CURRENT_WEEK_INFO = getCurrentIsoWeekInfo();
  const [filters, setFilters] = useState({
    start_year: CURRENT_WEEK_INFO.year,
    start_week_number: CURRENT_WEEK_INFO.week,
    end_year: CURRENT_WEEK_INFO.year,
    end_week_number: CURRENT_WEEK_INFO.week,
  });
  const [timeEntries, setTimeEntries] = useState([]);
  const [selectedColumns, setSelectedColumns] = useState(() => getDefaultSelectedColumns(EXPORT_COLUMN_DEFS));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const loadTimeEntries = useCallback(async (filterParams) => {
    try {
      setLoading(true);
      const start = {
        year: filterParams.start_year,
        week_number: filterParams.start_week_number,
      };
      const end = {
        year: filterParams.end_year,
        week_number: filterParams.end_week_number,
      };

      const weeksToLoad = buildWeekRange(start, end);
      const responses = await Promise.all(
        weeksToLoad.map((week) => timeEntryAPI.getAll({
          year: week.year,
          week_number: week.week_number,
        })),
      );

      const merged = responses.flatMap((response) => response.data || []);
      const uniqueTimeEntriesMap = new Map();
      merged.forEach((item) => {
        uniqueTimeEntriesMap.set(item.id, item);
      });

      const sortedTimeEntries = Array.from(uniqueTimeEntriesMap.values()).sort((left, right) => {
        if (left.year !== right.year) return left.year - right.year;
        if (left.week_number !== right.week_number) return left.week_number - right.week_number;
        if (left.user?.name !== right.user?.name) {
          return (left.user?.name || '').localeCompare(right.user?.name || '');
        }
        return left.id - right.id;
      });

      setTimeEntries(sortedTimeEntries);
      setError('');
    } catch (err) {
      setError(t('timeEntry.errorLoad'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadTimeEntries(filters);
  }, [filters, loadTimeEntries]);

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
    if (timeEntries.length === 0) {
      setError(t('timeEntry.noEntriesToExport'));
      return;
    }

    const activeColumns = getActiveColumns(selectedColumns, exportColumns);
    if (activeColumns.length === 0) {
      setError(t('grid.selectColumns'));
      return;
    }

    try {
      setExporting(true);

      const excelData = timeEntries.map((item) => {
        const row = {};
        activeColumns.forEach((column) => {
          row[column.label] = column.getValue(item);
        });
        return row;
      });

      const wb = XLSX.utils.book_new();
      const timeEntriesSheet = XLSX.utils.json_to_sheet(excelData);
      timeEntriesSheet['!cols'] = activeColumns.map((column) => ({ wch: column.width }));
      XLSX.utils.book_append_sheet(wb, timeEntriesSheet, t('export.sheetTimeEntries'));

      const statsRangeLabel = `${formatWeekYearLabel({
        year: filters.start_year,
        week_number: filters.start_week_number,
      })} ${t('common.to')} ${formatWeekYearLabel({
        year: filters.end_year,
        week_number: filters.end_week_number,
      })}`;
      const statsRows = buildStatsRows(timeEntries, statsRangeLabel, t);
      const statsSheet = XLSX.utils.aoa_to_sheet(statsRows);
      statsSheet['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 12 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, statsSheet, t('export.sheetStats'));
      const fileName = `time_entries_${filters.start_year}_W${filters.start_week_number}_to_${filters.end_year}_W${filters.end_week_number}.xlsx`;
      XLSX.writeFile(wb, fileName);

      setError('');
    } catch (err) {
      setError(t('export.errorExport'));
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

  const startWeekRange = getIsoWeekDateRange(filters.start_year, filters.start_week_number);
  const endWeekRange = getIsoWeekDateRange(filters.end_year, filters.end_week_number);
  const currentLocale = useMemo(() => {
    const requestedLocale = i18n.resolvedLanguage || i18n.language;
    if (!requestedLocale) {
      return 'en-US';
    }
    const supportedLocales = Intl.DateTimeFormat.supportedLocalesOf([requestedLocale]);
    return supportedLocales[0] || 'en-US';
  }, [i18n.language, i18n.resolvedLanguage]);

  const formatShortDate = (date) => new Intl.DateTimeFormat(currentLocale, {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(date);
  const selectedWeekLabel = `${t('days.monday')} ${formatShortDate(startWeekRange.monday)} ${filters.start_year} ${t('common.to')} ${t('days.friday')} ${formatShortDate(endWeekRange.friday)} ${filters.end_year}`;
  const selectedColumnCount = exportColumns.filter((column) => selectedColumns[column.id]).length;
  const previewColumns = getActiveColumns(selectedColumns, exportColumns);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="mb-0" style={{ fontWeight: 700 }}>
          <i className="fas fa-file-excel me-2" style={{ color: '#27ae60' }}></i>
          {t('export.title')}
        </h2>
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

      <Card className="mb-4">
        <Card.Header>
          <h5 className="mb-0">{t('export.selectPeriod') || 'Select period'}</h5>
        </Card.Header>
        <Card.Body>
          <Row className="mb-3">
            <Col md={3}>
              <Form.Group>
                <Form.Label>{t('export.startYear') || 'Start year'}</Form.Label>
                <Form.Control
                  type="number"
                  name="start_year"
                  value={Number.isFinite(filters.start_year) ? filters.start_year : ''}
                  onChange={handleFilterChange}
                  min="2000"
                  max="2100"
                />
              </Form.Group>
            </Col>
            <Col md={3}>
              <Form.Group>
                <Form.Label>{t('export.startWeek') || 'Start week'}</Form.Label>
                <Form.Control
                  type="number"
                  name="start_week_number"
                  value={Number.isFinite(filters.start_week_number) ? filters.start_week_number : ''}
                  onChange={handleFilterChange}
                  min="1"
                  max="53"
                />
              </Form.Group>
            </Col>
            <Col md={3}>
              <Form.Group>
                <Form.Label>{t('export.endYear') || 'End year'}</Form.Label>
                <Form.Control
                  type="number"
                  name="end_year"
                  value={Number.isFinite(filters.end_year) ? filters.end_year : ''}
                  onChange={handleFilterChange}
                  min="2000"
                  max="2100"
                />
              </Form.Group>
            </Col>
            <Col md={3}>
              <Form.Group>
                <Form.Label>{t('export.endWeek') || 'End week'}</Form.Label>
                <Form.Control
                  type="number"
                  name="end_week_number"
                  value={Number.isFinite(filters.end_week_number) ? filters.end_week_number : ''}
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
          <h5 className="mb-0">{t('export.selectColumns')}</h5>
        </Card.Header>
        <Card.Body>
          <Row>
            {exportColumns.map((column) => (
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
            {selectedColumnCount} {t('export.columnsSelected') || 'column(s) selected'}
          </div>
        </Card.Body>
      </Card>

      <Card className="mb-4">
        <Card.Header className="d-flex justify-content-between align-items-center">
          <h5 className="mb-0">{t('export.dataPreview') || 'Data preview'}</h5>
          <Button
            variant="success"
            onClick={handleExportExcel}
            disabled={loading || exporting || timeEntries.length === 0}
          >
            <i className="fas fa-file-excel me-2"></i>
            {exporting ? (t('export.exporting') || 'Exporting...') : t('export.export')}
          </Button>
        </Card.Header>
        <Card.Body>
          {loading ? (
            <p>{t('common.loading')}</p>
          ) : timeEntries.length === 0 ? (
            <Alert variant="info">{t('common.noData')}</Alert>
          ) : (
            <>
              <p className="mb-3">
                <strong>{timeEntries.length}</strong>
                {' '}
                {t('timeEntry.entriesFound') || 'time entr(y/ies) found from'}
                {' '}
                {formatWeekYearLabel({ year: filters.start_year, week_number: filters.start_week_number })}
                {' '}
                {t('common.to') || 'to'}
                {' '}
                {formatWeekYearLabel({ year: filters.end_year, week_number: filters.end_week_number })}
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
                  {timeEntries.slice(0, 10).map((item) => (
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
              {timeEntries.length > 10 && (
                <p className="text-muted text-center mt-2">
                  ... {t('common.andMore') || 'and'} {timeEntries.length - 10} {t('common.moreEntries') || 'more time entr(y/ies)'}
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
