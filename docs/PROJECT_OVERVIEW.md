# Aboy AI — Project Overview

> Master "source of truth" for the Aboy AI project. Captures the vision, what's
> built, why it's different, how it works, and what's next. This is the document
> every other artifact (investor deck, customer one-pager, developer onboarding,
> Play Store listing) should be derived from. Keep it living — update as we ship.
>
> Last updated: 2026-06-20 · Stage: closed-beta push · Domain: aboyhealth.com

---

## 1. What Aboy AI is (in one line)

**The medical-education AI you can trust and cite** — it gives clear, cited
answers from verified medical sources, automatically shows relevant real
diagrams with their source, and adapts to who's asking — built specifically so
it won't make things up.

## 2. The problem

General AI assistants (ChatGPT, Gemini, Claude) are powerful, but in medicine
they have a dangerous failure mode: they **invent citations, references, and
"facts" that look real.** For a medical student or clinician, a confidently
wrong answer — or a fabricated source — isn't a minor bug; it can fail an exam
or harm a patient. There is no general assistant built to be *trustworthy first*
for healthcare learning.

## 3. The wedge / why Aboy wins (the moat)

We do **not** try to out-feature OpenAI. We win the race they can't run:

- **Cited from verified sources, and built not to fabricate.** Citation
  integrity is enforced in code — Aboy only cites sources actually retrieved,
  and a streaming filter strips any invented references. This is the core pitch
  a doctor or student cares about.
- **Real, attributed diagrams — never generated.** We deliberately do **not**
  use generative/DALL-E imagery. A hallucinated anatomy diagram (an extra valve,
  a mislabeled nerve) destroys the trust that is our entire reason to exist.
- **Honest gaps.** Where there's no good image, Aboy gives a labelled
  textbook-style breakdown in words rather than a confident-but-wrong picture.
- **Built for healthcare**, not a general chatbot: role-aware tone, voice +
  camera study, a learning loop, a digital-textbook feel.

Positioning line: **"Cited from verified medical sources — it won't make up
references."**

## 4. Who it's for

Medical and nursing students, junior and senior clinicians, pharmacists,
educators, and researchers — anyone studying or working in healthcare who needs
fast, trustworthy, source-backed explanations. Role adjusts **tone and examples
only** — it never restricts what topics a user can ask about.

## 5. What's built and live (today)

**Answers**
- Cited RAG answers over a verified medical knowledge base + live web search.
- Tiered models for speed/cost (lightweight model for simple/conversational,
  stronger model for detailed/clinical).
- Citation integrity guardrails (no fabricated sources; clean prose; sources
  shown as subtle favicon chips below the answer — ChatGPT/Gemini style).
- Anti-sycophancy and scope guarantees (answers any topic; never self-restricts
  by the user's specialty).

**Images (the digital-textbook layer)**
- **Universal auto-images:** any substantive study question automatically gets
  relevant illustrations — no need to ask for a diagram.
- **Source-agnostic, ranked retrieval:** gathers candidates from across the web
  *and* a curated/verified set, ranks by relevance + source trust (edu/gov/known
  medical sites rank higher), and returns up to **3 references from different
  sites**, each with its own "View on source" link.
- **Relevance-filtered:** off-topic images are dropped; the subject is recovered
  from conversation history for follow-ups ("I want the diagram").
- **Renders everywhere:** the image proxy transcodes WebP/GIF → JPEG/PNG so they
  display on-device; watermarked/stock images are allowed (shown with a source
  link — we never host or own them).
- **Self-learning knowledge base:** every image found is saved, so coverage and
  speed grow with real usage. A coverage-gap log records what's still missing.
- **No generated images** (principle, not a limitation).

**Experience**
- Voice + live camera study mode; on-device speech recognition.
- **Snap-and-explain (Camera):** photograph a textbook page, diagram, ECG, notes
  or clinical image → get a clear explanation in the chat (Gemini vision).
  (Photos-from-gallery and File/PDF upload are on the roadmap.)
- Live research status while answering (Searching references → diagrams →
  analyzing sources → generating answer) so it *feels* like a researcher.
- Role-aware personalization (tone/examples), optional at onboarding.

**Platform / ops**
- Mobile: Expo / React Native, shipped to testers; instant updates via OTA, with
  full native builds only when native code changes.
- Backend: FastAPI on Railway (deploy on git push).
- Marketing site + SEO blog at aboyhealth.com (privacy & terms live).

## 6. How it works (high-level architecture)

```
User question
   ↓  classify (conversational / knowledge / live-research)
   ↓  retrieve  → knowledge base (vector search) + web search (in parallel)
   ↓  illustrate → ranked image references (web + curated), relevance-filtered
   ↓  reason + generate (cited, integrity-checked)
   ↓  display → answer + images (with sources) + source chips
```

- **Text:** embeddings + vector search over a verified knowledge base, plus live
  web search; results are fed to the model, which is constrained to cite only
  what was retrieved.
- **Images:** a separate "image plane" — deterministic, ranked retrieval with a
  learning knowledge base and a resolving/transcoding proxy. Never a generative
  model.
- **Trust:** enforced in code (citation integrity filter, no fabricated
  references, no generated diagrams), not left to the model's goodwill.

## 7. Principles that define the product (don't break these)

1. **Trust is the moat.** Never fabricate sources; never generate medical images.
2. **Role personalizes, never restricts.** Adapt to the question, not the job
   title.
3. **Honest over impressive.** A clear text breakdown beats a pretty wrong
   picture; show "no image" rather than a wrong one.
4. **We display, we don't own.** Images are shown with their source link; the
   user goes to the source to download.
5. **Ship fast, verify, tell the truth** about what works and what doesn't.

## 8. Current status & immediate roadmap

- **Status:** feature-complete enough for closed beta — cited answers, universal
  relevant images with sources, clean source display, working mobile experience.
- **Next (launch path):**
  1. Recruit ~15–20 testers and run **Google Play closed testing** (Google
     requires ≥12 testers for 14 days before production) — starting this clock is
     the fastest path to launch.
  2. Complete the Play Store listing (copy, screenshots, data-safety form).
  3. Grow image/answer coverage from the **coverage-gap log** (real questions),
     using verified/open sources — no generated imagery.
- **Deferred (not blocking):** SVG schematic diagrams; large-scale curated image
  expansion.

## 9. How this document is used

- **Investor/partner deck** → derive from §2 (problem), §3 (moat), §5 (traction),
  §8 (roadmap).
- **Customer one-pager** → §1, §3, §4, §5.
- **Developer onboarding** → §6, §7, plus the repo's deploy and architecture notes.
- **Play Store listing** → §1, §3, §5 (experience).

Keep this file truthful and current; everything else flows from it.
