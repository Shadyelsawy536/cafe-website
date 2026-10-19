# Grafana k6 — safe baseline tests

These scripts are read-only. They do not create orders, touch payment providers, or mutate Supabase data.

## Install on Windows

Install k6 using one of the options on Grafana's official installation page:
https://grafana.com/docs/k6/latest/set-up/install-k6/

If using Windows Package Manager and the package is available on your machine:

```powershell
winget install k6 --source winget
```

Open a new PowerShell window and verify:

```powershell
k6 version
```

## 1. Health-check smoke test (safe first run)

From the repository root:

```powershell
k6 run .\tests\k6\health-check.js
```

The default target is the project's public `health-check` Edge Function. This endpoint only returns `{ "ok": true, "checkedAt": "..." }`.

## 2. Gentle load test

Only run this after the smoke test passes. It ramps gradually to a maximum of 10 virtual users for a short period:

```powershell
$env:LOAD_TEST = "true"
k6 run .\tests\k6\health-check.js
Remove-Item Env:LOAD_TEST
```

This is a small baseline test, not a capacity limit or production-readiness certification. Stop if Supabase latency/errors rise or other users experience problems.

## 3. Website hosting smoke test

Replace the example with the actual deployed storefront URL. Include `?restaurant=cafe` if that is how the tenant is selected:

```powershell
$env:SITE_URL = "https://YOUR-DEPLOYED-SITE/?restaurant=cafe"
k6 run .\tests\k6\website.js
Remove-Item Env:SITE_URL
```

Optional controls: `$env:VUS = "2"` and `$env:DURATION = "30s"`.

## Interpreting results

- `http_req_duration p(95)`: 95% of requests completed within this time.
- `http_req_failed`: proportion of failed HTTP requests.
- Threshold failures mean the configured baseline was not met; inspect status codes and response times before increasing load.

## Next phase

After these read-only checks, add authenticated RLS tests with a dedicated test account and a non-production/test tenant. Order creation, payment initiation, and webhook replay require isolated test data and must not be included in generic load tests against production.
