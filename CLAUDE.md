# Aboy AI (this repo)

⚠️ Despite the folder name `legalbridge`, **this repo is Aboy AI** — the cited medical-education AI app (aboyhealth.com). GitHub: `Dstbobo/aboy-ai`. The LegalBridge legal-AI product lives in a different repo (`Desktop/Legalbridge`).

- `backend/` — FastAPI, auto-deploys to Railway on `git push`
- `mobile/` — Expo SDK 52 React Native app; OTA via `eas update --branch mvp`; store builds via `eas build --platform android --profile mvpstore`
- `web/` — static site → aboyhealth.com

## RAVEN vault sync (required)

This project is connected to Daniel's shared brain: the **RAVEN Obsidian vault** at `C:\Users\dstag\OneDrive\RAVEN\RAVEN` (git repo, auto-pushes to `Dstbobo/RAVEN`). Follow the vault's own `CLAUDE.md` rules when writing there.

**At the end of every working session (and after anything major):**

1. Update the project status note `22 - Companies\Aboy AI.md` — current stage, exactly where we stopped, open loops, next steps. Update `updated:` in its frontmatter. Never duplicate the note; edit in place. **No secrets in the vault.**
2. Update the Aboy AI row in `22 - Companies\Companies.md` status board.
3. Append to today's daily note `21 - Daily Notes\YYYY-MM-DD.md` (index line at top, details below).
4. Commit and push the vault: `git -C "C:\Users\dstag\OneDrive\RAVEN\RAVEN" add -A && git commit -m "..." && git push`.

Read the status note and recent daily notes at session start to pick up where the last session stopped.
