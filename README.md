# Matchmaking Platform

Bot Discord de matchmaking nouvelle génération (style Omegle, intégré à Discord),
pensé comme un SaaS : bot + panel embed interactif + onboarding humain.

> **Architecture 100 % Discord.** Pas de site web : tout se passe dans Discord
> via des commandes slash, un **panel embed interactif** (`/panel`) et un
> **tutoriel d'onboarding** automatique en salon privé.

## Monorepo (npm workspaces)

```
packages/core   Moteur de matchmaking (types, pool d'attente, Matchmaker, Storage)
packages/db     Prisma schema + client (profiles, matches, modération, économie)
packages/bot    Bot Discord.js (commandes, panel embed, onboarding, salons privés)
infra/          Docker (Postgres, Redis) + reverse proxy (à venir)
```

## Fonctionnalités livrées

- **Matchmaking** texte / vocal / les deux, portée mondial / serveur / partenaires.
- **Panel embed interactif** (`/panel`) : statut live, choix mode/portée, boutons
  Rejoindre / Quitter / Statut / Profil — l'embed se met à jour en place.
- **Onboarding humain** : à `guildMemberAdd`, le bot crée un **salon privé** et
  guide le nouveau membre (accueil, langue, intérêts, explication du serveur)
  avec un indicateur "…est en train d'écrire", puis bouton "Lancer mon 1er match".
- Salons privés automatiques + **bridge de messages** entre serveurs.
- Modération de base : `/report`, `/block`, boutons Next/Leave/Block/Report.

## Démarrage rapide (dev, zéro dépendance externe)

```bash
cp .env.example .env        # renseigne DISCORD_TOKEN
npm install
npm run dev:bot             # stockage mémoire (QUEUE_BACKEND=memory)
```

## Démarrage prod (Postgres + Redis)

```bash
docker compose up -d
# .env : STORAGE_BACKEND=postgres, QUEUE_BACKEND=redis, DATABASE_URL, REDIS_URL
npm run db:generate
npm run db:migrate
npm run dev:bot
```

## Commandes Discord

`/profile` · `/panel` (panel fixe du serveur) · `/queue` · `/next` · `/leave` · `/report` · `/block` · `/help`

## Roadmap

- [ ] `PrismaStorage` (persistance Postgres)
- [ ] Anti-abus (rate-limit, anti-raid, CAPTCHA), premium, économie/classements
- [ ] Stats live dans le panel embed (en attente, matchs actifs)
