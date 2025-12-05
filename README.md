# Delight Desk Backend

## Getting Started

### Prerequisites

- Node.js (v20+ recommended)
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
npm run db:migrate
```

Seed billing plans:

```bash
npm run seed:billing
```

### Running the Application

#### Development

```bash
npm run start:dev
```

### Code Quality

**Format code:**

```bash
npm run format
```

**Check formatting:**

```bash
npm run format:check
```

**Lint code:**

```bash
npm run lint
```

## License

UNLICENSED
