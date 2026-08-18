# Aboy AI service-role boundary

The backend and standalone Live proxy still require Supabase service-role access for server-owned
writes. This is a privileged boundary, not a substitute for authorization.

Enforced source invariants:

- Supabase access tokens are validated with the anon key; the service key is never used as a client authenticator.
- User identity comes from the verified token, never a request `user_id` or WebSocket query string.
- Profile role fields are server-controlled and protected by API allowlists plus a database trigger.
- Service-role reads and writes involving audit, history, feedback, learning profiles and transcripts are scoped to the verified user.
- A client conversation UUID cannot reassign an existing session owned by another user.
- Feedback cannot reference another user's answer.
- Mutation RPC execution is revoked from anon/authenticated roles in migration 014.
- Derived and operational tables gain RLS in migration 014; service-role access remains backend-only.
- Existing verified manual account deletion can rely on migration 014 cascades after staging validation.

Deployment status: source-only. Migrations 013 and 014 have not been applied to staging or
production in this batch. The `NOT VALID` foreign keys must be validated against staging data before
production. Service-role key rotation remains deferred until all external consumers are verified.
