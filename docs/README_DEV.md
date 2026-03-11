# Guide de développement

Cette documentation regroupe toutes les informations techniques utiles au développement local.

## Structure du projet

```
pointage/
├── compose.dev.yml            # Orchestration dev (watch + reload)
├── compose.yml                # Orchestration standard
├── package.json               # Scripts utilitaires racine
├── README.md                  # Documentation principale
├── backend/                   # Application Flask
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── __init__.py       # Factory Flask
│       ├── config.py         # Configuration
│       ├── models.py         # Modèles SQLAlchemy
│       ├── schemas.py        # Schémas Marshmallow
│       ├── extensions.py     # Extensions Flask
│       └── routes/           # Blueprints API REST
│           ├── code_pointage.py
│           ├── projet.py
│           ├── utilisateur.py
│           └── pointage.py
├── frontend/                  # Application React
│   ├── Dockerfile
│   ├── package.json
│   ├── public/
│   └── src/
│       ├── App.js            # Application principale
│       ├── index.js          # Point d'entrée
│       ├── services/
│       │   └── api.js        # Client API Axios
│       └── components/       # Composants React
└── docs/
    └── assets/               # Captures d'écran et ressources
```

## API REST

### Endpoints

Toutes les routes API sont préfixées par `/api/v1`.

#### Code Pointage
- `GET /api/v1/code-pointage` - Liste tous les codes
- `GET /api/v1/code-pointage/{id}` - Détails d'un code
- `POST /api/v1/code-pointage` - Créer un code
- `PUT /api/v1/code-pointage/{id}` - Modifier un code
- `DELETE /api/v1/code-pointage/{id}` - Supprimer un code

#### Projets
- `GET /api/v1/projets` - Liste tous les projets
- `GET /api/v1/projets/{id}` - Détails d'un projet
- `POST /api/v1/projets` - Créer un projet
- `PUT /api/v1/projets/{id}` - Modifier un projet
- `DELETE /api/v1/projets/{id}` - Supprimer un projet

#### Utilisateurs
- `GET /api/v1/utilisateurs` - Liste tous les utilisateurs
- `GET /api/v1/utilisateurs/{id}` - Détails d'un utilisateur
- `POST /api/v1/utilisateurs` - Créer un utilisateur
- `PUT /api/v1/utilisateurs/{id}` - Modifier un utilisateur
- `DELETE /api/v1/utilisateurs/{id}` - Supprimer un utilisateur

#### Pointages
- `GET /api/v1/pointages` - Liste tous les pointages (avec filtres optionnels)
- `GET /api/v1/pointages/{id}` - Détails d'un pointage
- `POST /api/v1/pointages` - Créer un pointage
- `POST /api/v1/pointages/bulk` - Créer plusieurs pointages
- `PUT /api/v1/pointages/{id}` - Modifier un pointage
- `DELETE /api/v1/pointages/{id}` - Supprimer un pointage

#### Filtres disponibles pour les pointages
- `utilisateur_id` - Filtrer par utilisateur
- `projet_id` - Filtrer par projet
- `numero_semaine` - Filtrer par numéro de semaine
- `annee` - Filtrer par année

## Prérequis

- Docker
- Docker Compose

## Configuration

1. Copiez le fichier d'environnement :

```bash
cp .env.example .env
```

2. Modifiez `.env` selon vos besoins (optionnel pour le développement)

## Démarrage avec Docker Compose

```bash
# Construire et démarrer tous les services
docker compose -f compose.yml up --build

# Ou en arrière-plan
docker compose -f compose.yml up -d --build
```

## Mode développement (watch + reload live)

```bash
# Docker Compose v2 (recommandé)
docker compose -f compose.dev.yml up --build --watch
```

Ce mode active :
- **Backend Flask** en `--debug` (reload auto à chaque changement)
- **Frontend React** avec rechargement à chaud
- **Watch Docker Compose** (sync des fichiers + rebuild si dépendances changent)

Les services seront disponibles sur :
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **MariaDB**: localhost:3306

## Initialisation de la base de données

