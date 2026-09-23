# Aboy AI privacy and retention inventory

This is a source-derived inventory, not a claim that deletion or retention automation exists.

| Data | Classification | Current source-observed storage | Retention finding |
| --- | --- | --- | --- |
| Public medical sources and owned diagrams | PUBLIC | knowledge and media tables/storage | Source lifecycle exists; retention is not security-sensitive |
| Account profile, institution, role and push token | CONFIDENTIAL | Supabase profile tables | Existing verified manual deletion process remains; migration 014 prepares owned-data cascades but is not yet staging-validated or deployed |
| Questions, generated answers and citations | SENSITIVE | query audit/history tables | Retained while the account is active; migration 014 prepares account-deletion cascades |
| Gemini Live transcripts and summaries | SENSITIVE | `ai_live_sessions` | Retained while the account is active; migration 014 changes orphaning (`SET NULL`) to deletion cascade |
| Uploaded documents/images/audio | SENSITIVE | processed in memory by provider-backed endpoints | Persistent upload storage was not found in these routes; provider handling still requires disclosure |
| Feedback text | CONFIDENTIAL | feedback tables; optional Discord notification | Discord forwarding now requires a separate disabled-by-default opt-in flag; free text remains an explicit external-processing decision |
| Operational logs | INTERNAL | Railway/runtime logs | Query/transcript/provider-body logging is removed from the reviewed paths; runtime verification is still required |
| Audit and usage metadata | CONFIDENTIAL | audit, session and token-usage tables | Append-only audit design exists; retention period is undocumented |

Open privacy work: staging-apply and validate migration 014 against real data, validate every
`NOT VALID` foreign key before production, document provider/optional Discord processing, and
decide whether active-account retention needs a shorter fixed expiry. No production claim is made.
