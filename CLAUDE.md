# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

Uptime Kuma is a self-hosted monitoring tool built with Vue 3 (frontend) and Node.js/Express (backend). The project uses **Socket.IO for real-time communication** instead of REST APIs for most operations. It supports SQLite (default) and MariaDB/MySQL databases.

**Key Technologies**: Vue 3, Vite, Node.js >= 20.4, Express.js, Socket.IO, Bootstrap 5, SQLite, Knex.js

## Essential Commands

### Setup
```bash
npm ci                      # Install dependencies (NOT npm install - use ci for reproducible builds)
npm run setup              # First-time setup: checks out v2.1.1 and downloads dist files
```

### Development
```bash
npm run dev                # Start both frontend (port 3000) and backend (port 3001) servers
npm run start-frontend-dev # Start only frontend dev server
npm run start-server-dev   # Start only backend dev server
npm run start-server-dev:watch # Start backend with auto-reload
```

### Building & Testing
```bash
npm run build              # Build frontend to dist/ (~90-120 seconds)
npm run lint               # Run ESLint + Stylelint (~15-30 seconds)
npm run lint:prod          # Production lint (zero warnings allowed)
npm run lint-fix:js        # Auto-fix JavaScript/Vue linting issues
npm run lint-fix:style     # Auto-fix style linting issues
npm run fmt                # Format code with Prettier

npm test                   # Run all tests (backend + e2e)
npm run test-backend       # Run backend tests only (~50-60 seconds)
npm run test-e2e           # Run Playwright E2E tests
npm run test-e2e-ui        # Run E2E tests with Playwright UI

npm run tsc                # Type check (shows 1400+ errors - this is expected, ignore them)
```

### Utilities
```bash
npm run reset-password     # Reset admin password
npm run remove-2fa         # Remove 2FA for a user
node extra/healthcheck.js  # Run healthcheck manually
```

## Architecture

### Communication Model

**Critical**: Uptime Kuma uses **Socket.IO for most backend communication**, not REST APIs. The Express.js server primarily serves:
1. Redirects to status pages/dashboard
2. Static frontend files from `dist/`
3. Internal APIs for status pages only

Most application logic lives in Socket.IO event handlers (`server/socket-handlers/`), not Express routers.

### Directory Structure

```
server/                     # Backend source code
├── model/                 # Database models (auto-map to table names with snake_case)
├── monitor-types/         # Monitor type implementations (HTTP, TCP, DNS, etc.)
├── notification-providers/# Notification service integrations (90+ providers)
├── routers/               # Express routers (minimal - most logic is in socket-handlers)
├── socket-handlers/       # Socket.IO event handlers (main application logic)
├── jobs/                  # Background jobs running in separate processes
├── modules/               # Modified third-party modules
├── server.js              # Server entry point
└── uptime-kuma-server.js  # UptimeKumaServer class (core logic)

src/                       # Frontend source code (Vue 3 SPA)
├── components/            # Vue components
│   └── notifications/     # Notification provider UI components
├── pages/                 # Page components (routed by vue-router)
├── lang/                  # i18n translations (managed via Weblate)
├── mixins/socket.js       # Socket.IO client logic and data management
├── router.js              # Vue Router configuration
└── main.js                # Frontend entry point

db/
├── knex_migrations/       # Knex migration files (validated by CI)
└── kuma.db                # SQLite database (gitignored)

test/
├── backend-test/          # Backend unit tests
└── e2e/                   # Playwright E2E tests

config/                    # Build configuration
├── vite.config.js         # Vite build configuration
└── playwright.config.js   # Playwright test configuration
```

### Database Architecture

- **ORM**: Custom ORM called "RedBean" (`redbean-node` package) with Knex.js for migrations
- **Models**: Classes in `server/model/` auto-map to database tables (snake_case table names)
- **Migrations**: Located in `db/knex_migrations/` - filenames must follow specific format validated by CI
- **Primary DB**: SQLite (stored in `data/kuma.db` or `DATA_DIR/kuma.db`)
- **Supported DBs**: SQLite, MariaDB, MySQL (PostgreSQL partially supported)

### Frontend State Management

- **No Vuex/Pinia**: State is stored at root level in `src/mixins/socket.js`
- **Socket.IO Integration**: Data synced via Socket.IO events, not traditional REST API calls
- **Router**: Vue Router manages SPA navigation (`src/router.js`)
- **Real-time Updates**: WebSocket connections provide live monitoring data

## Code Style & Conventions

### Formatting (strictly enforced by linters)
- **Indentation**: 4 spaces (not tabs)
- **Quotes**: Double quotes
- **Line Endings**: Unix (LF)
- **Semicolons**: Required
- **JSDoc**: Required for all functions/methods

