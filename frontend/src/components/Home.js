import React from 'react';
import { Container, Row, Col, Card } from 'react-bootstrap';

function Home() {
  return (
    <Container>
      <Row className="my-5">
        <Col>
          <h1 style={{ fontWeight: 700 }}>
            <i className="fas fa-business-time me-2" style={{ color: '#3498db' }}></i>
            Application de Pointage
          </h1>
          <p className="lead">
            Bienvenue dans l'application de gestion de pointage. Cette application vous permet de gérer
            vos codes de pointage, projets, utilisateurs et saisies de temps.
          </p>
        </Col>
      </Row>

      <Row className="g-4">
        <Col md={6}>
          <Card>
            <Card.Body>
              <Card.Title>Pointages</Card.Title>
              <Card.Text>
                Saisissez et gérez vos heures de travail par projet et par semaine.
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>

        <Col md={6}>
          <Card>
            <Card.Body>
              <Card.Title>Projets</Card.Title>
              <Card.Text>
                Gérez vos projets et associez-les à des codes de pointage.
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>

        <Col md={6}>
          <Card>
            <Card.Body>
              <Card.Title>Codes Pointage</Card.Title>
              <Card.Text>
                Créez et gérez les codes de pointage utilisés pour catégoriser vos projets.
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>

        <Col md={6}>
          <Card>
            <Card.Body>
              <Card.Title>Utilisateurs</Card.Title>
              <Card.Text>
                Gérez les utilisateurs de l'application avec leurs couleurs d'identification.
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}

export default Home;
