"""Developer/test accounts that bypass all usage limits.

These accounts have unlimited tokens and unlimited queries (no daily token
budget, no rate limiting). Keep this list tiny and intentional.
"""

from __future__ import annotations

# Lower-cased emails of unlimited developer accounts.
DEV_EMAILS: set[str] = {
    "dstgloballivefarm@gmail.com",
}

# Resolved Supabase user ids (so checks that only have the user_id — e.g. the
# token budget — can bypass without a DB/email lookup).
DEV_USER_IDS: set[str] = {
    "4014e490-db57-4f22-bc25-6f9cefc4295d",  # dstgloballivefarm@gmail.com
}


def is_unlimited(user_id: str | None = None, email: str | None = None) -> bool:
    if user_id and user_id in DEV_USER_IDS:
        return True
    if email and email.lower() in DEV_EMAILS:
        return True
    return False
