import React from 'react';
import { Container, Row, Col, Card, Button } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

function Home() {
  const { t } = useTranslation();
  const highlights = [
    {
      title: t('home.features.tracking'),
      description: t('home.features.trackingDesc'),
      to: '/time-entries/gantt',
      icon: 'calendar-alt',
    },
    {
      title: t('nav.stats'),
      description: t('home.features.statsDesc'),
      to: '/stats',
      icon: 'chart-line',
    },
    {
      title: t('nav.projects'),
      description: t('project.title'),
      to: '/projects',
      icon: 'folder-open',
    },
    {
      title: t('nav.export'),
      description: t('home.features.exportDesc'),
      to: '/export',
      icon: 'file-export',
    },
  ];

  return (
    <Container fluid className="px-0">
      <Row className="g-4 align-items-stretch mb-4">
        <Col lg={7}>
          <Card className="h-100 border-0">
            <Card.Body className="p-4 p-lg-5">
              <span className="app-kicker mb-3">{t('app.brand')}</span>
              <h2 className="app-hero-title mb-3">
                <span className="app-hero-icon">
                  <i className="fas fa-business-time"></i>
                </span>
                {t('home.welcome')}
              </h2>
              <p className="lead mb-4">{t('home.description')}</p>
              <div className="d-flex flex-wrap gap-2">
                <Button as={Link} to="/time-entries/gantt" variant="primary">
                  {t('grid.ganttView')}
                </Button>
                <Button as={Link} to="/stats" variant="outline-primary">
                  {t('nav.stats')}
                </Button>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col lg={5}>
          <Card className="h-100 border-0">
            <Card.Body className="p-4 d-flex flex-column justify-content-between">
              <div>
                <div className="app-spotlight-label mb-2">{t('nav.export')}</div>
                <h3 className="h4 fw-bold mb-2">{t('home.features.export')}</h3>
                <p className="mb-0 text-muted">{t('home.features.exportDesc')}</p>
              </div>
              <div className="d-flex flex-wrap gap-2 mt-4">
                <Button as={Link} to="/export" variant="outline-primary">
                  {t('nav.export')}
                </Button>
                <Button as={Link} to="/projects" variant="outline-secondary">
                  {t('nav.projects')}
                </Button>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row className="g-4">
        {highlights.map((item) => (
          <Col md={6} xl={3} key={item.to}>
            <Card className="h-100 border-0">
              <Card.Body className="p-4 d-flex flex-column">
                <div className="app-hero-icon mb-3">
                  <i className={`fas fa-${item.icon}`}></i>
                </div>
                <Card.Title className="fw-bold mb-2">{item.title}</Card.Title>
                <Card.Text className="text-muted flex-grow-1">{item.description}</Card.Text>
                <Button as={Link} to={item.to} variant="outline-primary">
                  {item.title}
                </Button>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>
    </Container>
  );
}

export default Home;