### Naming Conventions
- **JavaScript/TypeScript**: `camelCase`
- **Database columns**: `snake_case`
- **CSS/SCSS**: `kebab-case`
- **Vue Components**: `PascalCase`

### Important Configuration Files
- `.npmrc`: Contains `legacy-peer-deps=true` (required for dependency resolution)
- `.editorconfig`: 4 spaces, LF, UTF-8
- `.eslintrc.js`: ESLint rules (4 spaces, double quotes, JSDoc required)
- `.stylelintrc`: Stylelint rules (4 spaces indentation)

## Adding New Features

### New Notification Provider
Files to create/modify:
1. `server/notification-providers/PROVIDER_NAME.js` - Backend logic, must wrap axios calls in try/catch with `this.throwGeneralAxiosError(error)`
2. `server/notification.js` - Register the provider
3. `src/components/notifications/PROVIDER_NAME.vue` - Frontend UI (use `HiddenInput` for secrets)
4. `src/components/notifications/index.js` - Register frontend component
5. `src/components/NotificationDialog.vue` - Add to regional/global provider list
6. `src/lang/en.json` - Add translation keys

**Testing Requirements**: Must include screenshots of UP/DOWN, certificate expiry, domain expiry, and test button events in PR.

### New Monitor Type
Files to create/modify:
1. `server/monitor-types/MONITOR_TYPE.js` - Core monitoring logic
   - Happy path: Set `heartbeat.msg` and `heartbeat.status = UP`
   - Unhappy path: Throw `Error` with actionable message
   - **NEVER** set `heartbeat.status = DOWN` (bypasses retries)
2. `server/uptime-kuma-server.js` - Register monitor type
3. `src/pages/EditMonitor.vue` - Add frontend UI (use `HiddenInput` for secrets)
4. `src/lang/en.json` - Add translation keys

## Translation/i18n

- **Weblate Integration**: Translations managed via Weblate (https://weblate.kuma.pet/)
- **Adding Keys**: Only add to `src/lang/en.json`, do not include other languages in PRs
- **Usage**: Use `{{ $t("key") }}` in templates or `<i18n-t keypath="key">` for complex translations
- **New Languages**: Require file creation (see src/lang/README.md)

## Git Workflow

### Branches
- `master`: Version 2.X.X development (target for new features)
- `1.23.X`: Version 1.23.X maintenance (target for v1/v2 bug fixes)

### CI/CD Requirements
All PRs must pass:
1. **Linting**: `npm run lint:prod` (zero warnings)
2. **Building**: `npm run build` (no build errors)
3. **Backend Tests**: `npm run test-backend`
4. **E2E Tests**: `npm run test-e2e` (Playwright)
5. **Validation**: JSON/YAML files, language files, Knex migration filenames

## Common Pitfalls

1. **Use `npm ci` not `npm install`**: Required for reproducible builds
2. **TypeScript Errors**: `npm run tsc` shows 1400+ errors - this is normal, ignore them
3. **Socket.IO vs REST**: Most backend logic is Socket.IO handlers, not Express routes
4. **Model Auto-Mapping**: Model class names auto-map to snake_case table names
5. **Build Before Test**: Always run `npm run build` before `npm test`
6. **Port Conflicts**: Dev mode uses ports 3000 (frontend) and 3001 (backend)
7. **First Run Setup**: "db-config.json not found" is expected - starts setup wizard
8. **Stylelint Warnings**: Deprecation warnings from stylelint are expected
9. **Dependencies**: 5 known vulnerabilities are acknowledged - don't fix without discussion
10. **NFS Volumes**: Not supported - use local directories or Docker volumes only

## Development Environment

### Requirements
- Node.js >= 20.4.0
- npm >= 9.3
- Git
- Playwright (run `npx playwright install` for E2E tests)
- Recommended: SQLite GUI tool (SQLite Expert Personal or DBeaver)

### Port Usage
- **3000**: Frontend dev server (Vite)
- **3001**: Backend server (Express + Socket.IO)

### Database Location
- Development: `./data/kuma.db` (or set `DATA_DIR` environment variable)
- Docker: `/app/data` (mount volume to persist)

## Docker

```bash
# Build Docker image locally
npm run build-docker-nightly-local

# Quick test with nightly image
npm run quick-run-nightly

# Start dev container
npm run start-dev-container
```

## Project Philosophy

- **Easy Installation**: No native build dependencies for x86_64/armv7/arm64
- **Single Container**: No complex docker-compose files required
- **Frontend Configuration**: Settings configurable via UI, avoid environment variables (except startup vars like `DATA_DIR`)
- **Simple UX**: Installation should be as easy as installing a mobile app
