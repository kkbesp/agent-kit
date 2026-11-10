---
name: terminal-ops
description: Professional shell work on macOS (zsh, BSD userland) and Linux (bash, GNU). Use before any non-trivial terminal work — long-running or background commands, dev servers, waiting on processes or CI, multi-line scripts and heredocs, quoting, Python one-offs that need packages, SSH, pagers and interactive prompts, macOS-vs-Linux command differences. Triggers: терминал, zsh, bash, команда зависла, долго ждёт, процесс, dev-сервер, скрипт, heredoc, ssh.
---

# Terminal operations

Agents on macOS run commands in zsh with BSD tools; servers run bash with GNU tools. Most lost time comes from waiting wrongly, not from wrong commands: in a review of real agent logs, thousands of waits ended in timeouts, Python one-offs failed on missing modules, and SSH was retried blindly after the same error.

## Long-running work

- A command that may take more than ~25 s: run it in the background mode of your shell tool (Claude Code: `run_in_background`; Codex: `exec_command` with `yield_time_ms: 30000`, then poll the returned `session_id` with `write_stdin`). Wait for its completion by ID, not with `sleep` loops. Never start the same command again while the first one is alive.
- A process that must keep running (dev server, watcher, tunnel, log tail): start it detached with a name and a log file, then poll the log:
  ```sh
  tmux new-session -d -s app-dev -c "$PWD" 'pnpm dev 2>&1 | tee .artifacts/dev.log'
  until curl -fsS -o /dev/null http://127.0.0.1:5173; do sleep 1; done   # bounded by yield
  ```
  Reuse an existing session (`tmux has-session -t app-dev`), and kill only sessions you started.
- Wait for a condition, not for time: `until <check>; do sleep 1; done` inside one call, or the tool's own wait (`gh run watch <id> --exit-status`, `docker compose up --wait`, `pg_isready`). Do not loop `sleep 30; check` across tool calls.
- Before blaming the code, check the port: `lsof -nP -iTCP:<port> -sTCP:LISTEN`.

## Writing commands that work the first time

- Multi-line scripts go through a quoted heredoc, so the shell does not expand anything inside: `python3 - <<'PY' … PY`, `cat > file <<'EOF' … EOF`. Unquoted `<<EOF` only when you want expansion.
- Quote every variable and path: `"$file"`. Paths often contain spaces (`/Applications/Google Chrome.app`).
- zsh errors on a glob with no matches (`zsh: no matches found`); it does not mean the file is absent. Quote globs passed to tools (`fd '*.ts'`, `rg -g '*.md'`), or use `fd`/`rg --files` instead of shell globs.
- Scripts start with `set -euo pipefail`; check the exit code of the step that matters and report it. Run `shellcheck` on any script you save.
- Non-interactive always: `GIT_PAGER=cat`, `git --no-pager`, `PAGER=cat`, `--yes`/`-y` only where it is safe, `DEBIAN_FRONTEND=noninteractive`, `ssh -o BatchMode=yes`. A command that may prompt for a password or confirmation is a stop: tell the owner, do not wait on it.
- Limit output before reading it: `| head -50`, `rg -c`, `wc -l`, `--json | jq '<field>'`. Never print a whole log or a lockfile.

## Python, Node, Go one-offs

- Python with packages: `uv run --with requests --with rich python - <<'PY' … PY`, never bare `python3` + `import requests`, never `pip install` into the system. Project code: `uv run …` inside the project.
- Node one-off: `node --input-type=module -e '…'`; project tools: `pnpm exec <tool>` or `pnpm dlx <tool>@<version>`.
- Go: `go run ./cmd/x`, `go test ./... -run Name -count=1`.

## macOS (BSD) vs Linux (GNU)

| Task | macOS | Linux server |
| --- | --- | --- |
| in-place edit | `sed -i '' 's/a/b/' f` (better: `sd a b f` or apply_patch) | `sed -i 's/a/b/' f` |
| file mtime | `stat -f %m f` | `stat -c %Y f` |
| date math | `date -v-1d +%F` | `date -d yesterday +%F` |
| real path | `realpath f` | `readlink -f f` |
| PCRE grep | `rg -P` | `grep -P` |
| ports | `lsof -nP -iTCP -sTCP:LISTEN` | `ss -ltnp` |
| services | `brew services`, `launchctl` | `systemctl`, `journalctl -u` |
| open file/app | `open path` | — |

When a script must run on both, write POSIX or detect with `uname`.

## SSH

- `ssh -o BatchMode=yes -o ConnectTimeout=10 host 'command'`. Quote the remote command once, in single quotes; for anything longer than one line send a heredoc: `ssh host 'bash -s' <<'EOF' … EOF`.
- The same SSH error twice (key, `kex_exchange_identification`, timeout) means stop and report it with the exact error. Retrying does not help, and repeated attempts trigger fail2ban.
- Server work beyond a single command → skill `server-ops`.

## Reporting

Say which command ran, its exit code and the relevant line of output. "Should work" without a run is not a result.