```bash
# Se connecter au conteneur backend
docker exec -it pointage_backend bash

# Les tables sont créées automatiquement au démarrage de l'application
flask seed-dev

# En cas d'évolution du schéma (sans migrations), réinitialiser la base
flask init-db --reset
flask seed-dev
```

## Arrêt des services

```bash
docker compose -f compose.yml down

# Avec suppression des volumes (données)
docker compose -f compose.yml down -v
```

## Données de développement (`seed-dev`)

La commande `flask seed-dev` peuple la base avec un jeu de données complet couvrant toutes les fonctionnalités de l'application.

### Codes de pointage (7)

| Code | Rôle |
|------|------|
| `DEV` | Développement |
| `BUG` | Correction de bugs |
| `DOC` | Documentation / Formation |
| `RUN` | Infrastructure / Opérations |
| `MEET` | Réunions / Rituels |
| `ABS` | Absences |
| `ARCV` | Code archivé sans projet (teste la suppression sans conflit 409) |

### Projets (11)

| Projet | Code | Motif | Particularité |
|--------|------|-------|---------------|
| Portail Client | DEV | uni | — |
| API Facturation | BUG | pointille | — |
| Application Mobile | DEV | pointille | — |
| Refonte UI | DOC | uni | — |
| Infra CI/CD | RUN | uni | — |
| Rituels Equipe | MEET | pointille | — |
| Jour Férié | ABS | raye | Absence |
| RTT | ABS | raye | Absence |
| Arrêt Maladie | ABS | raye | Absence |
| Formation Azure | DOC | uni | — |
| Veille Technologique | DOC | uni | **Aucun pointage** — teste l'UI d'un projet vide |

Les trois motifs (`uni`, `raye`, `pointille`) sont couverts.

### Utilisateurs (5)

| Nom | Couleur | OIDC `sub` |
|-----|---------|------------|
| Alice Martin | `#3b82f6` | — |
| Yassine Benali | `#14b8a6` | — |
| Sophie Leroy | `#a855f7` | — |
| Thomas Bernard | `#f59e0b` | — |
| Camille Dupont | `#ef4444` | `oidc-sub-camille-001` (teste la contrainte d'unicité OIDC) |

### Pointages (≈ 84)

Les pointages couvrent **5 semaines** (semaine−3 à semaine+1 par rapport à la date courante) et illustrent tous les cas limites :

| Cas de test | Description |
|-------------|-------------|
| Full-day | `matin → soir` sur un seul jour |
| Demi-journée matin | `matin → midi` |
| Demi-journée après-midi | `midi → soir` |
| Bloc multi-jours | ex. mardi → jeudi (test Gantt / fusion) |
| Inter-jours | `lundi midi → mardi soir` (chevauchement de demi-journée entre deux jours) |
| RTT | Alice mer sem−1, Camille mer sem−1, Alice lun sem+1 |
| Jour Férié | Thomas lun sem−1 (note : "Lundi de Pâques") |
| Arrêt Maladie | Yassine jeu-ven sem−1 (multi-jours + note médicale) |
| Notes | 6 entrées annotées (bug critique, formations, absences) |
| Semaine courante partielle | Seuls les jours jusqu'à aujourd'hui sont remplis |
| Planification future | RTT Alice + semaine formation complète Thomas (sem+1) |

## Développement local sans Docker

### Backend (Flask)

```bash
cd backend
pip install -r requirements.txt
flask run
```

### Frontend (React)

```bash
cd frontend
npm install
npm start
```

## Type checking Python (ty)

```bash
# Depuis la racine du projet
pip install ty

# Vérifier le backend
ty check backend/app
```

Configuration centralisée dans `pyproject.toml` via `[tool.ty]`.

## Notes techniques

- **Semaines ISO 8601**: Les numéros de semaine suivent la norme ISO (semaine commence le lundi)
- **Précision des jours**: Stocké en DECIMAL(5,2) pour supporter les demi-journées
- **Couleurs**: Format hexadécimal strict #RRGGBB validé côté serveur
- **CORS**: Configuré pour accepter les requêtes depuis le frontend React
- **Schéma DB**: Création automatique des tables au démarrage via SQLAlchemy (`db.create_all()`)
