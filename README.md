# Splittr

Splittr is a shared-expense app built with an Express 5 API, PostgreSQL/Sequelize, and a React 19 + Vite frontend. The web client provides account access, personal expenses, groups and join requests, group expense splits, and spending reports.

## Requirements

- Node.js `^20.19.0` or `>=22.12.0` and npm (Vite 8 requirement)
- PostgreSQL
- Redis (shared, durable service for API rate limits)
- A configured SMTP account for password-reset email
- Google OAuth client credentials

## Configure the backend

Copy `backend/.env.example` to `backend/.env` and set the following values. Generate independent random secrets of at least 32 characters for `ACCESS_TOKEN_SECRET`, `CSRF_SECRET`, and `OTP_SECRET`. Keep `.env` local and never commit credentials.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DB_URL` | Yes | PostgreSQL connection URL; Neon connection strings work directly and must keep TLS enabled |
| `ACCESS_TOKEN_SECRET` | Yes | Secret for 15-minute JWT access tokens |
| `CSRF_SECRET` | Yes | Independent HMAC key for signed CSRF tokens |
| `OTP_SECRET` | Yes | Independent HMAC key for password-reset OTP verification |
| `REDIS_URL` | Yes | Redis connection for atomic token-bucket rate limits |
| `CORS_ORIGINS` | Yes in production | Comma-separated exact allowed browser origins |
| `FRONTEND_URL` | Yes in production | Exact frontend origin for OAuth redirects; must also be in `CORS_ORIGINS` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` | Yes in production | Google OAuth web client and registered callback URL; `GOOGLE_CLIENT_ID` is also the expected audience for native Android ID tokens |
| `EMAIL_USER`, `EMAIL_PASS` | Yes in production | SMTP sender and application password for password reset |
| `PORT` | No | API port; defaults to `8080` |
| `NODE_ENV` | No | Set to `production` for secure cookies, TLS defaults, and strict startup configuration |
| `TRUST_PROXY` | Only behind a trusted reverse proxy | Set true only when the deployment has exactly one trusted proxy |

When deploying the backend on Render, add `DB_URL` to the backend service's environment variables and set it to the PostgreSQL connection URL from your database. For a Render-hosted database, use its internal connection URL when the services are in the same region; do not use the local URL from `backend/.env.example`.

For a **brand-new, empty** database only, create the baseline tables once:

```sh
cd backend
npm run db:init
```

The initializer refuses to run if any tables exist and creates the latest model schema without `alter`. For an **existing** database, take a backup and apply the additive migrations using a controlled deployment process:

```sh
psql "$DB_URL" -v ON_ERROR_STOP=1 -f backend/migrations/20261010-google-oauth.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f backend/migrations/20261011-group-settlement-status.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f backend/migrations/20261011-notifications.sql
```

The Google migration normalizes stored email addresses after checking for case-insensitive duplicates, adds unique indexes for email and Google subject, and permits password-less Google accounts. Resolve any duplicate-email failure before retrying it. The notification migration creates per-user notification storage so updates remain available when a member is offline; existing events are not backfilled. The API does **not** mutate the schema on startup. Apply and verify schema migrations separately, and take a restorable backup before production changes.

For Google OAuth, register `GOOGLE_CALLBACK_URL` exactly in the Google Cloud OAuth client. The callback uses state validation, HTTP-only short-lived state/PKCE cookies, verified Google email, and a server-side session. Password reset requires working SMTP credentials.

## Run locally

Start the API in one terminal:

```sh
cd backend
npm install
npm start
```

The API requires Redis even in development. Start the local Redis service first (for example, `docker compose up -d redis` from the repository root), then set `REDIS_URL=redis://127.0.0.1:6380` in `backend/.env`. If Redis is missing or unreachable, the API intentionally exits/fails closed instead of disabling rate limiting.

Start the web client in another:

```sh
cd frontend
npm install
npm run dev
```

