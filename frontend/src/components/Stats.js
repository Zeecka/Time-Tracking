import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Row, Col, Card, Form, Button, Spinner, Alert, Badge, Table,
} from 'react-bootstrap';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
  LabelList,
} from 'recharts';
import { statsAPI, utilisateurAPI } from '../services/api';

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

const MOIS_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

// ── Theme helper ──────────────────────────────────────────────────────────────
const isDarkMode = () =>
  document.documentElement.getAttribute('data-bs-theme') === 'dark';

// ── Tooltip personnalisé ──────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label, unit = 'demi-j.' }) => {
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

// ── Composant principal ───────────────────────────────────────────────────────
export default function Stats() {
  // Filters
  const [granularite, setGranularite] = useState('mois');
  const [annee, setAnnee] = useState(CURRENT_YEAR);
  const [mois, setMois] = useState(CURRENT_MONTH);
  const [semaine, setSemaine] = useState(CURRENT_WEEK);
  const [utilisateurId, setUtilisateurId] = useState('');

  // Data
  const [stats, setStats] = useState(null);
  const [utilisateurs, setUtilisateurs] = useState([]);
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
    utilisateurAPI.getAll()
      .then(r => setUtilisateurs(r.data))
      .catch(() => {});
  }, []);

  const fetchStats = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = { granularite, annee };
    if (granularite === 'mois') params.mois = mois;
    if (granularite === 'semaine') params.numero_semaine = semaine;
    if (utilisateurId) params.utilisateur_id = utilisateurId;

    statsAPI.get(params)
      .then(r => setStats(r.data))
      .catch(e => setError(e.response?.data?.error || 'Erreur lors du chargement des statistiques.'))
      .finally(() => setLoading(false));
  }, [granularite, annee, mois, semaine, utilisateurId]);

  // Auto-fetch on mount and when filters change
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // ── Year options
  const yearOptions = useMemo(() => {
    const years = [];
    for (let y = CURRENT_YEAR + 1; y >= 2020; y--) years.push(y);
    return years;
  }, []);

  const maxWeeks = useMemo(() => getIsoWeeksInYear(annee), [annee]);

  // ── Chart colors
  const chartColors = {
    presence: '#2ecc71',
    absence: '#e74c3c',
    grid: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
    text: dark ? '#ccc' : '#555',
    axisLine: dark ? '#666' : '#ccc',
  };

  // ── Derived values
  const globalTaux = useMemo(() => {
    if (!stats || !stats.utilisateurs.length || stats.demi_journees_possibles === 0) return null;
    const total = stats.utilisateurs.reduce((s, u) => s + u.demi_journees_travaillees, 0);
    const possible = stats.utilisateurs.length * stats.demi_journees_possibles;
    return Math.round((total / possible) * 100);
  }, [stats]);

  const activeUsers = useMemo(() => {
    if (!stats) return 0;
    return stats.utilisateurs.filter(u => u.demi_journees_travaillees > 0).length;
  }, [stats]);

  // ── Data for user bar chart (horizontal)
  const userBarData = useMemo(() => {
    if (!stats) return [];
    return stats.utilisateurs.map(u => ({
      nom: u.nom,
      Présent: u.demi_journees_travaillees,
      Absent: u.demi_journees_absentes,
      couleur: u.couleur,
    }));
  }, [stats]);

  // ── Data for pie chart (projects)
  const pieData = useMemo(() => {
    if (!stats) return [];
    return stats.projets.map(p => ({ name: p.nom, value: p.demi_journees, couleur: p.couleur }));
  }, [stats]);

  // ── Period label
  const periodLabel = useMemo(() => {
    if (!stats) return '';
    const { granularite: g, annee: a, mois: m, numero_semaine: s } = stats.periode;
    if (g === 'semaine') return `Semaine ${s} / ${a}`;
    if (g === 'mois') return `${MOIS_LABELS[(m || 1) - 1]} ${a}`;
    return `Année ${a}`;
  }, [stats]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Header ── */}
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="mb-0" style={{ fontWeight: 700 }}>
            <i className="fas fa-chart-bar me-2" style={{ color: '#3498db' }}></i>
            Statistiques
          </h2>
          {stats && <small className="text-muted">{periodLabel}</small>}
        </div>
        <Button variant="outline-primary" size="sm" onClick={fetchStats} disabled={loading}>
          <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''} me-1`}></i>
          Actualiser
        </Button>
      </div>

      {/* ── Filters ── */}
      <Card className="mb-4">
        <Card.Body>
          <Row className="g-3 align-items-end">
            {/* Granularité */}
            <Col xs={12} sm={6} md={3}>
              <Form.Label className="fw-semibold mb-1">Période</Form.Label>
              <div className="d-flex gap-1">
                {['semaine', 'mois', 'annee'].map(g => (
                  <Button
                    key={g}
                    size="sm"
                    variant={granularite === g ? 'primary' : 'outline-secondary'}
                    onClick={() => setGranularite(g)}
                    className="flex-fill"
                    style={{ textTransform: 'capitalize' }}
                  >
                    {g === 'semaine' ? 'Semaine' : g === 'mois' ? 'Mois' : 'Année'}
                  </Button>
                ))}
              </div>
            </Col>

            {/* Année */}
            <Col xs={6} sm={4} md={2}>
              <Form.Label className="fw-semibold mb-1">Année</Form.Label>
              <Form.Select size="sm" value={annee} onChange={e => setAnnee(Number(e.target.value))}>
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </Form.Select>
            </Col>

            {/* Mois (if granularite = mois) */}
            {granularite === 'mois' && (
              <Col xs={6} sm={4} md={3}>
                <Form.Label className="fw-semibold mb-1">Mois</Form.Label>
                <Form.Select size="sm" value={mois} onChange={e => setMois(Number(e.target.value))}>
                  {MOIS_LABELS.map((name, i) => (
                    <option key={i + 1} value={i + 1}>{name}</option>
                  ))}
                </Form.Select>
              </Col>
            )}

            {/* Semaine (if granularite = semaine) */}
            {granularite === 'semaine' && (
              <Col xs={6} sm={4} md={2}>
                <Form.Label className="fw-semibold mb-1">Semaine</Form.Label>
                <Form.Select size="sm" value={semaine} onChange={e => setSemaine(Number(e.target.value))}>
                  {Array.from({ length: maxWeeks }, (_, i) => i + 1).map(w => (
                    <option key={w} value={w}>S{w}</option>
                  ))}
                </Form.Select>
              </Col>
            )}

            {/* Utilisateur */}
            <Col xs={12} sm={6} md={3}>
              <Form.Label className="fw-semibold mb-1">Utilisateur</Form.Label>
              <Form.Select size="sm" value={utilisateurId} onChange={e => setUtilisateurId(e.target.value)}>
                <option value="">Tous les utilisateurs</option>
                {utilisateurs.map(u => (
                  <option key={u.id} value={u.id}>{u.nom}</option>
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
          <p className="mt-2 text-muted">Chargement des statistiques…</p>
        </div>
      )}

      {/* ── Content ── */}
      {stats && !loading && (
        <>
          {/* KPI Cards */}
          <Row className="g-3 mb-4">
            <Col xs={6} lg={3}>
              <KpiCard
                title="Jours ouvrables"
                value={stats.jours_ouvrables}
                subtitle={`${stats.demi_journees_possibles} demi-journées`}
                color="#3498db"
                icon="📅"
              />
            </Col>
            <Col xs={6} lg={3}>
              <KpiCard
                title="Taux de présence global"
                value={globalTaux !== null ? `${globalTaux}%` : '—'}
                subtitle={utilisateurId ? 'pour cet utilisateur' : 'moyenne tous utilisateurs'}
                color={globalTaux >= 80 ? '#2ecc71' : globalTaux >= 50 ? '#f39c12' : '#e74c3c'}
                icon="✅"
              />
            </Col>
            <Col xs={6} lg={3}>
              <KpiCard
                title="Utilisateurs actifs"
                value={activeUsers}
                subtitle={`sur ${stats.utilisateurs.length} utilisateur(s)`}
                color="#9b59b6"
                icon="👥"
              />
            </Col>
            <Col xs={6} lg={3}>
              <KpiCard
                title="Projets pointés"
                value={stats.projets.length}
                subtitle={
                  stats.projets.length > 0
                    ? `Top : ${stats.projets[0].nom}`
                    : 'Aucun pointage'
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
                  Présence / Absence par utilisateur
                </Card.Header>
                <Card.Body>
                  {userBarData.length === 0 ? (
                    <p className="text-muted text-center py-4">Aucune donnée</p>
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
                          label={{ value: 'demi-journées', position: 'insideBottomRight', offset: -10, fill: chartColors.text, fontSize: 11 }}
                        />
                        <YAxis
                          type="category"
                          dataKey="nom"
                          width={100}
                          tick={{ fill: chartColors.text, fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="Présent" stackId="a" fill={chartColors.presence} radius={[0, 4, 4, 0]}>
                          <LabelList dataKey="Présent" position="insideRight" style={{ fill: '#fff', fontSize: 11, fontWeight: 600 }} formatter={v => v > 0 ? v : ''} />
                        </Bar>
                        <Bar dataKey="Absent" stackId="a" fill={chartColors.absence} radius={[0, 4, 4, 0]}>
                          <LabelList dataKey="Absent" position="right" style={{ fill: chartColors.text, fontSize: 11 }} formatter={v => v > 0 ? v : ''} />
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
                  Distribution par projet
                </Card.Header>
                <Card.Body className="d-flex flex-column align-items-center justify-content-center">
                  {pieData.length === 0 ? (
                    <p className="text-muted text-center py-4">Aucun pointage sur cette période</p>
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
                              <Cell key={index} fill={entry.couleur} />
                            ))}
                          </Pie>
                          <Tooltip
                            content={<CustomTooltip unit="demi-j." />}
                            formatter={(value, name) => [`${value} demi-j.`, name]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      {/* Legend */}
                      <div className="d-flex flex-wrap justify-content-center gap-2 mt-1">
                        {pieData.map((p, i) => (
                          <div key={i} className="d-flex align-items-center gap-1" style={{ fontSize: 12 }}>
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.couleur, display: 'inline-block', flexShrink: 0 }}></span>
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
          {granularite !== 'semaine' && stats.tendance && stats.tendance.length > 0 && (
            <Card className="mb-4">
              <Card.Header className="fw-semibold">
                <i className="fas fa-chart-line me-2 text-success"></i>
                {granularite === 'annee' ? 'Évolution mensuelle' : 'Évolution hebdomadaire'}
              </Card.Header>
              <Card.Body>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={stats.tendance} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
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
                    <Tooltip content={<CustomTooltip unit="demi-j." />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="demi_journees" name="Pointées" fill="#3498db" radius={[4, 4, 0, 0]}>
                      <LabelList dataKey="demi_journees" position="top" style={{ fill: chartColors.text, fontSize: 11 }} formatter={v => v > 0 ? v : ''} />
                    </Bar>
                    <Bar dataKey="demi_journees_possibles" name="Possibles" fill={dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)'} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card.Body>
            </Card>
          )}

          {/* Taux de présence par utilisateur (gauge-like bar) */}
          {stats.utilisateurs.length > 0 && (
            <Card className="mb-4">
              <Card.Header className="fw-semibold">
                <i className="fas fa-percentage me-2 text-info"></i>
                Taux de présence par utilisateur
              </Card.Header>
              <Card.Body>
                <ResponsiveContainer width="100%" height={Math.max(180, stats.utilisateurs.length * 44)}>
                  <BarChart
                    data={stats.utilisateurs.map(u => ({
                      nom: u.nom,
                      'Taux présence (%)': Math.round(u.taux_presence * 100),
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
                      dataKey="nom"
                      width={100}
                      tick={{ fill: chartColors.text, fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={<CustomTooltip unit="%" />}
                    />
                    <Bar dataKey="Taux présence (%)" radius={[0, 6, 6, 0]}>
                      {stats.utilisateurs.map((u, i) => (
                        <Cell
                          key={i}
                          fill={
                            u.taux_presence >= 0.8
                              ? '#2ecc71'
                              : u.taux_presence >= 0.5
                              ? '#f39c12'
                              : '#e74c3c'
                          }
                        />
                      ))}
                      <LabelList
                        dataKey="Taux présence (%)"
                        position="right"
                        style={{ fill: chartColors.text, fontSize: 12, fontWeight: 600 }}
                        formatter={v => `${v}%`}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                {/* Color legend */}
                <div className="d-flex gap-3 justify-content-center mt-2 flex-wrap" style={{ fontSize: 12 }}>
                  <span><span style={{ background: '#2ecc71', padding: '2px 10px', borderRadius: 4, marginRight: 4 }}></span>≥ 80% — Bonne présence</span>
                  <span><span style={{ background: '#f39c12', padding: '2px 10px', borderRadius: 4, marginRight: 4 }}></span>50–79% — Moyenne</span>
                  <span><span style={{ background: '#e74c3c', padding: '2px 10px', borderRadius: 4, marginRight: 4 }}></span>&lt; 50% — Faible présence</span>
                </div>
              </Card.Body>
            </Card>
          )}

          {/* Détail table */}
          <Card className="mb-4">
            <Card.Header className="fw-semibold">
              <i className="fas fa-table me-2 text-secondary"></i>
              Détail par utilisateur
            </Card.Header>
            <Card.Body className="p-0">
              <div className="table-responsive">
                <Table striped hover className="mb-0" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>Utilisateur</th>
                      <th className="text-center">Demi-j. pointées</th>
                      <th className="text-center">Demi-j. absentes</th>
                      <th className="text-center">Taux présence</th>
                      <th className="text-center">Taux absence</th>
                      <th>Projets principaux</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.utilisateurs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center text-muted py-4">
                          Aucune donnée pour cette période
                        </td>
                      </tr>
                    ) : (
                      stats.utilisateurs.map(u => (
                        <tr key={u.id}>
                          <td>
                            <div className="d-flex align-items-center gap-2">
                              <span style={{
                                width: 10, height: 10, borderRadius: '50%',
                                background: u.couleur, display: 'inline-block', flexShrink: 0,
                              }}></span>
                              <span className="fw-semibold">{u.nom}</span>
                            </div>
                          </td>
                          <td className="text-center">
                            <strong>{u.demi_journees_travaillees}</strong>
                            <span className="text-muted"> /{stats.demi_journees_possibles}</span>
                          </td>
                          <td className="text-center">
                            <span style={{ color: u.demi_journees_absentes > 0 ? '#e74c3c' : '#2ecc71' }}>
                              {u.demi_journees_absentes}
                            </span>
                          </td>
                          <td className="text-center">
                            <span style={{
                              color: u.taux_presence >= 0.8 ? '#2ecc71' : u.taux_presence >= 0.5 ? '#f39c12' : '#e74c3c',
                              fontWeight: 700,
                            }}>
                              {Math.round(u.taux_presence * 100)}%
                            </span>
                            <div style={{ height: 4, background: 'var(--bs-border-color)', borderRadius: 2, marginTop: 3, maxWidth: 80, margin: '3px auto 0' }}>
                              <div style={{
                                height: '100%',
                                width: `${Math.min(100, Math.round(u.taux_presence * 100))}%`,
                                background: u.taux_presence >= 0.8 ? '#2ecc71' : u.taux_presence >= 0.5 ? '#f39c12' : '#e74c3c',
                                borderRadius: 2,
                              }}></div>
                            </div>
                          </td>
                          <td className="text-center" style={{ color: '#e74c3c' }}>
                            {Math.round(u.taux_absence * 100)}%
                          </td>
                          <td>
                            <div className="d-flex flex-wrap gap-1">
                              {u.par_projet.slice(0, 4).map(p => (
                                <Badge
                                  key={p.projet_id}
                                  style={{ background: p.couleur, fontSize: 10 }}
                                >
                                  {p.nom} ({p.demi_journees})
                                </Badge>
                              ))}
                              {u.par_projet.length > 4 && (
                                <Badge bg="secondary" style={{ fontSize: 10 }}>
                                  +{u.par_projet.length - 4}
                                </Badge>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {stats.utilisateurs.length > 0 && (
                    <tfoot>
                      <tr className="fw-semibold">
                        <td>Total</td>
                        <td className="text-center">
                          {stats.utilisateurs.reduce((s, u) => s + u.demi_journees_travaillees, 0)}
                        </td>
                        <td className="text-center">
                          {stats.utilisateurs.reduce((s, u) => s + u.demi_journees_absentes, 0)}
                        </td>
                        <td className="text-center">
                          {globalTaux !== null ? `${globalTaux}%` : '—'}
                        </td>
                        <td className="text-center">
                          {globalTaux !== null ? `${100 - globalTaux}%` : '—'}
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
          {stats.utilisateurs.filter(u => u.par_projet.length > 0).length > 0 && (
            <Card className="mb-4">
              <Card.Header className="fw-semibold">
                <i className="fas fa-layer-group me-2" style={{ color: '#9b59b6' }}></i>
                Répartition par projet (par utilisateur)
              </Card.Header>
              <Card.Body>
                <ResponsiveContainer width="100%" height={Math.max(180, stats.utilisateurs.length * 44 + 40)}>
                  <BarChart
                    data={stats.utilisateurs.filter(u => u.demi_journees_travaillees > 0).map(u => {
                      const row = { nom: u.nom };
                      u.par_projet.forEach(p => { row[p.nom] = p.demi_journees; });
                      return row;
                    })}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} horizontal={false} />
                    <XAxis type="number" tick={{ fill: chartColors.text, fontSize: 11 }} axisLine={{ stroke: chartColors.axisLine }} tickLine={false} />
                    <YAxis type="category" dataKey="nom" width={100} tick={{ fill: chartColors.text, fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {stats.projets.map(p => (
                      <Bar key={p.projet_id} dataKey={p.nom} stackId="a" fill={p.couleur} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </Card.Body>
            </Card>
          )}

          {/* Distribution par code pointage */}
          {stats.codes_pointage && stats.codes_pointage.length > 0 && (
            <Row className="g-3 mb-4">
              <Col xs={12} lg={7}>
                <Card className="h-100">
                  <Card.Header className="fw-semibold">
                    <i className="fas fa-tags me-2" style={{ color: '#e67e22' }}></i>
                    Temps passé par code pointage
                  </Card.Header>
                  <Card.Body>
                    <ResponsiveContainer width="100%" height={Math.max(200, stats.codes_pointage.length * 48)}>
                      <BarChart
                        data={stats.codes_pointage}
                        layout="vertical"
                        margin={{ top: 5, right: 40, left: 10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} horizontal={false} />
                        <XAxis
                          type="number"
                          tick={{ fill: chartColors.text, fontSize: 11 }}
                          axisLine={{ stroke: chartColors.axisLine }}
                          tickLine={false}
                          label={{ value: 'demi-journées', position: 'insideBottomRight', offset: -10, fill: chartColors.text, fontSize: 11 }}
                        />
                        <YAxis
                          type="category"
                          dataKey="code"
                          width={120}
                          tick={{ fill: chartColors.text, fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip content={<CustomTooltip unit="demi-j." />} />
                        <Bar dataKey="demi_journees" name="Demi-journées" fill="#e67e22" radius={[0, 4, 4, 0]}>
                          <LabelList dataKey="demi_journees" position="right" style={{ fill: chartColors.text, fontSize: 11 }} formatter={v => v > 0 ? v : ''} />
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
                    Répartition par code pointage
                  </Card.Header>
                  <Card.Body className="d-flex flex-column align-items-center justify-content-center">
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={stats.codes_pointage}
                          dataKey="demi_journees"
                          nameKey="code"
                          cx="50%"
                          cy="50%"
                          outerRadius={85}
                          innerRadius={40}
                          paddingAngle={2}
                        >
                          {stats.codes_pointage.map((entry, index) => (
                            <Cell
                              key={index}
                              fill={`hsl(${(index * 47 + 30) % 360}, 65%, 55%)`}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          content={<CustomTooltip unit="demi-j." />}
                          formatter={(value, name) => [`${value} demi-j.`, name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="d-flex flex-wrap justify-content-center gap-2 mt-1">
                      {stats.codes_pointage.map((cp, i) => (
                        <div key={i} className="d-flex align-items-center gap-1" style={{ fontSize: 12 }}>
                          <span style={{ width: 10, height: 10, borderRadius: '50%', background: `hsl(${(i * 47 + 30) % 360}, 65%, 55%)`, display: 'inline-block', flexShrink: 0 }}></span>
                          <span>{cp.code}</span>
                          <Badge bg="secondary" style={{ fontSize: 10 }}>{cp.demi_journees}</Badge>
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

      {stats && !loading && stats.utilisateurs.length === 0 && stats.projets.length === 0 && (
        <Alert variant="info" className="mt-3">
          <i className="fas fa-info-circle me-2"></i>
          Aucun pointage trouvé pour cette période. Essayez de modifier les filtres.
        </Alert>
      )}
    </div>
  );
}
