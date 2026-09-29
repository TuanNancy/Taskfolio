# Repository Guidelines

## Project Structure & Module Organization

- `frontend/src/` contains the React application: `components/`, `pages/`, `hooks/`, `context/`, and `services/`. Bundled assets live in `src/assets/`; static files live in `frontend/public/`.
- `backend/src/` contains Express routes, controllers, middleware, validation, and configuration. `app.js` creates the HTTP application; `server.js` handles startup and shutdown. Mongoose models live in `backend/models/`.
- Tests live separately in `backend/tests/` and `frontend/tests/`.
- `deploy/`, Dockerfiles, and root Compose files support container deployment. `.github/workflows/ci.yml` runs verification.

## Build, Test, and Development Commands

Use Node.js 24 LTS or Node.js 22.12+. Run commands from the repository root.

- `npm ci && npm ci --prefix backend && npm ci --prefix frontend`: install locked dependencies for all three packages.
- `npm run dev:backend` and `npm run dev:frontend`: start the API and Vite in separate terminals.
- `npm test`: run backend and frontend tests.
- `npm run test:coverage`: check coverage for both packages.
- `npm run lint`: run frontend ESLint checks.
- `npm run build`: produce the frontend bundle in `frontend/dist/`.
- `npm start`: start the API only; use Compose/Caddy to serve the complete application.

## Coding Style & Naming Conventions

Use JavaScript ES modules and two-space indentation. Follow nearby quoting and semicolon conventions; no Prettier configuration exists. Use PascalCase for components (`TaskItem.jsx`), camelCase for functions and variables, and `use` prefixes for hooks (`useTasks.js`). Keep validation in backend schemas and frontend HTTP calls in `services/api.js`. ESLint checks React Hooks, Fast Refresh, and unused variables.

## Testing Guidelines

Use Vitest throughout, Supertest with temporary MongoDB for API tests, and Testing Library with jsdom for frontend tests. Name tests `*.test.js` or `*.test.jsx`. Cover changed behavior, including authorization, validation, and asynchronous failure handling. Coverage thresholds are 80% for statements, branches, functions, and lines within configured coverage scopes. Initial API tests may download a MongoDB binary.

## Commit & Pull Request Guidelines

History uses descriptive subjects such as `Fix API validation and frontend state handling`; Conventional Commits are not established. Use focused commits and imperative subjects. PRs should describe the problem, resulting behavior, verification, and related issues. Include screenshots for UI changes and document configuration changes. Run tests, lint, and build before review.

## Security & Configuration

Copy `.env.example` templates and keep actual secrets untracked. Never commit JWT secrets, database credentials, or tokens. Preserve task ownership checks, HttpOnly cookies, and the mutation header `X-Requested-With: TodoTasks`. Do not describe AWS deployment as complete without verifying a live environment.
