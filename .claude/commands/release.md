You are executing the `/release` command for the **Grindly** project.

Your job is to prepare and publish a new GitHub release — fully automated, end-to-end. Follow the steps below exactly.

---

## Step 1 — Gather current state (run in parallel)

Run all of these simultaneously:
- `git describe --tags --abbrev=0` → last released tag
- `git log --oneline $(git describe --tags --abbrev=0)..HEAD` → commits since last release
- `git status --short` → uncommitted changes
- Read `package.json` → current version

Show the user a compact summary:
```
Current version : X.X.X  (last tag: vX.X.X)
Commits since last release:
  abc1234 feat: ...
  def5678 fix: ...
Uncommitted changes: N files
```

---

## Step 2 — Ask the user two questions (use AskUserQuestion, single call with both questions)

**Question 1 — Version bump type** (header: "Version bump"):
- `patch` — bug fixes, small tweaks (X.X.+1)  ← show as first/recommended only if mostly fixes
- `minor` — new features (X.+1.0)
- `major` — breaking changes (+1.0.0)

**Question 2 — Release notes** (header: "Release notes"):
Pre-fill a suggested draft based on the commit list — group by type:
- **New:** features (feat: commits)
- **Fixed:** fixes (fix: commits)
- **Improved:** refactors, perf, UI (refactor:, perf:, style: commits)
- **Other:** everything else

Present the suggested notes as a markdown preview option so the user can accept or type their own. Keep the draft concise (bullet points, no hype).

---

## Step 3 — Calculate new version

Compute `NEW_VERSION` from current version + bump type:
- patch: increment the third number
- minor: increment the second number, reset third to 0
- major: increment the first number, reset second and third to 0

---

## Step 4 — Write `RELEASE_NOTES.md`

Create/overwrite `RELEASE_NOTES.md` in the project root with this format:

```markdown
## What's new in vNEW_VERSION

NOTES_FROM_USER

---
Released: YYYY-MM-DD
```

Where `YYYY-MM-DD` is today's date from the environment (`date` command or `new Date().toLocaleDateString('sv-SE')`).

---

## Step 5 — Bump version in `package.json`

Edit `package.json`: change the `"version"` field to `NEW_VERSION`.

---

## Step 6 — Commit

Stage all modified tracked files. Check `git status` first — **never stage `.env`, `*.key`, or credential files**.

Commit with message:
```
Release vNEW_VERSION - BRIEF_SUMMARY
```

Where `BRIEF_SUMMARY` is a 3-6 word description of the most important change (derived from the release notes).

Do NOT use `--no-verify`. If hooks fail, fix the issue first.

---

## Step 7 — Tag and push

Run these three commands **sequentially**:
```bash
git tag vNEW_VERSION
git push origin main
git push origin vNEW_VERSION
```

---

## Step 8 — Report result

Tell the user:
```
✓ Released vNEW_VERSION

Tag pushed → GitHub Actions is now building the installer.
When it finishes (~5-10 min), the release will appear at:
https://github.com/[owner]/[repo]/releases/tag/vNEW_VERSION

The build will upload:
  • Grindly-Setup-NEW_VERSION.exe  (installer)
  • latest.yml                      (auto-update manifest)
```

To get the repo URL, run `git remote get-url origin` and format it as a GitHub releases link.

---

## Rules

- If there are **no commits since the last tag** and **no uncommitted changes**, tell the user "Nothing to release — no changes since vX.X.X" and stop.
- Never force-push, never amend published commits.
- If any step fails, show the error clearly and stop — do not continue to the next step.
- Always confirm the final version number with the user before committing (show it as part of the AskUserQuestion step).
