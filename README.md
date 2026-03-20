# Application de Pointage

![Backend Flask](https://img.shields.io/badge/Backend-Flask-000000?logo=flask)
![Frontend React](https://img.shields.io/badge/Frontend-React-20232A?logo=react)
![Database MariaDB](https://img.shields.io/badge/Database-MariaDB-003545?logo=mariadb)
![Docker Compose](https://img.shields.io/badge/Dev-Docker%20Compose-2496ED?logo=docker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Application web de gestion de pointage (time tracking) pour remplacer les tableaux croisés dynamiques Excel.

## Technologies

- **Backend**: Flask (Python) + SQLAlchemy + MariaDB
- **Frontend**: React + Bootstrap + React Router
- **Infrastructure**: Docker + Docker Compose

## Architecture

### Modèle de données

1. **CodePointage**: Code unique de pointage (128 caractères)
2. **Projet**: Nom de projet unique, lié à un code pointage (relation many-to-one)
3. **Utilisateur**: Nom, couleur d'identification, support OIDC futur
4. **Pointage**: Saisie de temps avec nombre de jours, numéro de semaine, année, utilisateur et projet

## Installation rapide

Les détails d'installation et de développement ont été déplacés dans la documentation dédiée :

- [Guide de développement](docs/README_DEV.md)

### Développement

Pour démarrer rapidement en mode développement :

```bash
docker compose -f compose.dev.yml up --build --watch
```

Services disponibles :
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **MariaDB**: localhost:3306

### Production

1. Préparer le fichier d'environnement :

```bash
cp .env.example .env
```

2. Mettre à jour les secrets/valeurs de production dans `.env` (au minimum `MYSQL_*` et `SECRET_KEY`).

3. Démarrer la stack production :

```bash
docker compose -f compose.yml up -d --build
```

4. Accéder à l'application :

- **Frontend (Nginx)**: http://localhost
- **API via frontend**: http://localhost/api/v1

Pour arrêter :

```bash
docker compose -f compose.yml down
```

Documentation technique (structure du projet + API REST) : [docs/README_DEV.md](docs/README_DEV.md).

## Captures d'écran

### Vue Gantt

![Vue Gantt](docs/assets/gantt.png)

### Statistiques

![Statistiques](docs/assets/stats.png)

### Export

![Export](docs/assets/export.png)

## Fonctionnalités

### Codes Pointage
- Création, modification et suppression de codes de pointage
- Code unique de 128 caractères maximum
- Protection contre la suppression si des projets utilisent le code

### Projets
- Gestion des projets avec nom unique
- Association à un code pointage obligatoire
- Protection contre la suppression si des pointages existent

### Utilisateurs
- Gestion des utilisateurs avec nom et couleur
- Sélecteur de couleur visuel (format hexadécimal #RRGGBB)
- Support OIDC prévu (champ `sub` nullable)
- Protection contre la suppression si des pointages existent

### Pointages
- Saisie de temps par utilisateur et projet
- Support des demi-journées (décimales : 0.5, 2.5, etc.)
- Numéro de semaine ISO (1-53)
- Année de référence
- Filtrage par année et semaine
- Contrainte d'unicité : un seul pointage par utilisateur/projet/semaine/année
- Interface de type tableur pour une saisie rapide

### Import / Export CSV
- Import CSV pour **Utilisateurs**, **Codes Pointage**, **Projets** et **Pointages**
- Export CSV pour **Utilisateurs**, **Codes Pointage**, **Projets** et **Pointages**
- Fichiers CSV d'exemple téléchargeables depuis l'interface :
	- `/examples/utilisateurs_exemple.csv`
	- `/examples/codes_pointage_exemple.csv`
	- `/examples/projets_exemple.csv`
	- `/examples/pointages_exemple.csv`

## Développement

Toute la documentation de développement (setup, seed, exécution locale, type-checking, notes techniques) est disponible dans [docs/README_DEV.md](docs/README_DEV.md).

## Évolutions futures

- [ ] Authentification OIDC
- [ ] Interface type tableur avancée (AG-Grid)
- [ ] Rapports et statistiques (agrégations par projet/utilisateur/période)
- [ ] Gestion des permissions utilisateurs
- [ ] Soft delete pour l'historique
- [ ] API de recherche full-text
- [ ] Notifications et rappels
- [ ] Ajout d'une fonctionnalité d'export/import COMPLET de la DB
- [ ] Conversion du repos en anglais avec support i18n

## Licence

Distribué sous licence MIT. Voir [LICENSE](LICENSE).
