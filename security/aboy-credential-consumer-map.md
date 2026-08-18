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
