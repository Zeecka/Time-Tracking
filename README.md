# Application de Pointage

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

Pour démarrer rapidement :

```bash
docker compose -f compose.dev.yml up --build --watch
```

Services disponibles :
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **MariaDB**: localhost:3306

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

## Développement

Toute la documentation de développement (setup, seed, exécution locale, type-checking, notes techniques) est disponible dans [docs/README_DEV.md](docs/README_DEV.md).

## Évolutions futures

- [ ] Authentification OIDC
- [ ] Interface type tableur avancée (AG-Grid)
- [ ] Rapports et statistiques (agrégations par projet/utilisateur/période)
- [ ] Import/Export CSV
- [ ] Gestion des permissions utilisateurs
- [ ] Soft delete pour l'historique
- [ ] API de recherche full-text
- [ ] Notifications et rappels

## Licence

Projet privé - Tous droits réservés
