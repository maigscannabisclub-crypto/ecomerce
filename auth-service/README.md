# Auth Service

Authentication Service for E-commerce Platform - A microservice handling user authentication, authorization, and session management.

## Features

- **User Registration & Login** - Secure user authentication with email/password
- **JWT Token Management** - Access tokens (15 min) and refresh tokens (7 days)
- **Token Rotation** - Secure refresh token rotation on each use
- **Role-Based Access Control** - USER and ADMIN roles
- **Password Security** - Bcrypt hashing with configurable salt rounds
- **Input Validation** - Joi-based request validation
- **Structured Logging** - Winston logger with correlation IDs
- **Health Checks** - Service and database health monitoring
- **Production Ready** - Docker support with multi-stage builds

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Language**: TypeScript
- **ORM**: Prisma
- **Database**: PostgreSQL
- **Authentication**: JWT (jsonwebtoken)
- **Password Hashing**: bcryptjs
- **Validation**: Joi
- **Logging**: Winston
- **Testing**: Jest + Supertest

## Quick Start

### Using Docker Compose (Recommended)

```bash
# Start development environment
docker-compose up

# Start production environment
docker-compose --profile production up

# Run database migrations
docker-compose exec auth-service npx prisma migrate dev

# Seed database
docker-compose exec auth-service npx prisma db seed
```

### Local Development

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
npx prisma migrate dev

# Seed database
npx prisma db seed

# Start development server
npm run dev

# Run tests
npm test
```

## API Endpoints

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login user |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Logout user |
| GET | `/auth/verify` | Verify access token |
| GET | `/health` | Health check |

### Protected Endpoints (Require Authentication)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/auth/profile` | Get user profile |
| PUT | `/auth/profile` | Update user profile |
| PUT | `/auth/change-password` | Change password |
| POST | `/auth/logout-all` | Logout from all devices |

## API Examples

### Register

```bash
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "Secure123!",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

### Login

```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "Secure123!"
  }'
```

### Get Profile

```bash
curl -X GET http://localhost:3001/auth/profile \
  -H "Authorization: Bearer <access_token>"
```

### Refresh Token

```bash
curl -X POST http://localhost:3001/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "<refresh_token>"
  }'
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `3001` |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `JWT_SECRET` | JWT signing secret | - |
| `JWT_REFRESH_SECRET` | Refresh token secret | - |
| `JWT_ACCESS_EXPIRATION` | Access token expiration | `15m` |
| `JWT_REFRESH_EXPIRATION` | Refresh token expiration | `7d` |
| `BCRYPT_SALT_ROUNDS` | Password hashing rounds | `12` |
| `LOG_LEVEL` | Logging level | `info` |

## Project Structure

```
src/
├── config/           # Configuration files
├── domain/           # Domain entities
│   └── entities/
├── application/      # Application layer
│   ├── dto/         # Data Transfer Objects
│   └── services/    # Business logic
├── infrastructure/   # Infrastructure layer
│   ├── database/    # Database client
│   └── http/        # HTTP client
├── presentation/     # Presentation layer
│   ├── controllers/ # Route controllers
│   ├── middleware/  # Express middleware
│   └── routes/      # Route definitions
└── utils/           # Utility functions
```

## Testing

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run tests with coverage
npm run test:coverage
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build TypeScript to JavaScript |
| `npm start` | Start production server |
| `npm test` | Run all tests |
| `npm run lint` | Run ESLint |
| `npm run db:migrate` | Run database migrations |
| `npm run db:seed` | Seed database |
| `npm run db:studio` | Open Prisma Studio |

## Default Test Users

After running `npm run db:seed`, the following users are available:

| Email | Password | Role |
|-------|----------|------|
| admin@ecommerce.com | Admin123! | ADMIN |
| user@ecommerce.com | User123! | USER |
| john.doe@ecommerce.com | Test123! | USER |
| jane.smith@ecommerce.com | Test123! | USER |

## License

MIT