Vite serves the frontend at `http://localhost:5173` and proxies `/api/*` to `http://localhost:8080`. To use a different API origin (including in a production build), set `VITE_API_URL` in the frontend build environment to the backend origin. The frontend sends HTTP-only auth cookies and a signed double-submit CSRF token with state-changing requests. For a separately deployed frontend, add its exact HTTPS origin to `CORS_ORIGINS`, set `FRONTEND_URL`, and run the API with `NODE_ENV=production`.

If the browser shows an unavailable API message or Vite logs `ECONNREFUSED` for `/auth/me`, the frontend is running but the API is not listening on port `8080`. Check the backend terminal for its startup error; commonly, `REDIS_URL` is missing or Redis is not running.

## Tests and quality checks

Run the backend tests:

```sh
cd backend
npm test
```

Run the frontend tests, lint, and production build:

```sh
cd frontend
npm test
npm run lint
npm run build
```

Backend tests use Node's built-in test runner and stub Sequelize model calls for HTTP/controller integration tests; they do not require a PostgreSQL or Redis server and do not claim live infrastructure coverage. Frontend component and API-client tests use Vitest, React Testing Library, and jsdom.

## Android app (Capacitor)

The Android application wraps the existing Vite frontend; it does not copy or recreate the React app or backend. Capacitor's app ID is `com.anujsaxena11.splitter` and its web assets come from `frontend/dist`. Keep this application ID and the release signing key unchanged for compatible app updates.

### Requirements and configuration

- Node.js `^20.19.0` or `>=22.12.0`, npm, Android Studio, Android SDK Platform 36, and JDK 21.
- Deploy the existing Node.js backend over HTTPS first. Before a native build, configure `VITE_API_URL` to its real HTTPS API origin (including any configured API base path). No deployed backend URL is present in this repository, so there is intentionally no invented production URL or API fallback in the Android build.
- Configure Google OAuth with the existing Web application client and an Android client in the same Google Cloud project. The Android client must use package name `com.anujsaxena11.splitter` and the SHA-1 fingerprint(s) for the APK signing certificate(s). Set `VITE_GOOGLE_WEB_CLIENT_ID` to the Web application client ID in the Android build environment; it is a public client identifier, not a secret. Keep the web client's ID in backend `GOOGLE_CLIENT_ID`. Android uses Credential Manager to obtain an ID token, which the backend verifies before creating the app session. The website continues using the web redirect flow.
- Add `https://localhost` to the backend's exact `CORS_ORIGINS`, alongside the deployed website origin. Capacitor Android is configured to use this HTTPS WebView origin. The backend already sets secure `SameSite=None` authentication/CSRF cookies in production; the Android WebView is configured to accept the cross-site API cookies. Keep production CORS restricted to the actual website origin and this app origin.
- The website build variable `VITE_ANDROID_DOWNLOAD_URL` must be a public HTTPS URL to a real APK asset. Leave it unset until the first APK is published: the app page then shows a disabled “APK not published yet” control rather than a dead link. Set it in the frontend hosting provider's build environment and redeploy the website to activate downloads. This repository does not identify the website hosting provider, so its static-file support and upload-size limits cannot be verified here.

### Release signing (one-time setup)

Create a release key in `frontend/android` and enter the passwords interactively:

```powershell
cd frontend/android
keytool -genkeypair -v -keystore splitter-release.jks -alias splitter-release -keyalg RSA -keysize 4096 -validity 10000
Copy-Item keystore.properties.example keystore.properties
```

Edit the ignored `frontend/android/keystore.properties` with the key path and passwords. Prefer an absolute path; use forward slashes in Windows paths:

```properties
storeFile=C:/path/to/splitter-release.jks
storePassword=your-local-keystore-password
keyAlias=splitter-release
keyPassword=your-local-key-password
```

Alternatively, provide `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD` in the build process environment. The APK is rejected by the release Gradle task if signing is not configured or the keystore file is missing. The keystore and local properties are Git-ignored. Back up the keystore and its passwords securely in more than one safe location; losing the key prevents compatible updates to existing installations. Never commit the keystore or passwords.

