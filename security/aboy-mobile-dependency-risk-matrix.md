# Aboy mobile dependency risk matrix

Date: 2026-08-18

Scope: `security/aboy-identity-boundary` only

Decision status: temporary security-branch acceptance; review by 2026-09-18

This matrix does not approve a production release. It records why the remaining
advisories cannot be removed without replacing the markdown renderer or starting
the separately approved Expo/Metro major-upgrade branch. CI permits only the
exact advisory IDs in `mobile/security-audit-allowlist.json`, fails on any new
advisory, and fails when this review window expires.

| Dependency path | Reachability | Current control | Removal path |
|---|---|---|---|
| `react-native-markdown-display -> markdown-it -> linkify-it` | Runtime reachable, but vulnerable rules disabled | Input capped at 24,000 characters and 320 lines; render capped at 180 top-level children; `linkify` and `smartquotes` disabled; oversized URL, mail, quote, and line payloads regression-tested. Explicit citation links remain enabled. | Replace the renderer or move to a compatible parser with all advisories fixed. `linkify-it` has no release that fixes both current advisories. |
| `Expo/Metro -> image-size` | Build-time only | The package processes repository-controlled build assets and is not included as an app runtime parser. Restrict source/build inputs to reviewed repository content. | Upgrade Expo/Metro in the separate major-upgrade branch. |
| `Expo/Metro -> postcss` | Build-time only | The package processes repository-controlled CSS/source-map build input and is not an app runtime parser. | Upgrade Expo/Metro in the separate major-upgrade branch. |
| `Expo config plugins -> xcode -> uuid` | Build-time only | The vulnerable UUID buffer API is in native build tooling, not the shipped app runtime. | Upgrade Expo/config-plugin tooling in the separate major-upgrade branch. |

## Safely patched without a framework upgrade

`axios` is pinned to 1.19.0. Compatible lockfile updates also cleared the
reported `form-data`, `fast-uri`, `brace-expansion`, `js-yaml`, `nanoid`, and
`undici` advisories. Expo remains on SDK 54; only SDK-54-compatible patch
releases were accepted.

## Residual audit summary

- Before remediation: 32 vulnerable package nodes — 20 high, 12 moderate.
- After compatible patches: 25 vulnerable package nodes — 13 high, 12 moderate.
- Unique residual advisories: 11.
- Runtime-mitigated: 4 advisories in the markdown rendering path.
- Build-time/framework-bound: 7 advisories across image parsing, CSS processing,
  and native configuration tooling.

No production deployment, Expo major upgrade, or buyer-access decision is
authorized by this matrix.
