"""Personal learning-intelligence profile: builds + reads the per-user model
that makes Aboy feel built for each person and smarter every session.

`update_profile_after_query` runs in the background after every answer — no
manual input from the user, ever.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from app.db.supabase import get_db
from app.core.intelligence.topics import extract_topics, is_followup

logger = logging.getLogger(__name__)

_SESSION_GAP = timedelta(minutes=30)  # a new burst of activity = a new session


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse(ts) -> datetime | None:
    if not ts:
        return None
    if isinstance(ts, datetime):
        return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except Exception:
        return None


async def get_raw_profile(user_id: str) -> dict | None:
    db = await get_db()
    try:
        res = await db.table("user_intelligence_profile").select("*").eq("user_id", user_id).maybe_single().execute()
        return res.data if res else None
    except Exception as exc:
        logger.warning("profile read failed: %s", exc)
        return None


def _classify(stats: list[dict]) -> dict:
    """Derive frequent / struggling / mastered / strong / weak from topic tallies."""
    frequent = sorted(stats, key=lambda s: s["query_count"], reverse=True)
    struggling, mastered, strong, weak = [], [], [], []
    for s in stats:
        topic, qc, fc = s["topic"], s["query_count"], s["followup_count"]
        if fc >= 2 or (qc >= 2 and fc / max(qc, 1) >= 0.5):
            struggling.append({"topic": topic, "count": fc})
            weak.append(topic)
        elif qc >= 3 and fc == 0:
            mastered.append(topic)
            strong.append(topic)
    return {
        "topics_frequent": [{"topic": s["topic"], "count": s["query_count"]} for s in frequent[:6]],
        "topics_struggling": sorted(struggling, key=lambda x: x["count"], reverse=True)[:6],
        "topics_mastered": mastered[:10],
        "strong_areas": strong[:6],
        "weak_areas": weak[:6],
    }


async def update_profile_after_query(user_id: str, role: str, session_id: str, query: str) -> None:
    """Update the user's intelligence profile after one answered query."""
    try:
        db = await get_db()
        now = _now()
        cur_topics = extract_topics(query, role)

        # Look at the previous query in this session to detect follow-up/struggle.
        prev_topics: list[str] = []
        try:
            prev = await db.table("query_audit_log").select("query_raw").eq("session_id", session_id) \
                .order("created_at", desc=True).limit(3).execute()
            for r in (prev.data or []):
                # Skip the current query (its audit row may already be written).
                if r.get("query_raw") and r["query_raw"] != query:
                    prev_topics = extract_topics(r["query_raw"], role)
                    break
        except Exception:
            pass

        followup = is_followup(query, prev_topics, cur_topics)

        # A clarification ("explain that again") often has no topic keyword of
        # its own — attribute the struggle to the previous question's topic.
        topics_to_bump = cur_topics or (prev_topics if followup else [])

        # Tally each topic atomically.
        for topic in topics_to_bump:
            try:
                await db.rpc("bump_topic_stat", {"p_user": user_id, "p_topic": topic, "p_is_followup": followup}).execute()
            except Exception as exc:
                logger.warning("bump_topic_stat failed: %s", exc)

        # Existing profile → streak / session / histogram maths.
        existing = await get_raw_profile(user_id)
        last_active = _parse(existing.get("last_active_at")) if existing else None
        streak = existing.get("current_streak", 0) if existing else 0
        longest = existing.get("longest_streak", 0) if existing else 0
        total_sessions = existing.get("total_sessions", 0) if existing else 0
        total_queries = existing.get("total_queries", 0) if existing else 0
        pattern = (existing.get("study_pattern") if existing else None) or {}
        hist = pattern.get("hour_histogram") or {}

        # Streak (UTC day boundaries).
        today = now.date()
        if last_active is None:
            streak = 1
        else:
            delta_days = (today - last_active.date()).days
            if delta_days == 0:
                streak = max(streak, 1)
            elif delta_days == 1:
                streak += 1
            else:
                streak = 1
        longest = max(longest, streak)

        # New session if first ever or a real gap since last activity.
        if last_active is None or (now - last_active) > _SESSION_GAP:
            total_sessions += 1
        total_queries += 1

        hist[str(now.hour)] = hist.get(str(now.hour), 0) + 1
        peak_hour = int(max(hist, key=hist.get)) if hist else now.hour

        # Recompute topic-derived fields from the full tally.
        stats_res = await db.table("user_topic_stats").select("*").eq("user_id", user_id).execute()
        derived = _classify(stats_res.data or [])

        last_topic = cur_topics[0] if cur_topics else (existing.get("last_topic") if existing else None)
        last_topic_at = now.isoformat() if cur_topics else (existing.get("last_topic_at") if existing else None)

        row = {
            "user_id": user_id,
            "role": role,
            "study_pattern": {**pattern, "hour_histogram": hist},
            "peak_active_hour": peak_hour,
            "current_streak": streak,
            "longest_streak": longest,
            "last_active_at": now.isoformat(),
            "last_topic": last_topic,
            "last_topic_at": last_topic_at,
            "total_sessions": total_sessions,
            "total_queries": total_queries,
            "updated_at": now.isoformat(),
            **derived,
        }
        await db.table("user_intelligence_profile").upsert(row).execute()
    except Exception as exc:  # never break a response
        logger.warning("update_profile_after_query failed: %s", exc)


def personalization_snippet(profile: dict | None) -> str:
    """A short instruction injected into the system prompt so answers adapt to
    what this user already knows / struggles with."""
    if not profile:
        return ""
    parts: list[str] = []
    struggling = [t["topic"] for t in (profile.get("topics_struggling") or [])]
    mastered = profile.get("topics_mastered") or []
    if struggling:
        parts.append(
            f"This learner has previously struggled with {', '.join(struggling[:3])} — "
            "explain these more simply, step by step, and check understanding."
        )
    if mastered:
        parts.append(
            f"They have already mastered {', '.join(mastered[:3])} — do not re-explain the basics "
            "of these; build on them and go deeper/more clinical, and where relevant connect new "
            "concepts back to them (e.g. 'as you saw with …')."
        )
    if not parts:
        return ""
    return " [Personalisation: " + " ".join(parts) + "]"
