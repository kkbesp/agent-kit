---
name: telegram-bots
description: Production Telegram bot engineering with grammY (TypeScript) and the Bot API — handlers, keyboards and callbacks, rich messages and custom emoji, broadcasts within rate limits, webhooks, payments, idempotent update handling, Mini Apps, and checking how a message really renders on a device. Use for any bot code, bot message text or layout, mailing/рассылка, or bot bug. Triggers: бот, телеграм, тг, сообщение бота, кнопки, рассылка, grammY, webhook, Mini App, оплата в боте.
---

# Telegram bots

Bot API changes several times a year (10.3 on 24.08.2026 added rich message buttons, ephemeral messages, streaming drafts). Before using any method, field or limit, check `https://core.telegram.org/bots/api` and `https://grammy.dev` for the current version (skill `source-driven-development`); memory is stale here.

## Project rules come first

Message style is a product decision. Before writing or changing any user-facing bot text, open the project's message rules (brand/message README and the shared helpers it names) and build messages only through the project's existing helpers (heading/card/rich builders, emoji registry). A hand-written string that bypasses the helper is a defect even if it looks similar.

## Architecture that survives production

- Handlers are thin: parse the update → call a domain service → render through the message helpers. No business logic, SQL or pricing inside `bot.on(...)`.
- Every update is processed at most once: store `update_id` or a business idempotency key before side effects; webhooks retry on timeout, and a retried payment or grant must not double-apply.
- Long work never blocks the update: answer fast (`answerCallbackQuery` within seconds, a "working" state or chat action), then continue in a queue/worker and edit the message.
- Conversations and multi-step input use grammY plugins (`@grammyjs/conversations`, sessions with a persistent storage adapter), not ad-hoc global maps.
- Errors: `bot.catch` logs with update id, chat id and handler name; the user sees a short friendly message, never a stack trace or internal id.
- Webhook in production: HTTPS on 443/80/88/8443, `secret_token` checked on every request (`X-Telegram-Bot-Api-Secret-Token`), `drop_pending_updates` only on purpose. One process owns a bot token — two pollers or a poller plus a webhook fight each other.

## Messages and buttons

- Use the API's formatting entities or rich messages, not hand-built markdown: escape user content (`HTML` parse mode needs `&lt;`, `&amp;`, `&gt;`), or use grammY's `fmt` helpers, so names with `<` or `_` cannot break a message.
- Limits that break silently: text 4096 chars, caption 1024, `callback_data` 1–64 bytes (store a short id, look the payload up server-side), inline keyboard rows reasonable for a phone screen. Check current values in the docs before relying on them.
- Every callback handler calls `answerCallbackQuery`; buttons that start an action are idempotent and disable themselves or update the message after the first press.
- Custom emoji in bot messages require the bot owner's Telegram Premium; use the project's registered emoji ids, and fall back intentionally, not by accident.
- Mentions: a plain `@username` is not reliably clickable inside entities/rich text; use an explicit `https://t.me/username` link or a mention entity and verify it after sending.
- Photos: final export within Telegram limits (≤10 MB, width+height ≤ 10000, aspect ratio ≤ 20); text that must stay readable on a phone goes into the message, not into small text on the image.

## Broadcasts

- Free limit ≈30 messages/s overall, ≤1 message/s per chat, ≤20 messages/min per group. Use a queue with rate limiting (`@grammyjs/transformer-throttler` or the project's sender) and honour `retry_after` on 429.
- Handle `403 bot was blocked` by marking the user inactive; never retry it.
- Before a mass send: send the exact message to the owner (or a test chat) first, get explicit approval, store the message id, and keep a resumable cursor so a crash does not resend to everyone.

## Payments and Mini Apps

- Digital goods inside Telegram are subject to Telegram's payment rules (Stars); external acquirers have their own rules. Follow the decision recorded in the project and flag conflicts to the owner instead of quietly choosing.
- Payment handlers verify the provider's signature/webhook, are idempotent by provider payment id, and grant entitlements in one transaction with the payment record.
- Mini App: validate `initData` on the server with the bot token (HMAC) on every request; never trust user id sent from the client.

## Verification

Unit tests prove logic, not appearance. For text and layout changes, send the message to a test chat with the real sender path, read it back from the API response (entities/rich_message), and check it on a phone client or desktop Telegram screenshot (Computer Use is allowed for the native Telegram app). Report what was checked and where.
