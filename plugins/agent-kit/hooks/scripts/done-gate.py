#!/usr/bin/env python3
"""Stop: не дать объявить «готово» без доказательства. Блокирует не больше одного раза за ход.

Модель уверена в себе независимо от качества результата; владелец жалуется на сданное
без проверки. Хук срабатывает, только если финал заявляет готовность и не называет проверку.
Самопроверка: python3 done-gate.py --self-test
"""
import json, os, re, subprocess, sys, time

CLAIM = re.compile(r"готово|сделал|сделано|исправил|исправлено|идеальн|всё работает|все работает|работает корректно|выполнено|завершил|\bdone\b|\bfixed\b", re.I)
EVIDENCE = re.compile(
    r"провер|exit|код выхода|скриншот|screenshot|тест|test|pass|curl|http \d{3}|\b200\b|сборк|build|lint|"
    r"не провер|без проверки|не удалось|не смог|ограничени|blocked|fail",
    re.I,
)
REASON = (
    "Перед завершением: перечисли пункты исходного запроса владельца и для каждого укажи — сделано и чем проверено "
    "(команда и код выхода, скриншот, ответ сервиса) или не сделано и почему. Если проверку не запускал — запусти "
    "одну прямую проверку сейчас или прямо напиши, что не проверено. Пропущенный пункт доделай. Итоговый ответ дай заново целиком."
)


APOLOGY = re.compile(
    r"мо[яй] (ошибк|косяк|вин)|я ошиб(ся|лась)|\bты прав\b|\bвы правы\b|извин(и|ите|яюсь)\b|прошу прощения|признаю|\bсорри\b|"
    r"\bmy (bad|mistake)\b|you'?re (absolutely )?right|\bI apologi[sz]e|\bsorry\b",
    re.I,
)
APOLOGY_REASON = (
    "Владельца раздражают признания и оправдания («моя ошибка», «ты прав», «извини»): ему нужен исправленный результат. "
    "Если исправление ещё не сделано — сделай и проверь его сейчас. Затем дай итоговый ответ заново целиком без извинений и самооценок: "
    "что исправлено → чем проверено → что осталось. Причину — одной строкой по делу, только если она нужна для защиты от повтора."
)


TOP_LEVEL = re.compile(
    r"^(README|AGENTS|CLAUDE|ROADMAP|CHANGELOG|CONTRIBUTING|SECURITY|LICENSE|NOTICE|COPYING)(\.[a-z]+)?$|"
    r"^(package\.json|pnpm-(lock|workspace)\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|deno\.jsonc?|"
    r"tsconfig(\.[\w-]+)?\.json|pyproject\.toml|uv\.lock|requirements[\w.-]*\.txt|go\.(mod|sum)|Cargo\.(toml|lock)|"
    r"Makefile|Justfile|Dockerfile|Procfile|compose\.ya?ml|docker-compose[\w.-]*\.ya?ml|\.env\.example|"
    r"\.(git|docker|prettier|eslint|npm|editor)[\w.-]*|[\w.-]+\.config\.(js|cjs|mjs|ts|json)|[\w.-]+\.toml)$"
)
JUNK = re.compile(r"(^|/)(tmp|temp|test-?output|debug|scratch|untitled)[^/]*$|\.(log|bak|orig|tmp|swp)$|(^|/)[^/]*(copy|backup|\.old)[^/]*$", re.I)


def fresh_junk(cwd: str, max_age: float = 3 * 3600) -> list:
    """Неотслеживаемые файлы последних часов: в корне репозитория или с именем временного файла."""
    try:
        root = subprocess.run(["git", "-C", cwd, "rev-parse", "--show-toplevel"], capture_output=True, text=True, timeout=5).stdout.strip()
        if not root:
            return []
        out = subprocess.run(["git", "-C", root, "status", "--porcelain", "--untracked-files=all"], capture_output=True, text=True, timeout=10).stdout
    except Exception:
        return []
    now, found = time.time(), []
    for line in out.splitlines():
        if not line.startswith("?? "):
            continue
        rel = line[3:].strip('"')
        try:
            if now - os.path.getmtime(os.path.join(root, rel)) > max_age:
                continue
        except OSError:
            continue
        if JUNK.search(rel) or ("/" not in rel and not TOP_LEVEL.search(rel)):
            found.append(rel)
    return found[:15]


