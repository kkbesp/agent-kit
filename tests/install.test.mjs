import assert from 'node:assert/strict';
import test from 'node:test';
import { enableCodexHooks, mergeHooks, mergeSettings, upsertBlock } from '../install.mjs';

test('блок правил добавляется, обновляется и удаляется, личный текст сохраняется', () => {
  const personal = '# Мои правила\n\nОтвечай кратко.\n';
  const once = upsertBlock(personal, '@/kit/rules/AGENTS.md');
  assert.match(once, /^<!-- agent-kit:begin[^\n]*\n@\/kit\/rules\/AGENTS.md\n<!-- agent-kit:end -->\n\n# Мои правила/);
  const twice = upsertBlock(once, '@/other/AGENTS.md');
  assert.equal(twice.match(/agent-kit:begin/g).length, 1);
  assert.match(twice, /@\/other\/AGENTS.md/);
  assert.ok(twice.endsWith(personal));
  assert.equal(upsertBlock(twice, null), personal);
  assert.equal(upsertBlock('', 'x'), upsertBlock(upsertBlock('', 'x'), 'x'));
});

test('настройки: списки объединяются, значения пользователя не перезаписываются', () => {
  const user = { model: 'opus', attribution: { commit: 'mine' }, permissions: { ask: ['Bash(rm:*)'] } };
  const kit = { $comment: 'x', attribution: { commit: '', pr: '' }, permissions: { ask: ['Bash(rm:*)', 'Bash(dd:*)'], deny: ['Read(.env)'] } };
  const merged = mergeSettings(user, kit);
  assert.deepEqual(merged, {
    model: 'opus',
    attribution: { commit: 'mine', pr: '' },
    permissions: { ask: ['Bash(rm:*)', 'Bash(dd:*)'], deny: ['Read(.env)'] },
  });
  assert.deepEqual(mergeSettings(merged, kit), merged);
});

test('хуки Codex: повторная установка не дублирует, чужие хуки сохраняются, uninstall убирает только свои', () => {
  const user = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'notify.sh' }] }] } };
  const kit = { hooks: { Stop: [{ hooks: [{ type: 'command', command: "python3 '/x/agent-kit/done-gate.py'" }] }] } };
  const once = mergeHooks(user, kit);
  const twice = mergeHooks(once, kit);
  assert.deepEqual(twice, once);
  assert.equal(once.hooks.Stop.length, 2);
  assert.deepEqual(mergeHooks(twice, kit, true), user);
});

test('повреждённый блок (begin без end) не дублируется, а останавливает установку', () => {
  const broken = upsertBlock('', 'x').replace('<!-- agent-kit:end -->', '');
  assert.throws(() => upsertBlock(broken, 'y'), /повреждён/);
});

test('config.toml Codex: хуки включаются, неоднозначный конфиг не трогается', () => {
  assert.equal(enableCodexHooks(''), '[features]\nhooks = true\n');
  assert.equal(enableCodexHooks('model = "x"\n'), 'model = "x"\n\n[features]\nhooks = true\n');
  assert.equal(enableCodexHooks('[features]  # флаги\nfoo = 1\n\n[tui]\nx = 1\n'), '[features]  # флаги\nhooks = true\nfoo = 1\n\n[tui]\nx = 1\n');
  const on = '[features]\nhooks = true\n';
  assert.equal(enableCodexHooks(on), on);
  assert.equal(enableCodexHooks('[features]\nhooks = false\n'), null);
  assert.equal(enableCodexHooks('[features]\na=1\n[features]\nb=2\n'), null);
  assert.equal(enableCodexHooks('[tui]\nhooks = true\n'), '[tui]\nhooks = true\n\n[features]\nhooks = true\n');
});