### Build a signed APK

From `frontend`, install exactly the lockfile dependencies and set the real backend URL in PowerShell or a local `.env.production` file. Set a download URL only after choosing a public release host (see below):

```powershell
npm ci
$env:VITE_API_URL = "https://<your-deployed-backend-origin>"
$env:VITE_GOOGLE_WEB_CLIENT_ID = "<your-google-web-application-client-id>"
# Optional: set this to the public release asset URL when it is available.
$env:VITE_ANDROID_DOWNLOAD_URL = "https://github.com/<public-owner>/<public-release-repo>/releases/latest/download/EzSplittr.apk"
npm run android:release
```

`npm run android:release` builds React, synchronizes Capacitor's Android project, builds `assembleRelease` using the configured signing key, and copies the signed APK to `frontend/distribution/EzSplittr.apk`. Its Gradle source artifact is `frontend/android/app/build/outputs/apk/release/app-release.apk`. To inspect/open the native project separately, use `npm run cap:open` from `frontend`. Increment `versionCode` and update `versionName` in `frontend/android/app/build.gradle` for every release; Android rejects an update with a non-increasing version code.

### Free direct hosting and updates

No deployment provider or existing APK host is configured in this checkout. GitHub Releases are a free option for public direct distribution: GitHub documents a maximum of 2 GiB per release asset and no total release size or bandwidth limit. An unauthenticated GitHub API lookup of this repository returned 404, so its public visibility and releases could not be verified. A private repository's release downloads are not suitable for users without repository access. If this repository remains private, create/use a public artifact-only GitHub repository (do not expose this source repository), or select another public HTTPS host you control.

After the public release repository exists, publish the APK from a machine authenticated with write access:

```powershell
gh release create v1.0.0 .\distribution\EzSplittr.apk --repo <public-owner>/<public-release-repo> --title "EzSplittr Android v1.0.0" --notes "Initial Android release"
```

Use the stable asset URL `https://github.com/<public-owner>/<public-release-repo>/releases/latest/download/EzSplittr.apk` as `VITE_ANDROID_DOWNLOAD_URL` in the website hosting build environment, then redeploy the web frontend. Using `EzSplittr.apk` as the release asset name ensures Android users see the correct filename when downloading. Future versions must be signed with the same key, use a higher Android `versionCode`, and upload the same asset filename to a newer GitHub release (for example, `gh release create v1.0.1 ...`). The `latest/download` URL then resolves to that release without changing the website link. Publishing requires release-repository write permission; downloading the public asset does not.

Install on Android by opening the public HTTPS release link on the phone, allowing the browser/file manager to install apps from that source when Android prompts, then opening the downloaded APK. For USB installation with Android platform tools, run `adb install -r frontend/distribution/EzSplittr.apk`.

### Android limitations to verify before distribution

- The repository has no production API origin, hosting configuration, published APK, release keystore, or Android SDK. Android login, WebSocket updates, and other API workflows therefore cannot be tested against live services here.
- Email/password APIs use credentialed HTTPS requests; configure production CORS and verify cookie behavior against the deployed API on a device. Google OAuth currently redirects to the configured web `FRONTEND_URL`, and has no native deep-link/token handoff. Do not advertise Google sign-in in the APK as verified until a native-compatible OAuth return flow is implemented and tested.
- This checkout has Java 25 but no Android SDK, Gradle installation, or adb. Install Android Studio with Android SDK Platform 36 and use JDK 21 before running the signed build. The Android wrapper and project are checked in; Gradle may download its wrapper distribution on first build.

## Production deployment checklist