def last_message(data: dict) -> str:
    """Codex и свежий Claude Code передают last_assistant_message; иначе читаем хвост transcript."""
    if data.get("last_assistant_message"):
        return str(data["last_assistant_message"])
    path = data.get("transcript_path")
    if not path or not os.path.exists(path):
        return ""
    try:
        with open(path, encoding="utf-8") as f:
            lines = f.readlines()[-200:]
    except OSError:
        return ""
    for line in reversed(lines):
        try:
            item = json.loads(line)
        except ValueError:
            continue
        if item.get("type") != "assistant":
            continue
        content = (item.get("message") or {}).get("content") or []
        text = " ".join(c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text")
        if text.strip():
            return text
    return ""


def decide(data: dict, junk=None):
    if data.get("stop_hook_active"):
        return None
    reasons = []
    msg = last_message(data)
    if len(msg) >= 6 and CLAIM.search(msg) and not EVIDENCE.search(msg):
        reasons.append(REASON)
    if APOLOGY.search(msg):
        reasons.append(APOLOGY_REASON)
    junk = fresh_junk(str(data.get("cwd") or ".")) if junk is None else junk
    if junk:
        reasons.append(
            "Порядок в проекте: появились неотслеживаемые файлы в корне или с именами временных: " + ", ".join(junk)
            + ". Временное и отладочное удали (или перенеси в игнорируемый каталог артефактов проекта), нужное положи по структуре проекта. Корень репозитория — только для файлов верхнего уровня. Если эти файлы создал не ты в этом ходе — ничего не трогай. Затем повтори свой итоговый ответ владельцу целиком."
        )
    return {"decision": "block", "reason": " ".join(reasons)} if reasons else None


def main() -> int:
    if "--self-test" in sys.argv:
        assert decide({"last_assistant_message": "Готово, всё сделал идеально, обновил компоненты и стили страницы."}, [])
        assert decide({"last_assistant_message": "Проверил: exit 0."}, ["debug.log"])
        assert not JUNK.search("apps/web/public/icons/icon-192.png") and JUNK.search("apps/x/debug-run.log")
        assert TOP_LEVEL.search("ROADMAP.md") and TOP_LEVEL.search("CLAUDE.md") and TOP_LEVEL.search("vite.config.ts") and TOP_LEVEL.search("prek.toml")
        assert not TOP_LEVEL.search("notes.md") and not TOP_LEVEL.search("report-final.md") and not TOP_LEVEL.search("test.py")
        assert not decide({"last_assistant_message": "Готово. Проверил: pnpm build — exit 0, скриншот мобильной ширины."}, [])
        assert not decide({"stop_hook_active": True, "last_assistant_message": "Готово, всё сделал идеально, обновил компоненты."}, [])
        assert decide({"last_assistant_message": "готово, всё сделал идеально"}, [])
        assert not decide({"last_assistant_message": "Где лежит конфиг? В ~/.codex/config.toml, раздел agents."}, [])
        assert decide({"last_assistant_message": "Да, это моя ошибка. Проверил: exit 0."}, [])
        assert decide({"last_assistant_message": "Ты прав, исправил, тест pass."}, [])
        assert not decide({"last_assistant_message": "Исправил отступ кнопки. Проверил: скриншот 390px, exit 0."}, [])
        print("ok")
        return 0
    try:
        data = json.load(sys.stdin)
    except Exception:
        return 0
    if os.environ.get("AGENT_KIT_HOOK_DEBUG"):
        with open(os.environ["AGENT_KIT_HOOK_DEBUG"], "a") as log:
            log.write(json.dumps({"hook": os.path.basename(__file__), "keys": sorted(data)}, ensure_ascii=False) + "\n")
    out = decide(data)
    if out:
        print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
