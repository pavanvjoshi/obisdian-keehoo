# Inspecto — IAM Integration Guide

Complete reference for how Inspecto integrates with the shared IAM service. Use this when wiring another application to the same IAM.

---

## 1. Summary

| Item | Detail |
|------|--------|
| IAM provider | **Custom Keehoo IAM** via API gateway (not Keycloak / Auth0 / Cognito / OIDC SDK) |
| Dev base URL | `https://apigatewaydev.keehoo.ai` |
| App name (header) | `inspecto` (`Application-Name`) |
| Who calls IAM | **Frontend only** (`inspecto-frontend`) |
| Backend role | Inspecto backend does **not** call IAM and does **not** validate JWTs today |
| Client library | None — native `fetch` |
| Total IAM APIs used | **7** |

Auth is entirely **browser ↔ IAM**. Inspecto’s FastAPI backend stores unused `iam_*` settings but has no auth routers or JWT middleware.

---

## 2. Architecture

```
┌──────────────────────┐     HTTPS + Application-Name      ┌─────────────────────────┐
│  inspecto-frontend   │ ─────────────────────────────────► │  External IAM Gateway   │
│  (Vite + React)      │         /api/auth/*                │  apigatewaydev.keehoo.ai│
│                      │ ◄───────────────────────────────── │                         │
│  access token (mem)  │   tokens + user / OTP responses    └─────────────────────────┘
│  refresh token (LS) │
└──────────┬───────────┘
           │ /api/*  (Vite proxy → localhost:8000)
           │ Bearer intended via httpClient — not wired into main api.ts yet
           ▼
┌──────────────────────┐
│  inspecto-backend    │  Public APIs (CORS only)
│  (FastAPI)           │  iam_* config present but UNUSED
└──────────────────────┘
```

### Bootstrap order

`ThemeProvider` → `AuthProvider` → `ErrorBoundary` → `HashRouter` → `AppBootstrap` (`bootstrapAuth`) → routes.

---

## 3. IAM APIs used (7)

All paths are relative to `VITE_IAM_BASE_URL` (trailing slashes stripped).

Shared request headers (most endpoints):

| Header | Value |
|--------|--------|
| `Application-Name` | `VITE_IAM_APP_NAME` (e.g. `inspecto`) |
| `Content-Type` | `application/json` |
| `X-Platform` | `Web` |

Logout uses `Application-Name` + `Authorization: Bearer <accessToken>` only (no body, no `X-Platform`).

### 3.1 Register

| | |
|--|--|
| **Method / path** | `POST /api/auth/register` |
| **Client** | `inspecto-frontend/src/features/auth/api/register.ts` |
| **Body** | `{ email, password, name? }` |
| **Success** | `{ code: "OTP_SENT", message, userID, expiresIn }` |
| **Errors handled** | `409` email exists, `429` rate limit, `400` validation |

### 3.2 Verify email

| | |
|--|--|
| **Method / path** | `POST /api/auth/verify-email` |
| **Client** | `inspecto-frontend/src/features/auth/api/verifyEmail.ts` |
| **Body** | `{ email, otp }` |
| **Success** | `{ code: "OTP_VERIFIED", message, email, verified, timestamp }` |
| **Errors handled** | `401` invalid/expired OTP, `400` bad OTP format, `429` rate limit |
| **Notes** | OTP is 6 digits. Verify does **not** auto-login; user must sign in after. |

### 3.3 Login

