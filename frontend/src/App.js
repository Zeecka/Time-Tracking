import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
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

const THEME_STORAGE_KEY = 'pointage-theme';

const getInitialTheme = () => {
  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === 'light' || storedTheme === 'dark') {
    return storedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

function App() {
  const [theme, setTheme] = useState(getInitialTheme);
  const { t } = useTranslation();

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

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <Router>
      <div className="App">
        <Navbar bg={theme === 'dark' ? 'dark' : 'light'} variant={theme === 'dark' ? 'dark' : 'light'} expand="lg">
          <Container>
            <Navbar.Brand as={Link} to="/">
              {t('app.brand')}
            </Navbar.Brand>
            <Navbar.Toggle aria-controls="basic-navbar-nav" />
            <Navbar.Collapse id="basic-navbar-nav">
              <Nav className="me-auto">
                <Nav.Link as={Link} to="/stats">
                  {t('nav.stats')}
                </Nav.Link>
                <Nav.Link as={Link} to="/projects">
                  {t('nav.projects')}
                </Nav.Link>
                <Nav.Link as={Link} to="/tracking-codes">
                  {t('nav.trackingCodes')}
                </Nav.Link>
                <Nav.Link as={Link} to="/users">
                  {t('nav.users')}
                </Nav.Link>
                <Nav.Link as={Link} to="/export">
                  {t('nav.export')}
                </Nav.Link>
              </Nav>
              <Nav>
                <div className="d-flex align-items-center gap-2">
                  <Button
                    variant="link"
                    aria-label={t('nav.currentTheme')}
                    disabled
                    className="d-flex align-items-center justify-content-center"
                    style={{
                      color: 'var(--bs-body-color)',
                      border: 'none',
                      padding: '0.5rem',
                      cursor: 'default',
                      fontSize: '1.25rem',
                      textDecoration: 'none',
                    }}
                  >
                    <i className={`fas fa-${theme === 'light' ? 'sun' : 'moon'}`}></i>
                  </Button>
                  <Form.Check
                    type="switch"
                    id="theme-switch"
                    checked={theme === 'light'}
                    onChange={toggleTheme}
                    aria-label={t('nav.toggleTheme')}
                    style={{ margin: '0' }}
                  />
                </div>
              </Nav>
            </Navbar.Collapse>
          </Container>
        </Navbar>

        <Container className="mt-4">
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
        </Container>
      </div>
    </Router>
  );
}

export default App;
