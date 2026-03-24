import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Row, Col, Card, Form, Button, Spinner, Alert, Badge, Table,
} from 'react-bootstrap';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
  LabelList,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { statsAPI, userAPI } from '../services/api';

// ── ISO Week helpers ──────────────────────────────────────────────────────────
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
  const dec28 = new Date(Date.UTC(year, 11, 28));
  const day = dec28.getUTCDay() || 7;
  dec28.setUTCDate(dec28.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(dec28.getUTCFullYear(), 0, 1));
  return Math.ceil((((dec28 - yearStart) / 86400000) + 1) / 7);
};

const CURRENT = getCurrentIsoWeekInfo();
const CURRENT_YEAR = CURRENT.year;
const CURRENT_MONTH = new Date().getMonth() + 1;
const CURRENT_WEEK = CURRENT.week;

// ── Theme helper ──────────────────────────────────────────────────────────────
const isDarkMode = () =>
  document.documentElement.getAttribute('data-bs-theme') === 'dark';

// ── Tooltip personnalisé ──────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label, unit = '' }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{
      background: 'var(--bs-body-bg)',
      border: '1px solid var(--bs-border-color)',
      borderRadius: 8,
      padding: '8px 14px',
      color: 'var(--bs-body-color)',
      fontSize: 13,
    }}>
      <p style={{ margin: 0, fontWeight: 600, marginBottom: 4 }}>{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ margin: 0, color: entry.color || entry.fill }}>
          {entry.name} : <strong>{entry.value}</strong> {unit}
        </p>
      ))}
    </div>
  );
};

