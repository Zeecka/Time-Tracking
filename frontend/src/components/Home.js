import React from 'react';
import { Container, Row, Col, Card } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

function Home() {
  const { t } = useTranslation();

  return (
    <Container>
      <Row className="my-5">
        <Col>
          <h1 style={{ fontWeight: 700 }}>
            <i className="fas fa-business-time me-2" style={{ color: '#3498db' }}></i>
            {t('home.title')}
          </h1>
          <p className="lead">
            {t('home.description')}
          </p>
        </Col>
      </Row>

      <Row className="g-4">
        <Col md={6}>
          <Card>
            <Card.Body>
              <Card.Title>{t('home.features.tracking')}</Card.Title>
              <Card.Text>
                {t('home.features.trackingDesc')}
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>

        <Col md={6}>
          <Card>
            <Card.Body>
              <Card.Title>{t('nav.projects')}</Card.Title>
              <Card.Text>
                {t('project.title')}
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>

        <Col md={6}>
          <Card>
            <Card.Body>
              <Card.Title>{t('nav.trackingCodes')}</Card.Title>
              <Card.Text>
                {t('trackingCode.title')}
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>

        <Col md={6}>
          <Card>
            <Card.Body>
              <Card.Title>{t('nav.users')}</Card.Title>
              <Card.Text>
                {t('user.title')}
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}

export default Home;
