import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRoadmap, readyCards, render } from '../plugins/agent-kit/skills/kickoff/templates/project/scripts/roadmap.mjs';

const card = (id, status, deps = 'нет', owner = '—', extra = '') =>
  `### ${id} · Карточка ${id}\n\n- **STATUS:** ${status} · **OWNER:** ${owner} · **DEPS:** ${deps} · **CLAIM:** —\n${extra}- **Результат / scope:** что-то.\n`;
const doc = (...cards) => `# План\n\n## V1\n\n${cards.join('\n')}`;

test('свободны только TODO без владельца с выполненными DEPS, в порядке файла', () => {
  const { cards, errors } = parseRoadmap(
    doc(card('AB-001', 'DONE'), card('AB-003', 'TODO', 'AB-001'), card('AB-002', 'TODO', 'AB-004'), card('AB-004', 'IN_PROGRESS', 'нет', 'claude-1'), card('AB-005', 'TODO', 'AB-001', 'codex-2')),
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(readyCards(cards).map((c) => c.id), ['AB-003']);
  const summary = render(doc(card('AB-001', 'DONE'), card('AB-003', 'TODO', 'AB-001'), card('AB-004', 'IN_PROGRESS', 'нет', 'claude-1', '- **NEXT:** экран входа.\n')));
  assert.match(summary, /AB-004 · Карточка AB-004 · IN_PROGRESS · OWNER: claude-1\n  NEXT: экран входа\./);
  assert.match(summary, /AB-003 · Карточка AB-003 → roadmap AB-003/);
});

test('check ловит неизвестные DEPS, циклы, дубли, неверный статус и BLOCKED без причины', () => {
  const { errors } = parseRoadmap(
    doc(card('AB-001', 'TODO', 'AB-002'), card('AB-002', 'TODO', 'AB-001'), card('AB-003', 'TODO', 'AB-009'), card('AB-003', 'TODO'), card('AB-004', 'BLOCKED'), card('AB-005', 'WIP', 'AB-004–AB-001')),
  );
  const all = errors.join('\n');
  assert.match(all, /цикл DEPS: AB-001 → AB-002 → AB-001/);
  assert.match(all, /неизвестную AB-009/);
  assert.match(all, /AB-003: дублируется/);
  assert.match(all, /STATUS «WIP»/);
  assert.match(all, /AB-004: BLOCKED без BLOCKER/);
  assert.match(all, /AB-005: неверный диапазон DEPS AB-004–AB-001/);
  assert.throws(() => render(doc(card('AB-001', 'TODO', 'AB-002')), ['check']), /неизвестную AB-002/);
});

test('карточка выводится целиком с состоянием DEPS; поле внутри текста не путается с соседним', () => {
  const text = doc(card('AB-001', 'REVIEW'), card('AB-002', 'TODO', 'AB-001', '—', '- **EVIDENCE:** a1b2c3; pnpm test exit 0 · ссылка.\n'));
  const out = render(text, ['AB-002']);
  assert.match(out, /^ROADMAP.md:\d+\n### AB-002/);
  assert.match(out, /DEPS сейчас: AB-001: REVIEW$/);
  assert.equal(parseRoadmap(text).cards.get('AB-002').fields.EVIDENCE, 'a1b2c3; pnpm test exit 0 · ссылка.');
});

test('диапазон DEPS разворачивается в существующие карточки, текст рядом игнорируется', () => {
  const { cards, errors } = parseRoadmap(doc(card('AB-001', 'DONE'), card('AB-002', 'DONE'), card('AB-004', 'TODO'), card('AB-009', 'TODO', 'AB-001–AB-004, все DONE')));
  assert.deepEqual(errors, []);
  assert.deepEqual(cards.get('AB-009').deps, ['AB-001', 'AB-002', 'AB-004']);
});
