# agent-kit

Настройка Claude Code и Codex для продуктивной разработки с агентами: общие правила работы, агенты по уровню риска, хуки качества, подобранные скиллы и **метод ведения проекта**. По этому методу любой агент берёт задачу с холодного старта, не перечитывая переписку.

## Установка

Открой Claude Code или Codex и напиши:

> Установи agent-kit по инструкции https://github.com/kkbesp/agent-kit/blob/main/INSTALL.md

Агент склонирует репозиторий в `~/.agent-kit`, спросит твой стек, покажет изменения и поставит их после подтверждения. Вручную:

```sh
git clone https://github.com/kkbesp/agent-kit ~/.agent-kit
node ~/.agent-kit/install.mjs --dry-run       # что изменится
node ~/.agent-kit/install.mjs --groups=core,frontend,react,node,postgres
```

Только Claude Code (плагин без правил и Codex): `/plugin marketplace add kkbesp/agent-kit`, затем `/plugin install agent-kit@agent-kit`.

Нужны git, Node.js 18+, python3; macOS, Linux или WSL. Обновление: `git -C ~/.agent-kit pull && node ~/.agent-kit/install.mjs`. Удаление: `node ~/.agent-kit/install.mjs --uninstall` (сторонние скиллы и добавленные правила в `~/.claude/settings.json` остаются — бэкап до установки в `~/.agent-kit-backups`).

## Метод: от идеи до задачи, которую агент делает сам

Обычный путь с агентом — длинная переписка: отдельный промпт на план, отдельный на исследование стека, отдельный на нарезку задач. Через неделю контекст потерян, агент выбирает стек заново, делает слой вместо функции, сдаёт без проверки и повторяет те же ошибки. Метод заменяет это тремя скиллами.

| Скилл | Когда | Что даёт |
| ----- | ----- | -------- |
| `kickoff` | новый проект, переписывание, репозиторий без плана | интервью → `decisions.md` и `lessons.md` → стек по актуальным версиям в `solutions.md` → `architecture.md` → `ROADMAP.md` из карточек → `AGENTS.md` проекта и навигатор |
| `take` | следующая задача, «продолжи» | навигатор → одна карточка → CLAIM → видимый срез → проверка → коммит → EVIDENCE/NEXT в той же карточке |
| `lesson` | замечание к работе агента | строка «что нельзя → как правильно → чем проверить» в «Частых ошибках»; повтор закрепляется проверкой |

В Claude Code: `/agent-kit:kickoff`, `/agent-kit:take`, `/agent-kit:lesson`. В Codex — по названию или естественной фразой («запусти kickoff»).

Ключевые идеи:

- **Карточка = пользовательский результат**, а не слой. Первая карточка: одна команда поднимает систему, пользователь видит первый результат.
- **ROADMAP — единственный реестр.** Статус, владелец, следующий шаг и доказательства живут в карточке. `node scripts/roadmap.mjs` показывает, что в работе и что свободно; весь план агент не читает.
- **Решения записаны один раз.** Стек выбирается по registry и документации текущей версии, причина фиксируется, повторно не исследуется.
- **Готово = проверено.** Приёмка локальная и реалистичная, UI просмотрен на mobile и desktop, существенный diff проверил независимый `verifier`.
- **Ошибка не повторяется.** Каждое замечание становится строкой с проверкой в `AGENTS.md` проекта.

Метод выработан на реальном продукте: десятки карточек, несколько агентов параллельно, без отдельных планов и отчётов.

## Что устанавливается

| Компонент | Claude Code | Codex |
| --------- | ----------- | ----- |
| Общие правила [`rules/AGENTS.md`](rules/AGENTS.md) | `@`-импорт в `~/.claude/CLAUDE.md` | блок в `~/.codex/AGENTS.md` |
| Скиллы метода и эксплуатации: kickoff, take, lesson, ui-qa, repo-hygiene, terminal-ops, server-ops, telegram-bots | плагин `agent-kit` | ссылки в `~/.agents/skills` |
| Агенты `quick` / `build` / `deep` / `verifier` | плагин | `~/.codex/agents/*.toml` (модель — из твоего конфига) |
| Хуки: замечание → разбор вместо извинений; «готово» без проверки или мусор в корне → доработка | плагин | `~/.codex/hooks.json` |
| Защита: запрет чтения ключей и `.env`, подтверждение `reset --hard`, `push --force`, `terraform destroy` и т. п. | `~/.claude/settings.json` | — |
| Сторонние скиллы по группам из [`skills.json`](skills.json) | `npx skills` → `~/.claude/skills` | `npx skills` → `~/.agents/skills` |

Сторонние скиллы ставятся из исходных репозиториев (addyosmani, obra/superpowers, anthropics, vercel-labs, vuejs-ai, supabase, trailofbits, wshobson) и обновляются их авторами; в этом репозитории их копий нет.

## Своё поверх общего

- Личные правила (язык, тон, свои сервисы) — в `~/.claude/CLAUDE.md` и `~/.codex/AGENTS.md` **вне** блока `agent-kit:begin/end`. Установщик их не трогает.
- Правила проекта — в его `AGENTS.md`; они важнее общих.
- Свои скиллы — `npx skills init <name>` в `~/.agents/skills`.

## Разработка

```sh
node --test tests/*.test.mjs
claude plugin validate .
python3 plugins/agent-kit/hooks/scripts/done-gate.py --self-test
python3 plugins/agent-kit/hooks/scripts/owner-feedback.py --self-test
```

Правила для агентов, которые меняют этот репозиторий, — [AGENTS.md](AGENTS.md).
