# Aboy AI privacy and retention inventory

This is a source-derived inventory, not a claim that deletion or retention automation exists.

| Data | Classification | Current source-observed storage | Retention finding |
| --- | --- | --- | --- |
| Public medical sources and owned diagrams | PUBLIC | knowledge and media tables/storage | Source lifecycle exists; retention is not security-sensitive |
| Account profile, institution, role and push token | CONFIDENTIAL | Supabase profile tables | Account deletion exists on the website, but backend retention enforcement is not evidenced |
| Questions, generated answers and citations | SENSITIVE | query audit/history tables | No source-enforced expiry was found; raw medical/educational queries are retained |
| Gemini Live transcripts and summaries | SENSITIVE | `ai_live_sessions` | No source-enforced expiry was found |
| Uploaded documents/images/audio | SENSITIVE | processed in memory by provider-backed endpoints | Persistent upload storage was not found in these routes; provider handling still requires disclosure |
| Feedback text | CONFIDENTIAL | feedback tables and optional Discord notification | No source-enforced expiry was found; outbound Discord content is a privacy consideration |
| Operational logs | INTERNAL | Railway/runtime logs | Live frames/transcript excerpts must not be logged; identifiers should be minimized |
| Audit and usage metadata | CONFIDENTIAL | audit, session and token-usage tables | Append-only audit design exists; retention period is undocumented |

Open privacy work: define approved retention periods, document provider processing, verify account
deletion covers derived rows, and add deletion/retention automation only after product requirements
and legal basis are approved.
