import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import { Navbar, Nav, Container, Button, Form } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';

// Import components
import CodePointageList from './components/CodePointageList';
import ProjetList from './components/ProjetList';
import UtilisateurList from './components/UtilisateurList';
import PointageGrid from './components/PointageGrid';
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
              Pointage
            </Navbar.Brand>
            <Navbar.Toggle aria-controls="basic-navbar-nav" />
            <Navbar.Collapse id="basic-navbar-nav">
              <Nav className="me-auto">
                <Nav.Link as={Link} to="/">
                  Accueil
                </Nav.Link>
                <Nav.Link as={Link} to="/pointages/table">
                  Pointages
                </Nav.Link>
                <Nav.Link as={Link} to="/pointages/gantt">
                  Gantt
                </Nav.Link>
                <Nav.Link as={Link} to="/projets">
                  Projets
                </Nav.Link>
                <Nav.Link as={Link} to="/code-pointage">
                  Codes Pointage
                </Nav.Link>
                <Nav.Link as={Link} to="/utilisateurs">
                  Utilisateurs
                </Nav.Link>
                <Nav.Link as={Link} to="/export">
                  Export Excel
                </Nav.Link>
              </Nav>
              <Nav>
                <div className="d-flex align-items-center gap-2">
                  <Button
                    variant="link"
                    aria-label="Thème actuel"
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
                    aria-label="Changer le thème"
                    style={{ margin: '0' }}
                  />
                </div>
              </Nav>
            </Navbar.Collapse>
          </Container>
        </Navbar>

        <Container className="mt-4">
          <Routes>
            <Route path="/" element={<Stats />} />
            <Route path="/home" element={<Home />} />
            <Route path="/pointages" element={<Navigate to="/pointages/table" replace />} />
            <Route path="/pointages/table" element={<PointageGrid viewMode="table" />} />
            <Route path="/pointages/gantt" element={<PointageGrid viewMode="gantt" />} />
            <Route path="/projets" element={<ProjetList />} />
            <Route path="/code-pointage" element={<CodePointageList />} />
            <Route path="/utilisateurs" element={<UtilisateurList />} />
            <Route path="/export" element={<ExportExcel />} />
          </Routes>
        </Container>
      </div>
    </Router>
  );
}

export default App;
