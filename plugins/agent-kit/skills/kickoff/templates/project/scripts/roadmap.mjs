#!/usr/bin/env node
// Навигатор ROADMAP.md: единственный реестр задач проекта.
//   node scripts/roadmap.mjs          — в работе, блокеры и свободные задачи
//   node scripts/roadmap.mjs list     — все карточки одной строкой
//   node scripts/roadmap.mjs PRJ-002  — одна карточка и состояние её DEPS
//   node scripts/roadmap.mjs check    — проверка формата, ссылок и циклов
// Только читает файл. Без зависимостей, Node 18+.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const STATUSES = ['TODO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED', 'DONE'];
const HEADING = /^### ([A-Z][A-Z0-9]*-\d{3,}) · (.+)$/;
const FIELD = /\*\*([A-Z][A-Z ]*):\*\*\s*(.*?)(?=\s·\s\*\*[A-Z][A-Z ]*:\*\*|$)/g;
const EMPTY = /^(?:—|-|нет|none)?\.?$/i;

export const isEmpty = (value) => EMPTY.test((value ?? '').trim());

const DEP = /([A-Z][A-Z0-9]*)-(\d{3,})(?:\s*(?:–|—|\.\.)\s*([A-Z][A-Z0-9]*)-(\d{3,}))?/g;

// DEPS: «нет», «AB-001, AB-004» или диапазон «AB-001–AB-012» (тире или ..); прочий текст игнорируется.
function expandDeps(value, cards, self, errors) {
  if (isEmpty(value)) return [];
  const deps = [];
  for (const [token, prefix, from, toPrefix, to] of value.matchAll(DEP)) {
    if (!to) {
      deps.push(`${prefix}-${from}`);
      continue;
    }
    if (toPrefix !== prefix || Number(to) < Number(from)) {
      errors.push(`${self}: неверный диапазон DEPS ${token}`);
      continue;
    }
    for (const id of cards.keys()) {
      const [p, n] = id.split('-');
      if (p === prefix && Number(n) >= Number(from) && Number(n) <= Number(to)) deps.push(id);
    }
  }
  if (!deps.length) errors.push(`${self}: DEPS «${value}» без ID; для отсутствия зависимостей пишите «нет»`);
  return [...new Set(deps)];
}

export function parseRoadmap(text) {
  const lines = text.split('\n');
  const cards = new Map();
  const errors = [];
  let current = null;
  lines.forEach((line, index) => {
    const heading = line.match(HEADING);
    if (heading) {
      const [, id, title] = heading;
      current = { id, title, line: index + 1, fields: {}, body: [line] };
      if (cards.has(id)) errors.push(`${id}: дублируется (строка ${index + 1})`);
      else cards.set(id, current);
      return;
    }
    if (/^#{1,3} /.test(line)) {
      current = null;
      return;
    }
    if (!current) return;
    current.body.push(line);
    if (!line.startsWith('- **')) return;
    for (const [, name, value] of line.matchAll(FIELD))
      if (!(name in current.fields)) current.fields[name] = value.trim();
  });

  for (const card of cards.values()) {
    card.body = card.body.join('\n').trimEnd();
    card.status = card.fields.STATUS ?? '';
    card.deps = expandDeps(card.fields.DEPS ?? '', cards, card.id, errors);
    if (!STATUSES.includes(card.status))
      errors.push(`${card.id}: STATUS «${card.status}» не из ${STATUSES.join('/')}`);
    if (!('OWNER' in card.fields)) errors.push(`${card.id}: нет поля OWNER`);
    for (const dep of card.deps)
      if (!cards.has(dep)) errors.push(`${card.id}: DEPS ссылается на неизвестную ${dep}`);
    if (card.status === 'BLOCKED' && isEmpty(card.fields.BLOCKER))
      errors.push(`${card.id}: BLOCKED без BLOCKER`);
  }

  const state = new Map();
  const visit = (id, path) => {
    if (state.get(id) === 'done' || !cards.has(id)) return;
    if (state.get(id) === 'open') {
      errors.push(`цикл DEPS: ${[...path.slice(path.indexOf(id)), id].join(' → ')}`);
      return;
    }
    state.set(id, 'open');
    for (const dep of cards.get(id).deps) visit(dep, [...path, id]);
    state.set(id, 'done');
  };
  for (const id of cards.keys()) visit(id, []);

  if (!cards.size) errors.push('нет карточек вида «### PRJ-001 · Название»');
  return { cards, errors };
}

const line = (card) =>
  `${card.id} · ${card.title} · ${card.status} · OWNER: ${card.fields.OWNER} · DEPS: ${card.deps.join(', ') || 'нет'}`;

export function readyCards(cards) {
  return [...cards.values()].filter(
    (card) =>
      card.status === 'TODO' &&
      isEmpty(card.fields.OWNER) &&
      isEmpty(card.fields.CLAIM) &&
      isEmpty(card.fields.BLOCKER) &&
      card.deps.every((dep) => cards.get(dep)?.status === 'DONE'),
  );
}

export function render(text, args = []) {
  const { cards, errors } = parseRoadmap(text);
  const [command, extra] = args;
  if (extra) throw new Error('Использование: roadmap [list | check | PRJ-001]');
  if (command === 'check') {
    if (errors.length) throw new Error(errors.join('\n'));
    return `ROADMAP.md: ${cards.size} карточек, формат и DEPS в порядке.`;
  }
  if (errors.length) throw new Error(`ROADMAP.md с ошибками:\n${errors.join('\n')}`);
  if (command === 'list') return [...cards.values()].map(line).join('\n');
  if (command) {
    const card = cards.get(command);
    if (!card) throw new Error(`Нет карточки ${command}. Все карточки: roadmap list`);
    const deps = card.deps.map((id) => `${id}: ${cards.get(id).status}`).join(', ') || 'нет';
    return `ROADMAP.md:${card.line}\n${card.body}\n\nDEPS сейчас: ${deps}`;
  }

  const active = [...cards.values()].filter(
    (card) =>
      ['IN_PROGRESS', 'REVIEW', 'BLOCKED'].includes(card.status) ||
      (card.status === 'TODO' && (!isEmpty(card.fields.OWNER) || !isEmpty(card.fields.BLOCKER))),
  );
  const out = ['В работе / на проверке / заблокировано:'];
  for (const card of active) {
    out.push(`${card.id} · ${card.title} · ${card.status} · OWNER: ${card.fields.OWNER}`);
    out.push(`  NEXT: ${card.fields.NEXT || 'не указан'}; BLOCKER: ${card.fields.BLOCKER || 'не указан'}`);
  }
  if (!active.length) out.push('нет');
  out.push('', 'Свободные TODO с выполненными DEPS (по приоритету, до 5):');
  const ready = readyCards(cards).slice(0, 5);
  for (const card of ready) out.push(`${card.id} · ${card.title} → roadmap ${card.id}`);
  if (!ready.length) out.push('нет');
  const done = [...cards.values()].filter((card) => card.status === 'DONE').length;
  out.push('', `Готово ${done} из ${cards.size}. Сводка не резервирует задачу: OWNER/CLAIM пишет интегратор.`);
  return out.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const text = await readFile(new URL('../ROADMAP.md', import.meta.url), 'utf8');
    console.log(render(text, process.argv.slice(2)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
