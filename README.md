# Backend Delight Desk

A NestJS-based backend service for Delight Desk, featuring modular architecture, user management, authentication, billing plans, and email integration.

## Features

- **NestJS** framework for scalable server-side applications
- **User management** (CRUD)
- **Authentication** with session support
- **Billing plans** management
- **SendGrid** integration for transactional emails
- **Drizzle ORM** for database access
- **PostgreSQL** session storage
- **Input validation** with `class-validator`
- **Environment-based configuration**
- **Prettier** and **ESLint** for code quality

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


## Project Structure

```
src/
  modules/
    users/
    auth/
    plans/
    sendgrid/
  database/
  app.module.ts
.env
```

## Scripts

| Script            | Description                        |
|-------------------|------------------------------------|
| build             | Build the NestJS app               |
| start             | Start the app                      |
| start:dev         | Start in watch mode                |
| start:prod        | Start production build             |
| format            | Format code with Prettier          |
| format:check      | Check code formatting              |
| lint              | Lint and auto-fix code             |
| db:generate       | Generate Drizzle ORM artifacts     |
| db:push           | Push schema to DB                  |
| db:migrate        | Run DB migrations                  |
| db:studio         | Open Drizzle Studio                |
| seed:billing      | Seed billing plans                 |

## License

UNLICENSED