- Provision PostgreSQL and Redis with TLS, authentication, private network access, backups, and monitoring. Do not expose either datastore publicly.
- Apply database migrations before the API rollout; automatic `sync({ alter: true })` has been removed.
- Set all production environment variables, use independent secret-manager generated JWT/CSRF/OTP keys, and register the Google callback URL.
- Serve the frontend and API only over HTTPS. Use exact CORS origins and configure `TRUST_PROXY=true` only behind a trusted single reverse proxy/load balancer.
- Rate limiting fails closed with HTTP 503 if Redis is unavailable. Authentication requests use a 10-token bucket replenished at one request/minute per client IP; general API traffic uses a 120-token bucket replenished at 2 requests/second. Redis Lua executes each bucket update atomically.
- Password sign-up and reset require at least 12 characters, upper- and lowercase letters, a number, and one of `_`, `$`, or `@`; existing accounts can continue signing in with their existing password format.
- Configure monitoring/alerting, log retention and redaction, database restore drills, service health checks, dependency updates, and incident procedures in the hosting platform. This repository does not include a hosting provider, secret manager, observability stack, or backup service.

## API-backed features and known limits

- Authentication: sign up, sign in, Google OAuth, sign out, sign out everywhere, refresh, profile, and password reset by email OTP.
- Personal expenses: create, list, and fetch an owned expense.
- Groups: create, request to join, accept/reject requests, list groups, view group details, leave, and delete.
- Group expense splits: add equal or custom splits and list group expenses.
- Group finances: per-member paid/share/net totals, suggested payments, and payer-reported settlements that recipients confirm or reject.
- Reports: monthly, weekly, custom-range, and category reports.

Group payments use a pending/confirmed/rejected workflow; balances update only after the recipient confirms. Apply `backend/migrations/20261011-group-settlement-status.sql` to an existing database before deploying the settlement UI, then restart the API. The standalone report-generation controller is not mounted and is not part of the supported UI/API. Password reset requires working email credentials; without them the API returns an explicit service-unavailable response.

The frontend filters personal expenses client-side because the current list endpoint does not expose filtering, pagination, or sorting parameters. Group expense, settlement, and report data remain scoped to the capabilities the API actually exposes.

### Route and UI integration map

The Vite development proxy removes `/api` before forwarding requests; the paths below are the backend paths. Protected calls send the HTTP-only access cookie. On `401`, the client tries the refresh-cookie endpoint once and retries the original request. Access tokens are checked against their persisted session on each protected request, so logout and sign-out-everywhere revoke access immediately as well as refresh.

State-changing requests are CSRF protected; rate limiting is backed by Redis/Lua. On production startup, required dependencies and configuration are checked before accepting requests.

