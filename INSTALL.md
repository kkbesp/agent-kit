# Установка agent-kit — инструкция для агента

Ты — Claude Code или Codex на компьютере пользователя. Пользователь дал ссылку на этот репозиторий и попросил установить. Выполни шаги по порядку, отвечай на его языке.

## 1. Проверка окружения

```sh
git --version && node --version && python3 --version
command -v claude; command -v codex
```

Нужны git, Node.js 18+ и python3 (для хуков); macOS, Linux или WSL (на Windows — только внутри WSL). Чего-то нет — скажи, как поставить для его ОС (macOS: `brew install node python git`), и продолжи после установки. Ничего не ставь через `sudo` без его согласия.

## 2. Клон

Каталог по умолчанию `~/.agent-kit`. Если он уже есть и это клон agent-kit — `git -C ~/.agent-kit pull --ff-only`; иначе:

```sh
git clone <ссылка на репозиторий> ~/.agent-kit
```

Прочитай `README.md` и `rules/AGENTS.md`, чтобы знать, что ставишь.

## 3. Вопросы пользователю

Задай одним сообщением (инструментом вопросов, если он есть):

1. **Стек** — какие группы скиллов нужны кроме `core` и `frontend` (ставятся всегда): `react`, `vue`, `node`, `python`, `postgres`, `security`. Описание групп — `skills.json`. Если не знает — только группы по умолчанию.
2. **Агенты** — Claude Code, Codex или оба (по умолчанию — те, что найдены в шаге 1).

## 4. Сначала показать, потом ставить

```sh
node ~/.agent-kit/install.mjs --dry-run --groups=core,frontend,<выбранные>
```

Покажи пользователю кратко, какие файлы изменятся. Установщик меняет только блок между `agent-kit:begin/end` в `~/.claude/CLAUDE.md` и `~/.codex/AGENTS.md`, дополняет списки в `~/.claude/settings.json` и `~/.codex/hooks.json`, создаёт ссылки на скиллы и агентов; всё изменённое копирует в `~/.agent-kit-backups/<время>/`. После его «да»:

```sh
node ~/.agent-kit/install.mjs --groups=core,frontend,<выбранные>
```

Добавь `--only=claude` или `--only=codex`, если нужен один агент. Ошибка установки — покажи вывод и причину, не повторяй вслепую.

## 5. Проверка

- Вывод установщика без `✗`; предупреждения `!` перескажи.
- `claude plugin list` содержит `agent-kit@agent-kit`; `ls ~/.agents/skills` содержит `kickoff`, `take`, `lesson` и выбранные скиллы.
- Попроси перезапустить Claude Code / Codex и в новой сессии спросить: «Какие правила agent-kit ты видишь и какие скиллы метода доступны?» — агент должен назвать «Результат и объём» и kickoff/take/lesson.
- Codex: при первом запуске открыть `/hooks` и доверить хукам agent-kit.

## 6. Что сказать в конце

Коротко: что установлено, где бэкап, и как начать:

- новый проект или проект без плана — «запусти kickoff» (`/agent-kit:kickoff` в Claude Code);
- следующая задача по плану — «возьми задачу» (`/agent-kit:take`);
- замечание к работе агента — после исправления «запиши урок» (`/agent-kit:lesson`);
- свои личные правила — в `~/.claude/CLAUDE.md` / `~/.codex/AGENTS.md` **вне** блока agent-kit;
- обновление — `git -C ~/.agent-kit pull && node ~/.agent-kit/install.mjs`; удаление — `node ~/.agent-kit/install.mjs --uninstall`.
