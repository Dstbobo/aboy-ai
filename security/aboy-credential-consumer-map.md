# Aboy AI credential-consumer map

This map records names and consumers only. It must never contain credential values.

| Credential type | Local consumer | CI / deployment consumer | Supabase / script consumer | Safe to rotate now? |
| --- | --- | --- | --- | --- |
| Supabase URL + anon key | mobile auth; backend token validation | EAS public configuration; Railway backend/live proxy | REST/Auth client configuration | No — verify every EAS channel and deployed service first |
| Supabase service-role key | backend database singleton; media storage; standalone Live transcript writer | Railway backend and standalone Live services | migration/seeding scripts | No — enumerate both Railway services and validate replacements first |
| Supabase database password | migration-only backend route | Railway backend only if the route is deliberately enabled | direct/pooler migration connection | No — prepare replacement and disable the migration route first |
| Supabase JWT secret | legacy local configuration; no verified tracked runtime consumer | unknown | local ignored environment | No — classify before rotation |
| Gemini key | FastAPI Live, transcription and vision; standalone Live proxy | Railway backend and standalone Live services | none | No — replace both services and test Live/vision/transcription first |
| Anthropic key | answer provider | Railway backend | none | No — verify selected provider and fallback behavior |
| Groq key | optional answer provider | Railway backend | none | No — verify provider dashboard and runtime selection |
| OpenRouter key | current answer provider | Railway backend | none | No — verify provider dashboard and runtime selection |
| Voyage key | embeddings | Railway backend | seeder/retrieval jobs | No — verify all ingestion jobs |
| Tavily key | medical-domain web search | Railway backend | none | No — verify provider dashboard |
| Redis URL / credential | cache and rate limits | Railway backend | none | No — replacement must preserve conservative abuse controls |
| Railway token | GitHub Actions deployment workflow | GitHub Actions secret | project-token minting | No — workflow logging must be contained and consumers verified |
| Migration secret | internal migration route | Railway backend / approved migration caller | none | No — identify the caller and replacement path first |

Known deployment consumers are the production FastAPI Railway service, the standalone
Gemini Live Railway service, GitHub Actions, EAS public configuration and ignored local
environments. Provider dashboards, old clones and operator automation remain external
verification blockers. Production rotation is intentionally deferred.

## External verification snapshot — 2026-08-18

No secret credential values were revealed, copied, or recorded during this
verification; only public mobile configuration identifiers were observed.

- **GitHub Actions:** the repository has one repository secret named
  `RAILWAY_TOKEN`. No repository variables, environment variables, or environment
  secrets are configured. The hardened production workflow therefore has no current
  service ID, team ID, or health URL variables and cannot deploy successfully as-is.
- **Railway:** the production Aboy project was positively identified by its `aboy-live`
  service and Aboy backend endpoint. It contains the backend, standalone Live, and
  Redis services. The backend variable names cover Supabase URL/anon/service/JWT/database,
  Gemini, Anthropic, Groq, OpenRouter, Voyage, Tavily, Redis, and migration consumers.
  The Live service consumes Supabase URL/service-role plus Gemini and OpenRouter names.
  No isolated Aboy staging project exists. Production was not changed.
- **Supabase:** neither currently authenticated Supabase context exposes the Aboy
  production project referenced by the deployed mobile configuration. The CLI context
  exposes LegalBridge, BOBOAI, and an inactive GODOVERMAN project; the browser context
  exposes a separate Free organization containing a generic project and RAVEN-STAGING.
  No Aboy staging database exists. The visible Free organization already has two active
  projects, so project creation is blocked on an explicit quota/billing decision and
  correct-account selection.
- **EAS/mobile:** the tracked EAS configuration identifies the Aboy project and binds
  existing MVP/store profiles to production backend, Live, and Supabase public settings.
  It has no isolated staging build profile. The EAS CLI session could not be verified
  during this pass, and no build or update was published.
- **Local environments and clones:** the original clone at
  `C:\Users\dstag\legalbridge` contains ignored backend and mobile environment files.
  The security worktree contains placeholders only. A broader home-directory scan was
  denied by local filesystem permissions, so additional old clones remain unverified.
- **Provider dashboards:** authenticated dashboard access was observed for Groq and
  Google AI Studio; OpenRouter required sign-in. Anthropic, Voyage, and Tavily dashboard
  consumers remain unverified. Dashboard access alone does not prove which deployed key
  is active, so all provider rotations remain blocked pending key-name/last-used checks.

## Prepared rotation sequence — do not execute

1. Freeze production deployments and take a database backup/restore checkpoint.
2. Complete the missing Supabase-account, EAS, provider-dashboard, operator-automation,
   and old-clone entries; record owners and last-used timestamps without recording values.
3. Create replacement secret slots in an isolated staging environment and verify that
   every consumer can switch independently.
4. Rotate the confirmed exposed Supabase database password first during an approved
   maintenance window; update direct/pooler migration consumers, verify connectivity,
   and revoke the previous password only after successful smoke tests.
5. Replace the Supabase service-role credential in backend, Live, and controlled scripts;
   verify RLS/service boundaries before revoking the prior credential.
6. Rotate provider credentials one provider at a time: Gemini, OpenRouter, Anthropic,
   Groq, Voyage, then Tavily. Verify the associated feature and quota before revocation.
7. Rotate the Redis credential and verify distributed rate limiting under multiple
   instances plus the bounded Redis-down path.
8. Replace the migration secret, confirm there is one approved caller, and disable the
   route when the migration window is closed.
9. Replace the Railway deployment token and update the GitHub repository secret after
   staging deployment validation. Revoke the previous token after a no-production dry run.
10. Rotate Supabase JWT/project public keys only if the correct-account review determines
    they were exposed or a coordinated project-key rollover is required; prepare mobile
    and backend compatibility first because this invalidates sessions/clients.
11. Re-run secret scans, CI, staging end-to-end tests, and a final consumer audit; then
    request separate approval before any production rollout.
