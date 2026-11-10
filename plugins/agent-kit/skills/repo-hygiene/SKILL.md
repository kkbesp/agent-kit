---
name: repo-hygiene
description: Keep a repository clean and orderly the way a pedantic senior maintainer expects — clear directory hierarchy, no stray files at the root, no duplicate docs or reports, no dead code, unused exports, unused dependencies or leftover legacy copies, consistent naming, formatter and linter clean. Use at the end of every task that created or moved files, when the owner complains about мусор/хлам/грязь/нет иерархии, before a commit, and when cleaning up a project. Triggers: порядок, чистота, мусор, хлам, структура папок, иерархия, мёртвый код, лишние файлы, прибери проект.
---

# Repository hygiene

The owner reads the file tree and the diff like a reviewer. A working feature with three stray reports at the root and a commented-out old version is not done.

## Structure rules

- Put a new file next to its siblings by purpose (feature/module folder), following the layout the project already uses. If no place fits, propose one in the project's existing architecture doc instead of inventing a new top-level folder.
- Repository root holds only top-level files: README, package/workspace manifests, lockfiles, tool configs, license, `AGENTS.md`. Screenshots, logs, scratch scripts, notes and generated reports never live at the root.
- Temporary output goes to the project's ignored artifacts dir (`.artifacts/`, `tmp/` — whichever is already in `.gitignore`) and is deleted at the end unless the owner needs it.
- One source of truth per topic: update the existing plan, ROADMAP or doc instead of adding `PLAN-v2.md`, `REPORT-final.md`, `notes-new.md`. Replaced code is deleted, not kept as `old_`, `_backup`, `v1/` or commented blocks — git keeps history.
- Names: match the project's existing case and wording; one name per concept across files, routes, DB and UI.

## Finding mess with tools (do not eyeball)

Run what fits the stack, from the project root, and fix what is in scope:

| Stack | Command | Finds |
| --- | --- | --- |
| any | `git status --porcelain --untracked-files=all` | new/untracked files you created |
| any | `fd -H -t f -d 1` | files at the root |
| any | `fd -t f -e log -e bak -e orig -e tmp -e swp` | leftover junk |
| TS/JS | `pnpm dlx knip` | unused files, exports, dependencies |
| TS/JS | project `lint`/`typecheck` scripts | style and type debt |
| Python | `uv run --with vulture vulture . --min-confidence 80`, `ruff check --select F401,F841,ERA` | dead code, unused imports, commented-out code |
| Go | `go vet ./...`, `golangci-lint run` (`unused`, `deadcode` checks), `go mod tidy -diff` | unused code and modules |
| shell | `shellcheck` on changed scripts | script bugs |
| docs | `rg -l '<topic>' --type md` | duplicate documents on the same topic |

Run tools at their pinned project versions (`pnpm dlx tool@<version>` when not in the project). A finding outside the task's scope goes to the existing backlog, not into this diff.

## Cleanup without breaking things

- Before deleting, prove it is unused: `rg -n '<name>'` across the repo (code, configs, CI, docs), check dynamic imports and string references, run the build and the relevant tests after removal.
- Moving files: use `git mv`, update every import and reference in the same change, and run the typecheck.
- Never delete files you did not create in this task unless the owner asked for a cleanup; untracked files from the owner or another agent are not yours.
- Big cleanups go in their own change, separated from feature work (skill `code-simplification` for code-level simplification).

## Before you say done

`git status` shows only files that belong to the task, each in its right place; linters and formatters pass on changed files; no TODO without an owner and a reason; no debug prints, test-only flags or hardcoded secrets left behind.