| Backend route | Frontend interaction | Contract and important behavior |
| --- | --- | --- |
| `GET /auth/csrf` | API client initialization | Issues a signed double-submit CSRF token cookie and response token; all state-changing browser requests send `X-CSRF-Token`. |
| `GET /auth/google`, `/auth/google/callback` | Continue with Google | OAuth authorization-code flow with PKCE, state, verified email, and first-party cookie sessions; callback redirects to `FRONTEND_URL`. |
| `POST /auth/signup`, `/auth/login` | Sign-up and sign-in forms | Sign-up accepts `name`, `email`, `password`, `cpassword` and returns `201`; login accepts `email`, `password` and returns `200`. Both set 15-minute access and 7-day refresh cookies. New passwords require 12–72 characters with upper/lowercase, a number and a supported symbol. |
| `POST /auth/logout`, `/auth/logoutAll` | Account sign-out action | Protected; removes the current refresh session or all sessions, then clears cookies. |
| `POST /auth/refresh` | Automatic session renewal | Uses the refresh cookie, rotates it, and returns `200`; missing, invalid, or expired cookies return `401`. |
| `GET /auth/me`, `/auth/user/:id` | Session restore and current profile | Protected; response is `{ user }`. User lookup currently returns `null` in that wrapper when the ID does not exist. |
| `POST /auth/forgetPassword`, `/auth/verifyOTP` | Email-code password recovery | Requests use email, then email + 6-digit OTP + matching new passwords. OTPs expire after 10 minutes and successful reset revokes sessions. Missing email configuration/delivery returns `503`. |
| `POST /self/expense` | Add a personal expense | Protected; accepts positive `amount`, one of `Food`, `Shopping`, `Education`, `Friend`, `EMI`, `Bills`, `Others`, required `paid_to`, and optional `desc` up to 255 characters. Returns `201`. |
| `GET /self/expenses`, `/self/expense/:id` | Expense history and owned-expense lookup | Protected; list returns `{ allExpenses }` or an empty-state message; lookup returns `{ expense }` and restricts results to the signed-in payer. |
| `POST /group/createGroup`, `/group/joinGroup` | Create a group or request to join by invite code | Protected; create accepts a 2–100 character `name` and optional 10–300 character description. Join accepts `unique_code` (or the backend alias `groupCode`) and creates a pending request. |
| `POST /group/acceptJoinRequest`, `/group/rejectJoinRequest` | Admin review of pending members | Protected; body is `{ groupId, userId }`; only the group owner can accept or reject. |
| `GET /group/getMyGroups`, `/group/getGroupById/:groupId` | Group list, members, and invite code | Protected; list returns `{ groups }`; details return `{ group, members }` and require group membership. |
| `DELETE /group/leaveGroup`, `/group/deleteGroup` | Leave a group or remove a group | Protected; request body contains `groupId`; accepted members can leave, while group admins/owners can delete. |
| `POST /expense-splitter/add-expense/:groupId` | Add a shared group expense | Protected; accepts a 2–100 character `title`, positive `amount`, and `splitType` `equal` or `custom`. Equal splits require member `participants`; custom `splits` require unique group-member IDs and amounts summing to the total (within 0.01). Returns `201`. |
| `GET /expense-splitter/get-expenses/:groupId` | Group expense history | Protected; accepted group membership is required; returns `{ expenses }` with payer and participant shares. |
| `GET /expense-splitter/get-settlements/:groupId` | Group settlement history | Protected; accepted group membership is required; returns `{ settlements }` with payer, receiver, amount, status, and date. |
| `GET /expense-splitter/get-balances/:groupId` | Group totals and suggested payments | Protected; calculates each member's paid amount, share, and net balance from expenses and confirmed settlements. Pending payments reserve the suggested amount until confirmed or rejected. |
| `POST /expense-splitter/settle/:groupId` | Mark a payment as paid | Protected; body is `{ receiverId, amount }`. Creates a pending request only when the payer currently owes that recipient. |
| `POST /expense-splitter/settlements/:settlementId/respond` | Confirm or reject a payment | Protected; body is `{ accept: true }` or `{ accept: false }`. Only the recipient can respond; balances change only after confirmation. |
| `GET /expense-splitter/get-balances/:groupId` | Group totals and suggested payments | Protected; calculates each member's paid amount, share, and net balance from expenses and confirmed settlements. Pending payments reserve the suggested amount until confirmed or rejected. |
| `POST /expense-splitter/settle/:groupId` | Mark a payment as paid | Protected; body is `{ receiverId, amount }`. Creates a pending request only when the payer currently owes that recipient. |
| `POST /expense-splitter/settlements/:settlementId/respond` | Confirm or reject a payment | Protected; body is `{ accept: true }` or `{ accept: false }`. Only the recipient can respond; balances change only after confirmation. |
| `GET /reports/expenses` | Reports with month/week/custom/category filters | Protected. Monthly uses `type, year, month`; weekly uses `type, startDate`; custom uses `type, startDate, endDate`; category uses `type=category, category` and optional date range. Response includes `reportInfo`, summary totals, category/daily/weekly breakdowns, top expenses, comparison, and insights. Invalid ranges/categories return `400`. |

Validation failures generally return `400` with `{ message, details }` for Joi-validated routes; authentication failures return `401`, authorization failures `403`, missing records `404`, and unexpected server errors `500`. Some older handlers use `{ error }` instead of `{ message }`; the API client handles both.
