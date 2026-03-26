import React, { useEffect, useState } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  Navigate,
  NavLink,
  useLocation,
} from 'react-router-dom';
import { Navbar, Nav, Container, Button, Form } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

// Import components
import TrackingCodeList from './components/TrackingCodeList';
import ProjectList from './components/ProjectList';
import UserList from './components/UserList';
import TimeEntryGrid from './components/TimeEntryGrid';
import Home from './components/Home';
import ExportExcel from './components/ExportExcel';
import Stats from './components/Stats';

const THEME_STORAGE_KEY = 'record-theme';
const LANGUAGE_STORAGE_KEY = 'record-language';
const SUPPORTED_LANGUAGES = ['en', 'fr'];
const PRIMARY_NAV_ITEMS = [
  { to: '/', labelKey: 'timeEntry.title', icon: 'calendar-alt', end: true },
  { to: '/stats', labelKey: 'nav.stats', icon: 'chart-line' },
  { to: '/projects', labelKey: 'nav.projects', icon: 'folder-open' },
  { to: '/tracking-codes', labelKey: 'nav.trackingCodes', icon: 'barcode' },
  { to: '/users', labelKey: 'nav.users', icon: 'users' },
  { to: '/export', labelKey: 'nav.export', icon: 'file-export' },
];
const normalizeLanguage = (value) => {
  if (typeof value !== 'string') {
    return 'en';
  }

  const normalized = value.toLowerCase().split('-')[0];
  return SUPPORTED_LANGUAGES.includes(normalized) ? normalized : 'en';
};

const getInitialTheme = () => {
  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === 'light' || storedTheme === 'dark') {
    return storedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

function AppLayout({
  theme,
  language,
  onToggleTheme,
  onLanguageChange,
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const isTimeEntryPage = location.pathname === '/' || location.pathname.startsWith('/time-entries');

  return (
    <div className="App">
      <Navbar
        bg={theme === 'dark' ? 'dark' : 'light'}
        variant={theme === 'dark' ? 'dark' : 'light'}
        expand="lg"
        className="app-navbar"
      >
        <Container>
          <Navbar.Brand as={Link} to="/" className="app-brand">
            <span className="app-brand-mark">
              <i className="fas fa-stopwatch"></i>
            </span>
            <span>
              <span className="app-brand-title">{t('app.brand')}</span>
              <span className="app-brand-subtitle">{t('app.description')}</span>
            </span>
          </Navbar.Brand>
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          <Navbar.Collapse id="basic-navbar-nav">
            <Nav className="me-auto app-nav-links">
              {PRIMARY_NAV_ITEMS.map((item) => (
                <Nav.Link
                  key={item.to}
                  as={NavLink}
                  to={item.to}
                  end={item.end}
                  className="app-nav-link"
                >
                  <i className={`fas fa-${item.icon}`}></i>
                  <span>{t(item.labelKey)}</span>
                </Nav.Link>
              ))}
            </Nav>
            <Nav className="app-nav-actions">
              <div className="app-toolbar">
                <div className="app-toolbar-chip app-toolbar-chip--language">
                  <span className="app-toolbar-label">{language.toUpperCase()}</span>
                  <Form.Select
                    size="sm"
                    value={language}
                    onChange={onLanguageChange}
                    aria-label={t('nav.selectLanguage')}
                    className="app-toolbar-select"
                  >
                    <option value="en">EN</option>
                    <option value="fr">FR</option>
                  </Form.Select>
                </div>
                <div className="app-toolbar-chip app-toolbar-chip--theme">
                  <Button
                    variant="link"
                    aria-label={t('nav.currentTheme')}
                    disabled
                    className="app-theme-indicator"
                  >
                    <i className={`fas fa-${theme === 'light' ? 'sun' : 'moon'}`}></i>
                  </Button>
                  <Form.Check
                    type="switch"
                    id="theme-switch"
                    checked={theme === 'light'}
                    onChange={onToggleTheme}
                    aria-label={t('nav.toggleTheme')}
                    className="app-theme-switch"
                  />
                </div>
              </div>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      <Container className="app-shell">
        <main className={`app-main-container${isTimeEntryPage ? '' : ' app-content-panel'}`}>
          <Routes>
            <Route path="/" element={<TimeEntryGrid viewMode="gantt" />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/home" element={<Home />} />
            <Route path="/time-entries" element={<Navigate to="/time-entries/gantt" replace />} />
            <Route path="/time-entries/table" element={<TimeEntryGrid viewMode="table" />} />
            <Route path="/time-entries/gantt" element={<TimeEntryGrid viewMode="gantt" />} />
            <Route path="/time-entries/synthesis" element={<TimeEntryGrid viewMode="synthesis" />} />
            <Route path="/projects" element={<ProjectList />} />
            <Route path="/tracking-codes" element={<TrackingCodeList />} />
            <Route path="/users" element={<UserList />} />
            <Route path="/export" element={<ExportExcel />} />
          </Routes>
        </main>
      </Container>
    </div>
  );
}

function App() {
  const [theme, setTheme] = useState(getInitialTheme);
  const { i18n } = useTranslation();
  const [language, setLanguage] = useState(() => normalizeLanguage(i18n.resolvedLanguage || i18n.language));

  useEffect(() => {
    document.documentElement.setAttribute('data-bs-theme', theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event) => {
      const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (!storedTheme) {
        setTheme(event.matches ? 'dark' : 'light');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    const handleLanguageChanged = (nextLanguage) => {
      setLanguage(normalizeLanguage(nextLanguage));
    };

    i18n.on('languageChanged', handleLanguageChanged);
    return () => i18n.off('languageChanged', handleLanguageChanged);
  }, [i18n]);

  useEffect(() => {
    const nextLanguage = normalizeLanguage(i18n.resolvedLanguage || i18n.language);
    setLanguage(nextLanguage);
  }, [i18n]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleLanguageChange = async (event) => {
    const nextLanguage = normalizeLanguage(event.target.value);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);

    if (nextLanguage !== normalizeLanguage(i18n.language)) {
      await i18n.changeLanguage(nextLanguage);
    }
  };

  return (
    <Router>
      <AppLayout
        theme={theme}
        language={language}
        onToggleTheme={toggleTheme}
        onLanguageChange={handleLanguageChange}
      />
    </Router>
  );
}

export default App;
