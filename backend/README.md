# Decoration backend

Spring Boot modular monolith skeleton for the decoration platform.

## Run locally

Start a local PostgreSQL 16+ service, create the `decoration` database and user,
then run:

```bash
mvn spring-boot:run
```

The API is available at `http://localhost:8080`. The liveness/readiness endpoints are exposed under `/actuator/health` and the application health contract is `/api/v1/health`.

Docker is optional. The default datasource targets `localhost:5432`; if your
PostgreSQL credentials differ, set `DATABASE_URL`, `DATABASE_USERNAME`, and
`DATABASE_PASSWORD` in the process environment before starting the application.

Database settings can be overridden with `DATABASE_URL`, `DATABASE_USERNAME`,
`DATABASE_PASSWORD`, and `DATABASE_POOL_SIZE`. Flyway applies the versioned SQL
files in `src/main/resources/db/migration` at startup. The local defaults are
for development only; set `JWT_SECRET` to a private, random value of at least
32 bytes outside local development.

## Platform admin

There is no public admin registration or default admin account. To create the
first administrator, restart the backend after Flyway V7 is available with
these process environment variables set:

```powershell
$env:ADMIN_BOOTSTRAP_ENABLED = 'true'
$env:ADMIN_BOOTSTRAP_EMAIL = 'admin@example.com'
$env:ADMIN_BOOTSTRAP_PASSWORD = '<unique password of at least 12 characters>'
mvn spring-boot:run
```

The bootstrap creates an account only when that email does not exist; it never
promotes an existing personal or company account and never resets an existing
admin password. After creation, stop the process, remove the password and
bootstrap variables, then restart normally. Administrators sign in at
`/admin/login`; the standard login API rejects administrator accounts. The
admin certification queue and review endpoint both require `PLATFORM_ADMIN`.

## Business workspace API

All `/api/v1/business/**` endpoints require a signed HS256 bearer token. The
JWT must contain a UUID `companyId` claim and a `roles` array containing one or
more of `COMPANY_ADMIN`, `COMPANY_EDITOR`, and `COMPANY_VIEWER`. The company ID
is always taken from the token, never from request data. Viewers are read-only;
admins and editors may create and update records; only admins may delete
records or publish cases.

The current business API covers:

- `GET` and `PUT /api/v1/business/profile`
- `GET`, `POST`, `GET /{caseId}`, `PATCH /{caseId}`, and `DELETE /{caseId}` on
  `/api/v1/business/cases`
- The same list/create/read/update/delete operations on
  `/api/v1/business/material-quotes` and `/api/v1/business/labor-quotes`

List endpoints are one-based, default to 20 records per page, and cap page size
at 100. Sorting is allow-listed per resource; unsupported sort fields return a
400 response. Create requests require an `Idempotency-Key` header. Updates use
the returned `version` for optimistic concurrency, and deletes require that
version as a query parameter. Cross-company record IDs return 404.

Every JSON response uses the `{ code, message, data, timestamp }` envelope;
errors use a null `data` value. See `../contracts/openapi.yaml` for request,
response, role, and error details. Case `fileIds` are checked against
company-owned `business_assets` records. `POST /api/v1/business/assets` accepts
one `multipart/form-data` field named `file` (image or PDF, up to 15 MB);
`GET /api/v1/business/assets/{assetId}` downloads an asset after checking
company ownership. Files are stored below `APP_UPLOAD_DIR` (default
`./var/uploads`) and metadata is stored in PostgreSQL. For deployment, use a
persistent storage directory or replace this implementation with the selected
object-storage provider.

The modules are intentionally package-aligned and can evolve behind module-local application services:

- `business`: company profile, case portfolio, and company quote APIs
- `project`: project and workspace aggregates
- `design`: generation tasks and design versions
- `material`: regional material price records
- `shared`: API contracts, errors, and cross-cutting infrastructure

## Project workspace API

`GET /api/v1/projects` returns the current company's projects. Editors and
admins can save a project with `PUT /api/v1/projects/{projectId}`, remove one
with `DELETE /api/v1/projects/{projectId}`, or replace the full project list
with `PUT /api/v1/projects` and `{ "projects": [...] }`. Project IDs must be
UUIDs and match the path for single-project saves. Project aggregates are
stored as JSONB in `workspace_project_aggregates`, scoped by the token's
`companyId`. The full replacement endpoint deletes omitted projects, so clients
should prefer the single-project endpoints for routine edits.

## Tests

Run `mvn verify` with the local PostgreSQL service available. Database
integration tests default to `jdbc:postgresql://localhost:5432/decoration` and
create a uniquely named temporary schema for each run; they do not clear or
write to the database's `public` schema. The temporary schema is dropped after
the tests. For additional separation, set `DATABASE_TEST_URL`,
`DATABASE_TEST_USERNAME`, and `DATABASE_TEST_PASSWORD` to a dedicated local
test database. Test-specific credentials fall back to `DATABASE_USERNAME` and
`DATABASE_PASSWORD`, then the development defaults.
