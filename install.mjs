#!/usr/bin/env node
// Установщик agent-kit для Claude Code и Codex. Идемпотентный: повторный запуск обновляет.
// Меняет только помеченные блоки и собственные ссылки; всё прочее сохраняет, перед правкой делает бэкап.
//
//   node install.mjs                       — Claude Code и Codex, скиллы групп по умолчанию
//   node install.mjs --groups=core,frontend,react,postgres
//   node install.mjs --only=claude | --only=codex
//   node install.mjs --no-skills           — без сторонних скиллов
//   node install.mjs --dry-run             — только показать действия
//   node install.mjs --uninstall           — убрать блоки, ссылки и плагин (сторонние скиллы остаются)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = path.dirname(fileURLToPath(import.meta.url));
const FLAGS = ['home', 'dry-run', 'uninstall', 'only', 'groups', 'no-skills'];
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const body = a.replace(/^--/, '');
    const eq = body.indexOf('=');
    const [k, v] = eq === -1 ? [body, true] : [body.slice(0, eq), body.slice(eq + 1)];
    if (!a.startsWith('--') || !FLAGS.includes(k)) {
      console.error(`✗ Неизвестный аргумент ${a}. Доступны: ${FLAGS.map((f) => `--${f}`).join(' ')}`);
      process.exit(2);
    }
    return [k, v];
  }),
);
if (args.home === true || args.home === '') {
  console.error('✗ --home требует путь: --home=/путь');
  process.exit(2);
}
const HOME = args.home ? path.resolve(args.home) : os.homedir();
const DRY = Boolean(args['dry-run']);
const UNINSTALL = Boolean(args.uninstall);
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const BACKUP = path.join(HOME, '.agent-kit-backups', STAMP);
const BEGIN = '<!-- agent-kit:begin — управляется install.mjs, правки внутри блока будут перезаписаны -->';
const END = '<!-- agent-kit:end -->';
const env = { ...process.env, HOME };
const report = [];

const log = (msg) => console.log(msg);
const done = (msg) => report.push(`✓ ${msg}`);
const warn = (msg) => report.push(`! ${msg}`);
const has = (bin) => spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { env }).status === 0;
const exists = (p) => fs.existsSync(p);

function run(cmd, cmdArgs, { allowFail = false } = {}) {
  log(`$ ${cmd} ${cmdArgs.join(' ')}`);
  if (DRY) return { status: 0, stdout: '', stderr: '' };
  const r = spawnSync(cmd, cmdArgs, { env, encoding: 'utf8' });
  if (r.status !== 0 && !allowFail) throw new Error(`${cmd} ${cmdArgs.join(' ')} → exit ${r.status}\n${r.stderr || r.stdout}`);
  return r;
}

function backup(file) {
  if (!exists(file) || DRY) return;
  const target = path.join(BACKUP, path.relative(HOME, file));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(file, target);
}