| | |
|--|--|
| **Method / path** | `POST /api/auth/login` |
| **Client** | `inspecto-frontend/src/features/auth/api/login.ts` |
| **Body** | `{ email, password }` |
| **Success** | See [Login response](#31-login-response-shape) |
| **Errors handled** | `401` bad credentials / unverified, `400` validation, `429` rate limit |

#### Login response shape

```ts
{
  code: "LOGIN_SUCCESS";
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
  refreshTokenExpiresInSeconds: number;
  userID: string;
  email: string;
  userName: string;
  appName: string;
  tenantID?: string;
  tenantName?: string;
  role: string;
  permissions: string[];
}
```

Defined in `inspecto-frontend/src/features/auth/types.ts`.

### 3.4 Refresh token

| | |
|--|--|
| **Method / path** | `POST /api/auth/refresh-token` |
| **Client** | `inspecto-frontend/src/features/auth/api/refresh.ts` |
| **Body** | `{ refreshToken }` |
| **Success** | Access token only (flexible field names) |
| **Accepted token fields** | `accessToken` \| `access_token` \| `token` |
| **Accepted expiry fields** | `accessTokenExpiresInSeconds` \| `expiresIn` (fallback **1200s**) |
| **Important** | IAM does **not** rotate refresh tokens. Client must keep the original refresh token. Refresh does **not** return user profile. |

> Historical note in code: path was incorrectly `/api/auth/email/refresh-token`; correct path is `/api/auth/refresh-token`.

### 3.5 Forgot password

| | |
|--|--|
| **Method / path** | `POST /api/auth/forgot-password` |
| **Client** | `inspecto-frontend/src/features/auth/api/forgotPassword.ts` |
| **Body** | `{ email }` |
| **Success** | `{ code?, message?, expiresIn? }` |
| **Client behavior** | Non-5xx / non-network errors are treated as success (enumeration safety). Only `429` and server/network errors surface to the user. |
| **Also used for** | Resend OTP on reset-password flow (60s cooldown, max 3). |

### 3.6 Reset password

| | |
|--|--|
| **Method / path** | `POST /api/auth/reset-password` |
| **Client** | `inspecto-frontend/src/features/auth/api/resetPassword.ts` |
| **Body** | `{ email, otp, newPassword }` |
| **Success** | `{ code?, message? }` |
| **Errors handled** | `401` invalid/expired OTP, `400` validation, `429` rate limit |

### 3.7 Logout

| | |
|--|--|
| **Method / path** | `POST /api/auth/email/logout` |
| **Client** | `inspecto-frontend/src/features/auth/api/logout.ts` |
| **Headers** | `Application-Name`, `Authorization: Bearer <accessToken>` |
| **Body** | none |
| **Client behavior** | Best-effort; client always clears local session even if IAM call fails |

> Note the path prefix: logout uses `/api/auth/email/logout`, while other auth routes omit the `email` segment. Confirm with IAM docs when integrating another app.

---

## 4. Auth flows

### 4.1 Session restore (boot)

1. `AppBootstrap` → `bootstrapAuth()`
2. Clear legacy mock key `inspecto_auth_session`
3. If `localStorage` key `inspecto.rt` (refresh token) exists:
   - Restore user from `inspecto.user`
   - Call refresh API
   - Put access token in Zustand (`authStore`)
   - Schedule proactive refresh
4. Else → status `unauthenticated`

Timeout: **15 seconds** for bootstrap refresh.

### 4.2 Sign up → verify → login

```
SignUp → POST /register → OTP_SENT
       → store verify context → #/verify-email
Verify → POST /verify-email → OTP_VERIFIED → navigate to login
Login  → POST /login → applyLoginResult() → tokens + user → intended route
```

### 4.3 Token refresh

| Trigger | Behavior |
|---------|----------|
| Proactive timer | Fires at **access expiry − 120 seconds** |
| Tab visibility | Refresh if near expiry when tab becomes visible |
| 401 on `apiFetch` | Refresh then retry (helper exists; main `api.ts` does not use it yet) |
| Single-flight | Concurrent refresh calls share one in-flight promise |
| Transient errors | Up to 3 retries with exponential backoff (2s base), then retry in 15s |
| Hard logout | On `401` / `400` from refresh → clear session → login |

### 4.4 Sign out

1. Clear refresh timer
2. Clear `tokenStorage` + auth store
3. Best-effort `POST /api/auth/email/logout` with Bearer access token
4. Navigate to `#/login`

---

## 5. Token & storage model

| Token / data | Where stored | Lifetime |
|--------------|--------------|----------|
| Access token | Memory only (`authStore`) | From IAM; fallback **1200s (20 min)** |
| Refresh token | `localStorage` → `inspecto.rt` | From login `refreshTokenExpiresInSeconds` (backend default config suggests **7 days**) |
| User profile | `localStorage` → `inspecto.user` | Required because refresh returns no user |
| Legacy mock session | `inspecto_auth_session` | Cleared on boot; unused |

**No refresh-token rotation.** Do not overwrite `inspecto.rt` on refresh success.

---

## 6. Configuration

### 6.1 Frontend (required)

| Variable | Purpose |
|----------|---------|
| `VITE_IAM_BASE_URL` | IAM gateway base URL; HTTPS required in production builds |
| `VITE_IAM_APP_NAME` | Sent as `Application-Name`; must match IAM allow-list |

Example (local):

```env
VITE_IAM_BASE_URL=https://apigatewaydev.keehoo.ai/
VITE_IAM_APP_NAME=inspecto
```

Loaded via `inspecto-frontend/src/lib/config.ts`. Documented in `inspecto-frontend/.env.example`.

### 6.2 Backend settings (defined, currently unused)

From `inspecto-backend/app/config.py`:

| Setting | Default | Env |
|---------|---------|-----|
| `iam_allowed_app_names` | `"Inspecto"` | `IAM_ALLOWED_APP_NAMES` |
| `iam_otp_expires_seconds` | `120` | `IAM_OTP_EXPIRES_SECONDS` |
| `iam_otp_length` | `6` | `IAM_OTP_LENGTH` |
| `iam_rate_limit_max_attempts` | `5` | `IAM_RATE_LIMIT_MAX_ATTEMPTS` |
| `iam_rate_limit_window_seconds` | `300` | `IAM_RATE_LIMIT_WINDOW_SECONDS` |
| `iam_jwt_secret` | `""` | `IAM_JWT_SECRET` |
| `iam_access_token_expires_seconds` | `1200` | `IAM_ACCESS_TOKEN_EXPIRES_SECONDS` |
| `iam_refresh_token_expires_seconds` | `604800` | `IAM_REFRESH_TOKEN_EXPIRES_SECONDS` |
| `iam_default_role` | `"engineer"` | `IAM_DEFAULT_ROLE` |
| `iam_default_permissions` | `Pipeline:READ,Pipeline:WRITE,Pipeline:RUN,Module:READ,Module:WRITE` | `IAM_DEFAULT_PERMISSIONS` |

These are **not referenced** by any backend router or middleware today. Treat them as leftovers / planned in-process IAM — **do not assume the Inspecto backend enforces tokens**.

> Casing note: frontend app name is `inspecto`; backend default allow-list string is `"Inspecto"`. Gateway matching may be case-sensitive — confirm with IAM.

---

## 7. Roles & permissions

### IAM contract (from login)

- **Role**: string (default conceptually `"engineer"`)
- **Permissions**: `Resource:ACTION` strings, e.g.:
  - `Pipeline:READ`
  - `Pipeline:WRITE`
  - `Pipeline:RUN`
  - `Module:READ`
  - `Module:WRITE`

Helpers in `permissions.ts`:

```ts
can(permission: string)   // permissions.includes(...)
hasRole(role: string)     // user.role === role
```

**UI enforcement is incomplete** — helpers exist but are not fully applied across screens.

### Legacy UI bridge (mismatched)

`legacyTypes.ts` / `AuthProvider` still use older shapes:

- Roles: `"admin" | "engineer" | "viewer"`
- Older permission names like `flows:read` (not the IAM `Pipeline:READ` style)

Align new apps on the **IAM login payload** (`Resource:ACTION`), not the legacy UI types.

### Tenancy

Optional `tenantID` / `tenantName` on login. No OAuth scopes.

---

## 8. Client validation (frontend)

Password rules (`schemas.ts`):

- Length **8–16**
- At least one uppercase, lowercase, number, special character
- No spaces

OTP: exactly **6 digits**.

Email: standard email validation via Zod.

---

## 9. Middleware / guards / HTTP clients

| Piece | Path | Role |
|-------|------|------|
| `authClient.ts` | `features/auth/api/authClient.ts` | Shared IAM `fetch` + error mapping |
| `httpClient.ts` `apiFetch` | `lib/api/httpClient.ts` | App API with Bearer + 401 refresh retry — **defined but unused by main `api.ts`** |
| `refreshManager.ts` | `features/auth/session/refreshManager.ts` | Proactive / single-flight refresh |
| `PublicOnlyRoute` | `app/routing/PublicOnlyRoute.tsx` | Redirects authenticated users away from landing/auth → `#/dashboard` |
| `ProtectedRoute` | Documented in README | **Not implemented** — app routes under `AppShell` are not auth-gated in code today |
| Backend | CORS only | No JWT / auth dependency |

Social OAuth UI (`SocialButtons`, `AuthCallback`) is **stub / TODO** — not integrated with IAM.

---

## 10. What is NOT IAM

| Call | Destination |
|------|-------------|
| `POST /api/contact` | Inspecto backend (contact form) |
| GitHub `Authorization: Bearer` in code scanner | Repo clone API auth — unrelated |
| Azure OpenAI Bearer tokens | LLM client — unrelated |

---

## 11. Code inventory

### Core IAM / session

```
inspecto-frontend/src/lib/config.ts
inspecto-frontend/src/lib/api/httpClient.ts
inspecto-frontend/src/features/auth/api/authClient.ts
inspecto-frontend/src/features/auth/api/login.ts
inspecto-frontend/src/features/auth/api/register.ts
inspecto-frontend/src/features/auth/api/verifyEmail.ts
inspecto-frontend/src/features/auth/api/refresh.ts
inspecto-frontend/src/features/auth/api/logout.ts
inspecto-frontend/src/features/auth/api/forgotPassword.ts
inspecto-frontend/src/features/auth/api/resetPassword.ts
inspecto-frontend/src/features/auth/types.ts
inspecto-frontend/src/features/auth/schemas.ts
inspecto-frontend/src/features/auth/permissions.ts
inspecto-frontend/src/features/auth/tokenStorage.ts
inspecto-frontend/src/features/auth/session/authStore.ts
inspecto-frontend/src/features/auth/session/applySession.ts
inspecto-frontend/src/features/auth/session/bootstrapAuth.ts
inspecto-frontend/src/features/auth/session/refreshManager.ts
```

### Hooks / UI / providers

```
inspecto-frontend/src/features/auth/hooks/useLogin.ts
inspecto-frontend/src/features/auth/hooks/useRegister.ts
inspecto-frontend/src/features/auth/hooks/useVerifyEmail.ts
inspecto-frontend/src/features/auth/hooks/useForgotPassword.ts
inspecto-frontend/src/features/auth/hooks/useResetPassword.ts
inspecto-frontend/src/features/auth/SignIn.tsx
inspecto-frontend/src/features/auth/SignUp.tsx
inspecto-frontend/src/features/auth/VerifyEmail.tsx
inspecto-frontend/src/features/auth/ForgotPassword.tsx
inspecto-frontend/src/app/providers/AuthProvider.tsx
inspecto-frontend/src/app/AppBootstrap.tsx
inspecto-frontend/src/app/routing/PublicOnlyRoute.tsx
```

### Backend (unused IAM config only)

```
inspecto-backend/app/config.py
```

---

## 12. Checklist for integrating another application

1. Register the new **app name** on the IAM allow-list; send it as `Application-Name` on every call.
2. Point at the same gateway base URL (or the env-specific equivalent).
3. Implement the same **7 endpoints** (or the subset you need): register, verify-email, login, refresh-token, forgot-password, reset-password, logout.
4. Always send `X-Platform: Web` (or the platform value IAM expects) on body POSTs.
5. Store refresh token + user profile client-side; keep access token in memory.
6. On refresh: update **access token only** — do not expect a new refresh token or user payload.
7. Proactive refresh ~**2 minutes before** access expiry (Inspecto uses 120s skew).
8. Do **not** call Inspecto backend for auth — it does not proxy or own these APIs.
9. If your app’s APIs must be protected, implement JWT validation yourself (or via gateway); Inspecto backend does not enforce IAM tokens today.
10. Align permission strings with IAM (`Pipeline:READ` style), not Inspecto’s legacy `flows:read` UI types.
11. Confirm logout path (`/api/auth/email/logout`) vs other `/api/auth/*` paths with IAM owners.
12. Password / OTP rules above are client-side; IAM may enforce additional rules server-side.

---

## 13. Quick API cheat sheet

```
POST {IAM_BASE}/api/auth/register          { email, password, name? }
POST {IAM_BASE}/api/auth/verify-email      { email, otp }
POST {IAM_BASE}/api/auth/login             { email, password }
POST {IAM_BASE}/api/auth/refresh-token     { refreshToken }
POST {IAM_BASE}/api/auth/forgot-password   { email }
POST {IAM_BASE}/api/auth/reset-password    { email, otp, newPassword }
POST {IAM_BASE}/api/auth/email/logout      Authorization: Bearer <accessToken>
```

Headers (except logout): `Application-Name`, `Content-Type: application/json`, `X-Platform: Web`.

---

*Generated from the Inspecto codebase (`inspecto-frontend` auth feature + `inspecto-backend` config). Prefer the source files listed above if anything drifts.*
