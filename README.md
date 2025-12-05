# Backend Delight Desk

A NestJS-based backend service for Delight Desk, featuring modular architecture, user management, authentication, billing plans, and email integration.

## Getting Started

### Prerequisites

- Node.js (v18+ recommended)
- npm or yarn
- PostgreSQL database

### Installation

```bash
git clone <repository-url>
cd backend_delight_desk
npm install
```

### Environment Variables

Create a `.env` file in the project root. Example:

```
DATABASE_URL=postgres://user:password@localhost:5432/dbname
SESSION_SECRET=your-session-secret
SENDGRID_API_KEY=your-sendgrid-api-key
```

### Database Setup

Generate and run migrations:

```bash
npm run db:generate
npm run db:push
npm run db:migrate
```

(Optional) Seed billing plans:

```bash
npm run seed:billing
```

### Running the Application

#### Development

```bash
npm run start:dev
```

#### Production

```bash
npm run build
npm run start:prod
```

### Code Quality

- **Format code:**
  ```bash
  npm run format
  ```
- **Check formatting:**
  ```bash
  npm run format:check
  ```
- **Lint code:**
  ```bash
  npm run lint
  ```

## Docker Setup

This project uses a **single Dockerfile** with multi-stage builds for development and production.

---

## Prerequisites

- Docker >= 24
- Docker Compose >= 2.17
- `.env` file in the project root with necessary environment variables

---

## Development

The development setup uses hot-reload and bind mounts.

### Build & Run

```bash
docker compose up --build
```

- Builds the development image if needed (`target: development`)
- Starts the container
- Live reload enabled

### Stop Development Container

```bash
docker compose down
```

### Notes

- Code changes in the host machine automatically reflect inside the container.
- Node modules are isolated in a volume (`/app/node_modules`) to avoid overwriting.

---

## Production

The production setup builds an optimized image and runs without bind mounts.

### Build & Run

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

- Builds the production image (`target: production`)
- Runs container in detached mode
- Exposes port `3000`

### Stop Production Container

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
```

### Notes

- No bind mounts → container is self-contained
- Uses environment variables from `.env`
- Optimized for performance with built artifacts (`npm run build`)

---

## View Logs

```bash
docker logs -f delight-desk-dev      # Development
docker logs -f delight-desk-prod     # Production
```

---

## Rebuild Images (Optional)

If you want to rebuild without cache:

```bash
docker compose build --no-cache         # Development
docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache   # Production
```

## License

UNLICENSED