// ── Carte KPI ─────────────────────────────────────────────────────────────────
const KpiCard = ({ title, value, subtitle, color, icon }) => (
  <Card className="h-100 text-center" style={{ borderLeft: `4px solid ${color}` }}>
    <Card.Body className="py-3">
      <div style={{ fontSize: 28, color, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{subtitle}</div>}
    </Card.Body>
  </Card>
);

// ── Color helper for tracking codes ─────────────────────────────────────────
const getTrackingCodeColor = (index) => `hsl(${(index * 47 + 30) % 360}, 65%, 55%)`;

// ── Composant principal ───────────────────────────────────────────────────────
export default function Stats() {
  const { t } = useTranslation();
  // Filters
  const [granularity, setGranularity] = useState('month');
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [week, setWeek] = useState(CURRENT_WEEK);
  const [userId, setUserId] = useState('');

  // Data
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dark, setDark] = useState(isDarkMode());

  // Detect theme changes
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDarkMode()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme'] });
    return () => observer.disconnect();
  }, []);

  // Load users for select
  useEffect(() => {
    userAPI.getAll()
      .then(r => setUsers(r.data))
      .catch(() => {});
  }, []);

  const fetchStats = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = { granularity, year };
    if (granularity === 'month') params.month = month;
    if (granularity === 'week') params.week_number = week;
    if (userId) params.user_id = userId;

    statsAPI.get(params)
      .then(r => setStats(r.data))
      .catch(e => setError(e.response?.data?.error || t('stats.errorLoad')))
      .finally(() => setLoading(false));
  }, [granularity, year, month, week, userId, t]);

  // Auto-fetch on mount and when filters change
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // ── Month labels (translated)
  const monthLabels = useMemo(() => [
    t('months.january'),
    t('months.february'),
    t('months.march'),
    t('months.april'),
    t('months.may'),
    t('months.june'),
    t('months.july'),
    t('months.august'),
    t('months.september'),
    t('months.october'),
    t('months.november'),
    t('months.december'),
  ], [t]);

  // ── Year options
  const yearOptions = useMemo(() => {
    const years = [];
    for (let y = CURRENT_YEAR + 1; y >= 2020; y--) years.push(y);
    return years;
  }, []);

  const maxWeeks = useMemo(() => getIsoWeeksInYear(year), [year]);

  // ── Chart colors
  const chartColors = {
    presence: '#2ecc71',
    absence: '#e74c3c',
    grid: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
    text: dark ? '#ccc' : '#555',
    axisLine: dark ? '#666' : '#ccc',
  };

  // ── Derived values
  const globalRate = useMemo(() => {
    if (!stats || !stats.users.length) return null;
    const total = stats.users.reduce((s, u) => s + u.worked_half_days, 0);
    const possible = stats.users.reduce((s, u) => s + (u.total_classified_half_days || 0), 0);
    if (possible === 0) return null;
    return Math.round((total / possible) * 100);
  }, [stats]);

  const activeUsers = useMemo(() => {
    if (!stats) return 0;
    return stats.users.filter(u => u.worked_half_days > 0).length;
  }, [stats]);

  // ── Data for user bar chart (horizontal)
  const userBarData = useMemo(() => {
    if (!stats) return [];
    return stats.users.map(u => ({
      name: u.name,
      present: u.worked_half_days,
      absent: u.absent_half_days,
      color: u.color,
    }));
  }, [stats]);

  // ── Data for pie chart (projects)
  const pieData = useMemo(() => {
    if (!stats) return [];
    return stats.projects.map((p, index) => ({
      name: p.name,
      value: p.half_days,
      color: p.color || getTrackingCodeColor(index),
    }));
  }, [stats]);

  // ── Period label
  const periodLabel = useMemo(() => {
    if (!stats) return '';
    const { granularity: g, year: a, month: m, week_number: s } = stats.period;
    if (g === 'week') return `${t('stats.week')} ${s} / ${a}`;
    if (g === 'month') return `${monthLabels[(m || 1) - 1]} ${a}`;
    return `${t('common.year')} ${a}`;
  }, [stats, t, monthLabels]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Header ── */}
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="mb-0" style={{ fontWeight: 700 }}>
            <i className="fas fa-chart-bar me-2" style={{ color: '#3498db' }}></i>
            {t('stats.title')}
          </h2>
          {stats && <small className="text-muted">{periodLabel}</small>}
        </div>
        <Button variant="outline-primary" size="sm" onClick={fetchStats} disabled={loading}>
          <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''} me-1`}></i>
          {t('common.refresh') || 'Refresh'}
        </Button>
      </div>

      {/* ── Filters ── */}
      <Card className="mb-4">
        <Card.Body>
          <Row className="g-3 align-items-end">
            {/* Granularité */}
            <Col xs={12} sm={6} md={3}>
              <Form.Label className="fw-semibold mb-1">{t('stats.granularity')}</Form.Label>
              <div className="d-flex gap-1">
                {['week', 'month', 'year'].map(g => (
                  <Button
                    key={g}
                    size="sm"
                    variant={granularity === g ? 'primary' : 'outline-secondary'}
                    onClick={() => setGranularity(g)}
                    className="flex-fill"
                    style={{ textTransform: 'capitalize' }}
                  >
                    {t(`stats.granularities.${g}`)}
                  </Button>
                ))}
              </div>
            </Col>

            {/* Année */}
            <Col xs={6} sm={4} md={2}>
              <Form.Label className="fw-semibold mb-1">{t('stats.year')}</Form.Label>
              <Form.Select size="sm" value={year} onChange={e => setYear(Number(e.target.value))}>
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </Form.Select>
            </Col>

            {/* Mois (if granularite = mois) */}
{granularity === 'month' && (
              <Col xs={6} sm={4} md={3}>
                <Form.Label className="fw-semibold mb-1">{t('stats.month')}</Form.Label>
                <Form.Select size="sm" value={month} onChange={e => setMonth(Number(e.target.value))}>
                  {monthLabels.map((name, i) => (
                    <option key={i + 1} value={i + 1}>{name}</option>
                  ))}
                </Form.Select>
              </Col>
            )}

            {/* Semaine (if granularite = semaine) */}
{granularity === 'week' && (
              <Col xs={6} sm={4} md={2}>
                <Form.Label className="fw-semibold mb-1">{t('stats.week')}</Form.Label>
                <Form.Select size="sm" value={week} onChange={e => setWeek(Number(e.target.value))}>
                  {Array.from({ length: maxWeeks }, (_, i) => i + 1).map(w => (
                    <option key={w} value={w}>W{w}</option>
                  ))}
                </Form.Select>
              </Col>
            )}

            {/* Utilisateur */}
            <Col xs={12} sm={6} md={3}>
              <Form.Label className="fw-semibold mb-1">{t('stats.user')}</Form.Label>
              <Form.Select size="sm" value={userId} onChange={e => setUserId(e.target.value)}>
                <option value="">{t('stats.allUsers')}</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </Form.Select>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* ── Error ── */}
      {error && <Alert variant="danger">{error}</Alert>}

      {/* ── Loading ── */}
      {loading && (
        <div className="text-center py-5">
          <Spinner animation="border" variant="primary" />
          <p className="mt-2 text-muted">{t('common.loading')}</p>
        </div>
      )}

      {/* ── Content ── */}
      {stats && !loading && (
        <>
          {/* KPI Cards */}
          <Row className="g-3 mb-4">
            <Col xs={6} lg={3}>
              <KpiCard
                title={t('stats.workingDays')}
                value={stats.working_days}
                subtitle={`${stats.possible_half_days} ${t('stats.halfDays')}`}
                color="#3498db"
                icon="📅"
              />
            </Col>
            <Col xs={6} lg={3}>
              <KpiCard
                title={t('stats.presenceRate')}
                value={globalRate !== null ? `${globalRate}%` : '—'}
                subtitle={userId ? t('stats.forThisUser') || 'for this user' : t('stats.averageAllUsers') || 'average all users'}
                color={globalRate >= 80 ? '#2ecc71' : globalRate >= 50 ? '#f39c12' : '#e74c3c'}
                icon="✅"
              />
            </Col>
            <Col xs={6} lg={3}>
              <KpiCard
                title={t('stats.activeUsers') || 'Active users'}
                value={activeUsers}
                subtitle={`${t('stats.outOf') || 'out of'} ${stats.users.length} ${t('stats.usersCount') || 'user(s)'}`}
                color="#9b59b6"
                icon="👥"
              />
            </Col>
            <Col xs={6} lg={3}>
              <KpiCard
                title={t('stats.pointedProjects') || 'Tracked projects'}
                value={stats.projects.length}
                subtitle={
                  stats.projects.length > 0
                    ? `Top: ${stats.projects[0].name}`
                    : t('common.noData')
                }
                color="#e67e22"
                icon="🗂️"
              />
            </Col>
          </Row>

          {/* Charts row 1 */}
          <Row className="g-3 mb-4">
            {/* Présence / Absence par utilisateur */}
            <Col xs={12} lg={7}>
              <Card className="h-100">
                <Card.Header className="fw-semibold">
                  <i className="fas fa-users me-2 text-primary"></i>
                  {t('stats.presenceAbsenceByUser') || 'Presence / Absence by user'}
                </Card.Header>
                <Card.Body>
                  {userBarData.length === 0 ? (
                    <p className="text-muted text-center py-4">{t('common.noData')}</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={Math.max(200, userBarData.length * 48)}>
                      <BarChart
                        data={userBarData}
                        layout="vertical"
                        margin={{ top: 5, right: 40, left: 10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} horizontal={false} />
                        <XAxis
                          type="number"
                          tick={{ fill: chartColors.text, fontSize: 11 }}
                          axisLine={{ stroke: chartColors.axisLine }}
                          tickLine={false}
                          label={{ value: t('stats.halfDays'), position: 'insideBottomRight', offset: -10, fill: chartColors.text, fontSize: 11 }}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={100}
                          tick={{ fill: chartColors.text, fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip content={<CustomTooltip unit={t('common.halfDayAbbr')} />} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="present" stackId="a" fill={chartColors.presence} radius={[0, 4, 4, 0]}>
                          <LabelList dataKey="present" position="insideRight" style={{ fill: '#fff', fontSize: 11, fontWeight: 600 }} formatter={v => v > 0 ? v : ''} />
                        </Bar>
                        <Bar dataKey="absent" stackId="a" fill={chartColors.absence} radius={[0, 4, 4, 0]}>
                          <LabelList dataKey="absent" position="right" style={{ fill: chartColors.text, fontSize: 11 }} formatter={v => v > 0 ? v : ''} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </Card.Body>
              </Card>
            </Col>

            {/* Distribution par projet */}
            <Col xs={12} lg={5}>
              <Card className="h-100">
                <Card.Header className="fw-semibold">
                  <i className="fas fa-project-diagram me-2 text-warning"></i>
                  {t('stats.distributionByProject') || 'Distribution by project'}
                </Card.Header>
                <Card.Body className="d-flex flex-column align-items-center justify-content-center">
                  {pieData.length === 0 ? (
                    <p className="text-muted text-center py-4">{t('common.noData')}</p>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie
                            data={pieData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={85}
                            innerRadius={40}
                            paddingAngle={2}
                          >
                            {pieData.map((entry, index) => (
                              <Cell key={index} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            content={<CustomTooltip unit={t('common.halfDayAbbr')} />}
                            formatter={(value, name) => [`${value} ${t('common.halfDayAbbr')}`, name]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      {/* Legend */}
                      <div className="d-flex flex-wrap justify-content-center gap-2 mt-1">
                        {pieData.map((p, i) => (
                          <div key={i} className="d-flex align-items-center gap-1" style={{ fontSize: 12 }}>
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }}></span>
                            <span>{p.name}</span>
                            <Badge bg="secondary" style={{ fontSize: 10 }}>{p.value}</Badge>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </Card.Body>
              </Card>
            </Col>
          </Row>

          {/* Trend chart (not for semaine) */}
          {granularity !== 'week' && stats.trend && stats.trend.length > 0 && (
            <Card className="mb-4">
              <Card.Header className="fw-semibold">
                <i className="fas fa-chart-line me-2 text-success"></i>
                {granularity === 'year' ? (t('stats.monthlyEvolution') || 'Monthly evolution') : (t('stats.weeklyEvolution') || 'Weekly evolution')}
              </Card.Header>
              <Card.Body>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={stats.trend} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: chartColors.text, fontSize: 12 }}
                      axisLine={{ stroke: chartColors.axisLine }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: chartColors.text, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<CustomTooltip unit={t('common.halfDayAbbr')} />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="half_days" name={t('stats.workedHalfDays')} fill="#3498db" radius={[4, 4, 0, 0]}>
                      <LabelList dataKey="half_days" position="top" style={{ fill: chartColors.text, fontSize: 11 }} formatter={v => v > 0 ? v : ''} />
                    </Bar>
                    <Bar dataKey="possible_half_days" name={t('stats.possibleHalfDays')} fill={dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)'} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card.Body>
            </Card>
          )}

          {/* Taux de présence par utilisateur (gauge-like bar) */}
          {stats.users.length > 0 && (
            <Card className="mb-4">
              <Card.Header className="fw-semibold">
                <i className="fas fa-percentage me-2 text-info"></i>
                {t('stats.presenceRateByUser') || 'Presence rate by user'}
              </Card.Header>
              <Card.Body>
                <ResponsiveContainer width="100%" height={Math.max(180, stats.users.length * 44)}>
                  <BarChart
                    data={stats.users.map(u => ({
                      name: u.name,
                      'Presence rate (%)': Math.round(u.presence_rate * 100),
                    }))}
                    layout="vertical"
                    margin={{ top: 5, right: 60, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} horizontal={false} />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      tick={{ fill: chartColors.text, fontSize: 11 }}
                      axisLine={{ stroke: chartColors.axisLine }}
                      tickLine={false}
                      tickFormatter={v => `${v}%`}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={100}
                      tick={{ fill: chartColors.text, fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={<CustomTooltip unit="%" />}
                    />
                    <Bar dataKey="Presence rate (%)" radius={[0, 6, 6, 0]}>
                      {stats.users.map((u, i) => (
                        <Cell
                          key={i}
                          fill={
                            u.presence_rate >= 0.8
                              ? '#2ecc71'
                              : u.presence_rate >= 0.5
                              ? '#f39c12'
                              : '#e74c3c'
                          }
                        />
                      ))}
                      <LabelList
                        dataKey="Presence rate (%)"
                        position="right"
                        style={{ fill: chartColors.text, fontSize: 12, fontWeight: 600 }}
                        formatter={v => `${v}%`}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                {/* Color legend */}
                <div className="d-flex gap-3 justify-content-center mt-2 flex-wrap" style={{ fontSize: 12 }}>
                  <span><span style={{ background: '#2ecc71', padding: '2px 10px', borderRadius: 4, marginRight: 4 }}></span>≥ 80% — {t('stats.presenceLevelGood')}</span>
                  <span><span style={{ background: '#f39c12', padding: '2px 10px', borderRadius: 4, marginRight: 4 }}></span>50–79% — {t('stats.presenceLevelAverage')}</span>
                  <span><span style={{ background: '#e74c3c', padding: '2px 10px', borderRadius: 4, marginRight: 4 }}></span>&lt; 50% — {t('stats.presenceLevelLow')}</span>
                </div>
              </Card.Body>
            </Card>
          )}

          {/* Détail table */}
          <Card className="mb-4">
            <Card.Header className="fw-semibold">
              <i className="fas fa-table me-2 text-secondary"></i>
                {t('stats.userDetails')}
            </Card.Header>
            <Card.Body className="p-0">
              <div className="table-responsive">
                <Table striped hover className="mb-0" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>{t('stats.user')}</th>
                      <th className="text-center">{t('stats.workedHalfDays')}</th>
                      <th className="text-center">{t('stats.absentHalfDays')}</th>
                      <th className="text-center">{t('stats.presenceRate')}</th>
                      <th className="text-center">{t('stats.absenceRate')}</th>
                      <th>{t('stats.topProjects')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.users.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center text-muted py-4">
                          {t('common.noData')}
                        </td>
                      </tr>
                    ) : (
                      stats.users.map(u => (
                        <tr key={u.id}>
                          <td>
                            <div className="d-flex align-items-center gap-2">
                              <span style={{
                                width: 10, height: 10, borderRadius: '50%',
                                background: u.color, display: 'inline-block', flexShrink: 0,
                              }}></span>
                              <span className="fw-semibold">{u.name}</span>
                            </div>
                          </td>
                          <td className="text-center">
                            <strong>{u.worked_half_days}</strong>
                            <span className="text-muted"> /{u.total_classified_half_days || 0}</span>
                          </td>
                          <td className="text-center">
                            <span style={{ color: u.absent_half_days > 0 ? '#e74c3c' : '#2ecc71' }}>
                              {u.absent_half_days}
                            </span>
                          </td>
                          <td className="text-center">
                            <span style={{
                              color: u.presence_rate >= 0.8 ? '#2ecc71' : u.presence_rate >= 0.5 ? '#f39c12' : '#e74c3c',
                              fontWeight: 700,
                            }}>
                              {Math.round(u.presence_rate * 100)}%
                            </span>
                            <div style={{ height: 4, background: 'var(--bs-border-color)', borderRadius: 2, marginTop: 3, maxWidth: 80, margin: '3px auto 0' }}>
                              <div style={{
                                height: '100%',
                                width: `${Math.min(100, Math.round(u.presence_rate * 100))}%`,
                                background: u.presence_rate >= 0.8 ? '#2ecc71' : u.presence_rate >= 0.5 ? '#f39c12' : '#e74c3c',
                                borderRadius: 2,
                              }}></div>
                            </div>
                          </td>
                          <td className="text-center" style={{ color: '#e74c3c' }}>
                            {Math.round(u.absence_rate * 100)}%
                          </td>
                          <td>
                            <div className="d-flex flex-wrap gap-1">
                              {u.by_project.slice(0, 4).map(p => (
                                <Badge
                                  key={p.project_id}
                                  style={{ background: p.color, fontSize: 10 }}
                                >
                                  {p.name} ({p.half_days})
                                </Badge>
                              ))}
                              {u.by_project.length > 4 && (
                                <Badge bg="secondary" style={{ fontSize: 10 }}>
                                  +{u.by_project.length - 4}
                                </Badge>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {stats.users.length > 0 && (
                    <tfoot>
                      <tr className="fw-semibold">
                        <td>Total</td>
                        <td className="text-center">
                          {stats.users.reduce((s, u) => s + u.worked_half_days, 0)}
                        </td>
                        <td className="text-center">
                          {stats.users.reduce((s, u) => s + u.absent_half_days, 0)}
                        </td>
                        <td className="text-center">
                          {globalRate !== null ? `${globalRate}%` : '—'}
                        </td>
                        <td className="text-center">
                          {globalRate !== null ? `${100 - globalRate}%` : '—'}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </Table>
              </div>
            </Card.Body>
          </Card>

          {/* Per-user project breakdown */}
          {stats.users.filter(u => u.by_project.length > 0).length > 0 && (
            <Card className="mb-4">
              <Card.Header className="fw-semibold">
                <i className="fas fa-layer-group me-2" style={{ color: '#9b59b6' }}></i>
                {t('stats.distributionByProjectByUser')}
              </Card.Header>
              <Card.Body>
                <ResponsiveContainer width="100%" height={Math.max(180, stats.users.length * 44 + 40)}>
                  <BarChart
                    data={stats.users.filter(u => u.worked_half_days > 0).map(u => {
                      const row = { name: u.name };
                      u.by_project.forEach(p => { row[p.name] = p.half_days; });
                      return row;
                    })}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} horizontal={false} />
                    <XAxis type="number" tick={{ fill: chartColors.text, fontSize: 11 }} axisLine={{ stroke: chartColors.axisLine }} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fill: chartColors.text, fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {stats.projects.map(p => (
                      <Bar key={p.project_id} dataKey={p.name} stackId="a" fill={p.color} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </Card.Body>
            </Card>
          )}

          {/* Distribution par code record */}
          {stats.tracking_codes && stats.tracking_codes.length > 0 && (
            <Row className="g-3 mb-4">
              <Col xs={12} lg={7}>
                <Card className="h-100">
                  <Card.Header className="fw-semibold">
                    <i className="fas fa-tags me-2" style={{ color: '#e67e22' }}></i>
                    {t('stats.topCodes')}
                  </Card.Header>
                  <Card.Body>
                    <ResponsiveContainer width="100%" height={Math.max(200, stats.tracking_codes.length * 48)}>
                      <BarChart
                        data={stats.tracking_codes}
                        layout="vertical"
                        margin={{ top: 5, right: 40, left: 10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} horizontal={false} />
                        <XAxis
                          type="number"
                          tick={{ fill: chartColors.text, fontSize: 11 }}
                          axisLine={{ stroke: chartColors.axisLine }}
                          tickLine={false}
                          label={{ value: t('stats.halfDays'), position: 'insideBottomRight', offset: -10, fill: chartColors.text, fontSize: 11 }}
                        />
                        <YAxis
                          type="category"
                          dataKey="code"
                          width={120}
                          tick={{ fill: chartColors.text, fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip content={<CustomTooltip unit={t('common.halfDayAbbr')} />} />
                        <Bar dataKey="half_days" name={t('stats.halfDays')} fill="#e67e22" radius={[0, 4, 4, 0]}>
                          <LabelList dataKey="half_days" position="right" style={{ fill: chartColors.text, fontSize: 11 }} formatter={v => v > 0 ? v : ''} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Card.Body>
                </Card>
              </Col>
              <Col xs={12} lg={5}>
                <Card className="h-100">
                  <Card.Header className="fw-semibold">
                    <i className="fas fa-chart-pie me-2" style={{ color: '#e67e22' }}></i>
                    {t('stats.distributionByTrackingCode') || 'Distribution by tracking code'}
                  </Card.Header>
                  <Card.Body className="d-flex flex-column align-items-center justify-content-center">
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={stats.tracking_codes}
                          dataKey="half_days"
                          nameKey="code"
                          cx="50%"
                          cy="50%"
                          outerRadius={85}
                          innerRadius={40}
                          paddingAngle={2}
                        >
                          {stats.tracking_codes.map((entry, index) => (
                            <Cell
                              key={index}
                              fill={getTrackingCodeColor(index)}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          content={<CustomTooltip unit={t('common.halfDayAbbr')} />}
                          formatter={(value, name) => [`${value} ${t('common.halfDayAbbr')}`, name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="d-flex flex-wrap justify-content-center gap-2 mt-1">
                      {stats.tracking_codes.map((cp, i) => (
                        <div key={i} className="d-flex align-items-center gap-1" style={{ fontSize: 12 }}>
                          <span style={{ width: 10, height: 10, borderRadius: '50%', background: getTrackingCodeColor(i), display: 'inline-block', flexShrink: 0 }}></span>
                          <span>{cp.code}</span>
                          <Badge bg="secondary" style={{ fontSize: 10 }}>{cp.half_days}</Badge>
                        </div>
                      ))}
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            </Row>
          )}
        </>
      )}

      {stats && !loading && stats.users.length === 0 && stats.projects.length === 0 && (
        <Alert variant="info" className="mt-3">
          <i className="fas fa-info-circle me-2"></i>
          {t('common.noDataPeriod') || 'No data found for this period. Try adjusting the filters.'}
        </Alert>
      )}
    </div>
  );
}