function write(file, content) {
  const before = exists(file) ? fs.readFileSync(file, 'utf8') : null;
  if (before === content) return false;
  log(`${DRY ? '[dry] ' : ''}запись ${file}`);
  if (DRY) return true;
  backup(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
}

export function upsertBlock(text, body) {
  const begins = text.split(BEGIN.slice(0, 20)).length - 1;
  const ends = text.split(END).length - 1;
  if (begins !== ends || begins > 1)
    throw new Error('блок agent-kit повреждён (begin/end не парные) — исправь файл вручную и запусти снова');
  const re = new RegExp(`${escape(BEGIN.slice(0, 20))}[\\s\\S]*?${escape(END)}\\n*`);
  const stripped = text.replace(re, '');
  if (body === null) return stripped;
  const block = `${BEGIN}\n${body.trim()}\n${END}\n`;
  return stripped.trim() ? `${block}\n${stripped.replace(/^\n+/, '')}` : block;
}
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function managedFile(file, body) {
  const text = exists(file) ? fs.readFileSync(file, 'utf8') : '';
  let next;
  try {
    next = upsertBlock(text, body);
  } catch (error) {
    throw new Error(`${file}: ${error.message}`);
  }
  if (body === null && exists(file) && !next.trim() && text !== next) {
    log(`${DRY ? '[dry] ' : ''}удаление пустого ${file}`);
    if (!DRY) {
      backup(file);
      fs.unlinkSync(file);
    }
    return true;
  }
  return write(file, next);
}

const ours = (target) => target === KIT || target.startsWith(KIT + path.sep);

// Включает [features] hooks = true. Неоднозначный конфиг не трогает: возвращает null.
export function enableCodexHooks(config) {
  const lines = config.split('\n');
  const headers = lines.map((l, i) => [l, i]).filter(([l]) => /^\s*\[features\]\s*(#.*)?$/.test(l));
  if (headers.length > 1) return null;
  if (!headers.length) return `${config.trimEnd()}${config.trim() ? '\n\n' : ''}[features]\nhooks = true\n`;
  const start = headers[0][1];
  let end = lines.findIndex((l, i) => i > start && /^\s*\[/.test(l));
  if (end === -1) end = lines.length;
  const key = lines.slice(start + 1, end).find((l) => /^\s*hooks\s*=/.test(l));
  if (key) return /^\s*hooks\s*=\s*true\s*(#.*)?$/.test(key) ? config : null;
  lines.splice(start + 1, 0, 'hooks = true');
  return lines.join('\n');
}

function link(source, target) {
  let current = null;
  try {
    current = fs.readlinkSync(target);
  } catch {
    if (exists(target) && !UNINSTALL) {
      warn(`${target} уже существует и не является ссылкой agent-kit — не тронут`);
      return;
    }
  }
  if (UNINSTALL) {
    if (current && ours(current)) {
      log(`${DRY ? '[dry] ' : ''}удаление ссылки ${target}`);
      if (!DRY) fs.unlinkSync(target);
    }
    return;
  }
  if (current === source) return;
  if (current && !ours(current)) {
    warn(`${target} указывает на ${current} — не тронут`);
    return;
  }
  log(`${DRY ? '[dry] ' : ''}ссылка ${target} → ${source}`);
  if (DRY) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (current) fs.unlinkSync(target);
  fs.symlinkSync(source, target);
}

export function mergeSettings(user, kit) {
  const out = structuredClone(user);
  for (const [key, value] of Object.entries(kit)) {
    if (key.startsWith('$')) continue;
    if (Array.isArray(value)) out[key] = [...new Set([...(out[key] ?? []), ...value])];
    else if (value && typeof value === 'object') out[key] = mergeSettings(out[key] ?? {}, value);
    else if (!(key in out)) out[key] = value;
  }
  return out;
}

export function mergeHooks(user, kit, uninstall = false) {
  const out = structuredClone(user ?? {});
  out.hooks ??= {};
  for (const event of Object.keys(out.hooks)) {
    out.hooks[event] = out.hooks[event]
      .map((group) => ({ ...group, hooks: (group.hooks ?? []).filter((h) => !String(h.command).includes('agent-kit')) }))
      .filter((group) => group.hooks.length);
    if (!out.hooks[event].length) delete out.hooks[event];
  }
  if (uninstall) return out;
  for (const [event, groups] of Object.entries(kit.hooks)) out.hooks[event] = [...(out.hooks[event] ?? []), ...groups];
  return out;
}

const readJson = (file, fallback = {}) => (exists(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

// ---------- Claude Code ----------
function installClaude() {
  const dir = path.join(HOME, '.claude');
  const rules = path.join(KIT, 'rules', 'AGENTS.md');
  if (managedFile(path.join(dir, 'CLAUDE.md'), UNINSTALL ? null : `@${rules}`))
    done(`~/.claude/CLAUDE.md: ${UNINSTALL ? 'блок удалён' : 'импорт общих правил'}`);

  const settingsFile = path.join(dir, 'settings.json');
  if (!UNINSTALL) {
    const merged = mergeSettings(readJson(settingsFile), readJson(path.join(KIT, 'settings', 'claude.json')));
    if (write(settingsFile, json(merged))) done('~/.claude/settings.json: запреты чтения секретов и подтверждение опасных команд');
  }

  if (!has('claude')) {
    warn('claude CLI не найден — плагин не установлен; после установки Claude Code запусти установщик снова');
    return;
  }
  if (UNINSTALL) {
    run('claude', ['plugin', 'uninstall', 'agent-kit@agent-kit', '--scope', 'user'], { allowFail: true });
    run('claude', ['plugin', 'marketplace', 'remove', 'agent-kit'], { allowFail: true });
    done('Claude: плагин agent-kit удалён');
    return;
  }
  const added = run('claude', ['plugin', 'marketplace', 'add', KIT, '--scope', 'user'], { allowFail: true });
  if (added.status !== 0) run('claude', ['plugin', 'marketplace', 'update', 'agent-kit'], { allowFail: true });
  const installed = run('claude', ['plugin', 'install', 'agent-kit@agent-kit', '--scope', 'user'], { allowFail: true });
  if (installed.status !== 0) run('claude', ['plugin', 'update', 'agent-kit@agent-kit', '--scope', 'user']);
  done('Claude: плагин agent-kit (kickoff, take, lesson, агенты, хуки)');
}

// ---------- Codex ----------
function installCodex() {
  const dir = path.join(HOME, '.codex');
  const rules = fs.readFileSync(path.join(KIT, 'rules', 'AGENTS.md'), 'utf8');
  if (managedFile(path.join(dir, 'AGENTS.md'), UNINSTALL ? null : rules))
    done(`~/.codex/AGENTS.md: ${UNINSTALL ? 'блок удалён' : 'общие правила'}`);

  const skillsDir = path.join(KIT, 'plugins', 'agent-kit', 'skills');
  for (const name of fs.readdirSync(skillsDir)) link(path.join(skillsDir, name), path.join(HOME, '.agents', 'skills', name));
  const agentsDir = path.join(KIT, 'codex', 'agents');
  for (const name of fs.readdirSync(agentsDir)) link(path.join(agentsDir, name), path.join(dir, 'agents', name));
  done(`Codex: скиллы agent-kit в ~/.agents/skills, агенты в ~/.codex/agents${UNINSTALL ? ' — удалены' : ''}`);

  const scripts = path.join(KIT, 'plugins', 'agent-kit', 'hooks', 'scripts');
  const kitHooks = {
    hooks: {
      UserPromptSubmit: [{ hooks: [{ type: 'command', command: `python3 -B '${scripts}/owner-feedback.py'`, timeout: 10 }] }],
      Stop: [{ hooks: [{ type: 'command', command: `python3 -B '${scripts}/done-gate.py'`, timeout: 15 }] }],
    },
  };
  const hooksFile = path.join(dir, 'hooks.json');
  if (write(hooksFile, json(mergeHooks(readJson(hooksFile), kitHooks, UNINSTALL))))
    done(`Codex: хуки ~/.codex/hooks.json${UNINSTALL ? ' удалены' : ''}`);

  if (UNINSTALL) return;
  const configFile = path.join(dir, 'config.toml');
  const config = exists(configFile) ? fs.readFileSync(configFile, 'utf8') : '';
  const next = enableCodexHooks(config);
  if (next === null) warn('Codex: ~/.codex/config.toml — не удалось однозначно включить хуки; добавь в секцию [features] строку hooks = true вручную');
  else if (write(configFile, next)) done('Codex: включены хуки ([features] hooks = true)');
  warn('Codex: при первом запуске проверь доверие к хукам agent-kit (/hooks) — без него они не работают');
}

// ---------- Сторонние скиллы ----------
function installSkills(agents) {
  if (args['no-skills'] || UNINSTALL || !agents.length) return;
  const manifest = readJson(path.join(KIT, 'skills.json'));
  const wanted = typeof args.groups === 'string' ? args.groups.split(',') : Object.keys(manifest.groups).filter((g) => manifest.groups[g].default);
  const unknown = wanted.filter((g) => !manifest.groups[g]);
  if (unknown.length) throw new Error(`Неизвестные группы: ${unknown.join(', ')}. Есть: ${Object.keys(manifest.groups).join(', ')}`);
  const bySource = {};
  for (const g of wanted)
    for (const [repo, names] of Object.entries(manifest.groups[g].sources)) {
      bySource[repo] ??= new Set();
      for (const name of names) bySource[repo].add(name);
    }
  for (const [repo, names] of Object.entries(bySource)) {
    const r = run('npx', ['-y', manifest.cli, 'add', repo, '-g', '-y', '-a', ...agents, '-s', ...names], { allowFail: true });
    if (r.status === 0) done(`скиллы ${repo}: ${[...names].join(', ')}`);
    else warn(`скиллы ${repo} не установлены (exit ${r.status}): ${(r.stderr || r.stdout).trim().split('\n').slice(-3).join(' ')}`);
  }
}

function main() {
  if (process.platform === 'win32') throw new Error('Windows не поддерживается напрямую — запусти установщик в WSL');
  if (/\s/.test(KIT)) throw new Error(`путь к agent-kit содержит пробел (${KIT}) — склонируй в ~/.agent-kit`);
  const only = args.only;
  const doClaude = only ? only === 'claude' : true;
  const doCodex = only ? only === 'codex' : has('codex') || exists(path.join(HOME, '.codex'));
  if (!['claude', 'codex', undefined].includes(only)) throw new Error('--only=claude или --only=codex');
  log(`agent-kit: ${KIT}\nHOME: ${HOME}${DRY ? '\nрежим: dry-run' : ''}\n`);
  if (doClaude) installClaude();
  if (doCodex) installCodex();
  installSkills([doClaude && 'claude-code', doCodex && 'codex'].filter(Boolean));
  log(`\n${report.join('\n') || 'изменений нет'}`);
  if (!DRY && exists(BACKUP)) log(`\nБэкап изменённых файлов: ${BACKUP}`);
  if (UNINSTALL && doClaude) log('\nВ ~/.claude/settings.json остались добавленные правила permissions и attribution — убери вручную, если не нужны (бэкап до установки — в ~/.agent-kit-backups).');
  if (!UNINSTALL) log('\nПерезапусти Claude Code / Codex. Проверка: в новой сессии спроси «какие правила agent-kit ты видишь?» и набери /agent-kit:kickoff');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error(`\n✗ ${error.message}`);
    process.exitCode = 1;
  }
}
