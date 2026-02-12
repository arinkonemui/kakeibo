# CLAUDE.md (Project Instructions)

This repository is a multi-user household finance web app: **おさいふノート**.

You MUST follow these rules every time.

---

## 0. Read these files first (mandatory)
Before making any changes, always read:
- docs/SPEC.md
- docs/RULES.md
- docs/PLAN.md
- docs/DB_SCHEMA.md
- db/schema.sql
- docs/AGENT_LOG.md (append-only log)

If any of these are missing or inconsistent, STOP and fix the docs first.

---

## 1. Source of truth
- Requirements: docs/SPEC.md
- Development constraints & policies: docs/RULES.md
- Roadmap: docs/PLAN.md
- DB design: docs/DB_SCHEMA.md and db/schema.sql (schema.sql is the source of truth)

Do NOT invent or relax requirements.

---

## 2. Non-functional constraints (must)
### 2.1 DB access minimization (critical)
- Monthly view must fetch a **single monthly dataset** (months + entries + daily_budgets + categories).
- No additional DB fetches on tab switch / scrolling / cell selection.
- CSV/PDF export must use already-loaded monthly dataset (no refetch for export).

### 2.2 Caching (critical)
- Cache up to 6 months (LRU).
- TTL: current month 120 minutes, past months 24 hours.
- On app start/login: always fetch current month once to refresh.
- Define "6 months" by **month_key (YYYY-MM) units**, not by day-based subtraction.

### 2.3 Save behavior (critical)
- Save is **diff-based** (create/update/delete), never overwrite full-month dataset.
- If no changes: save should be a no-op (no DB queries).

### 2.4 Editable month range (critical)
- Users can edit up to the most recent 6 months (current month + previous 5 months).
- Determine the range by **month_key (YYYY-MM) units**, not by day-based subtraction.
- Months older than that are read-only (view/export/archive CSV view only).
- Enforce this on both server side (API validation) and client side (UI disabling).

### 2.5 Conflict control (critical)
- Use optimistic locking via `months.version`.
- Save must include `expected_version` and only succeed if it matches the current `months.version` of the **edited month**.
- If version mismatch: reject save and prompt the user to re-fetch latest and re-edit.

---

## 3. UI copy rules (must)
- While viewing imported archive CSV (read-only), show exactly:
  - 「アーカイブ表示のため保存できません」
- Do not expose internal DB terms to end users.

Branding copy is defined in docs/SPEC.md and must be used consistently:
- Title
- Meta description
- Catchphrase
- Color palette policy

---

## 4. Public repo configuration rule
- `wrangler.toml` is NOT committed (ignored).
- `wrangler.toml.example` is committed and must be referenced for setup.
- Do not commit environment-specific IDs/secrets.

---

## 5. Logging (mandatory)
Maintain docs/AGENT_LOG.md as append-only:
Each work unit must append:
- timestamp
- goal
- files changed
- key decisions and why
- how you verified (commands/results)
- next actions / known issues

Never rewrite or delete existing log entries.

---

## 6. DB schema changes
- If schema changes are needed:
  - Update db/schema.sql
  - Update docs/DB_SCHEMA.md accordingly
  - Log rationale in docs/AGENT_LOG.md
- Keep indexes, PK/FK/UNIQUE consistent with the specification.

---

## 7. Output style
- Prefer minimal, reviewable diffs.
- Explain the exact change set and how to verify it.
