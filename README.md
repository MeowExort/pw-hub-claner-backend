# Backend API (NestJS + Prisma + Postgres)

## Prerequisites
- Node.js (v16+)
- Docker & Docker Compose (for Postgres)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start Postgres database:
   ```bash
   docker-compose up -d
   ```

3. Generate Prisma client and push schema:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. Start the server:
   ```bash
   npm run start:dev
   ```

## Endpoints
- **Users:**
  - `GET /api/users/me` - Get current user (auto-created if missing)
  - `POST /api/users/me/characters` - Create character
  - `PUT /api/users/me/active-character` - Switch active character
  - `GET /api/users/me/clan` - Get clan of active character

- **Events:**
  - `GET /api/events` - List all events
  - `POST /api/events` - Create event
  - `GET /api/events/:id` - Get event details

## Authentication
Use `Authorization: Bearer <any-token>` header. The token is not validated but required (mock auth).
