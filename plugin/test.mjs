// Self-check: runs server.mjs against a fake Telegram Bot API. `npm test`
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { createServer } from 'node:http'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, statSync, symlinkSync, mkdirSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join, delimiter } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const WIN = process.platform === 'win32' // no POSIX modes; symlinks need admin

const CHAT = -1001
const ME = { id: 10, is_bot: true, username: 'alice_bot', first_name: 'Alice', can_read_all_group_messages: true }
const BOB = { id: 20, is_bot: true, username: 'bob_bot', first_name: 'Bob' }
const queue = [], calls = []
let nextId = 1000
const msg = (from, text, extra = {}) => ({ message: { message_id: queue.length + 100, date: 1, chat: { id: CHAT }, from, text, ...extra } })

const tg = createServer(async (req, res) => {
  const ok = result => res.end(JSON.stringify({ ok: true, result }))
  if (req.url.startsWith('/file/')) return res.end('FILEBYTES')
  const method = req.url.split('/').pop()
  let raw = ''; for await (const c of req) raw += c
  const body = req.headers['content-type']?.includes('json') ? JSON.parse(raw) : raw
  calls.push({ method, body })
  if (method === 'getMe') return ok(ME)
  if (method === 'getUpdates') {
    await new Promise(r => setTimeout(r, 50))
    return ok(queue.splice(0).map((u, i) => ({ update_id: body.offset + i, ...u })))
  }
  if (method === 'sendMessage' && body.text.includes('FAIL')) return res.end(JSON.stringify({ ok: false, description: 'Bad Request: boom' }))
  if (method === 'sendMessage' || method === 'sendDocument') return ok({ message_id: nextId++ })
  if (method === 'getChat' && body.chat_id === -555) return res.end(JSON.stringify({ ok: false, error_code: 400, description: 'Bad Request: group chat was upgraded to a supergroup chat', parameters: { migrate_to_chat_id: CHAT } }))
  if (method === 'getChat') return ok({ id: CHAT, type: 'supergroup', title: 'Team', is_forum: true })
  if (method === 'getChatMember') return ok({ status: 'administrator', user: ME })
  if (method === 'getFile') return ok({ file_path: 'documents/plan.md' })
  // Real API omits other bots unless return_bots is set.
  if (method === 'getChatAdministrators') return ok(body.return_bots ? [{ user: ME }, { user: BOB }] : [{ user: ME }])
  res.end(JSON.stringify({ ok: false, description: 'unknown ' + method }))
}).listen(0)
await new Promise(r => tg.once('listening', r))

// --- setup.mjs: token -> .env, launcher next to `claude`, group auto-detected from "bot added" update
{
  const sstate = mkdtempSync(join(tmpdir(), 'agents-channel-setup-'))
  const bin = join(sstate, 'bin'); mkdirSync(bin)
  writeFileSync(join(bin, WIN ? 'claude.exe' : 'claude'), '')
  queue.push({ my_chat_member: { chat: { id: CHAT, type: 'supergroup', title: 'Team' }, new_chat_member: { status: 'administrator', user: ME } } })
  const run = args => promisify(execFile)(process.execPath, [fileURLToPath(new URL('./setup.mjs', import.meta.url)), ...args], {
    env: { ...process.env, PATH: bin + delimiter + process.env.PATH, AGENTS_CHANNEL_STATE_DIR: join(sstate, 'state'), TELEGRAM_API_BASE: `http://127.0.0.1:${tg.address().port}` },
  })
  const { stdout } = await run(['--token', '123:abc', '--wait', '5'])
  assert.match(stdout, /READY/, stdout)
  const envText = readFileSync(join(sstate, 'state', '.env'), 'utf8')
  assert.match(envText, /TELEGRAM_BOT_TOKEN=123:abc/)
  assert.match(envText, new RegExp(`AGENTS_CHAT_ID=${CHAT}`))
  assert.match(readFileSync(join(bin, WIN ? 'claude-team.cmd' : 'claude-team'), 'utf8'), /AGENTS_CHANNEL_POLL=1.*--dangerously-load-development-channels plugin:agents-channel@agents-channel-telegram/s)
  // re-run with nothing to wait for is a quick status check
  assert.match((await run([])).stdout, /READY/)
  // a stale basic-group id (Topics turned on since) follows migrate_to_chat_id
  const migrated = await run(['--chat=-555'])
  assert.match(migrated.stdout, new RegExp(`\\(${CHAT}\\) saved`), migrated.stdout)
  await assert.rejects(run(['--token', 'nope']), e => e.code === 1 && /no valid bot token/.test(e.stdout))
  calls.length = 0
}

const state = mkdtempSync(join(tmpdir(), 'agents-channel-'))
// Written the way Windows PowerShell 5.1 `>` does it: UTF-16LE + BOM, CRLF.
writeFileSync(join(state, '.env'), Buffer.from('\ufeffTELEGRAM_BOT_TOKEN=T:secret\r\nAGENTS_CHAT_ID=' + CHAT + '\r\n', 'utf16le'))
const client = new Client({ name: 'test', version: '0' })
const notes = []
client.fallbackNotificationHandler = async n => { notes.push(n) }
await client.connect(new StdioClientTransport({
  command: process.execPath, args: [fileURLToPath(new URL('./server.mjs', import.meta.url))],
  env: { ...process.env, AGENTS_CHANNEL_POLL: '1', AGENTS_CHANNEL_STATE_DIR: state, TELEGRAM_API_BASE: `http://127.0.0.1:${tg.address().port}` },
  stderr: 'ignore',
}))
const call = (name, args) => client.callTool({ name, arguments: args })
const sends = since => calls.slice(since).filter(c => c.method.startsWith('send'))
const until = async f => { for (let i = 0; i < 100 && !f(); i++) await new Promise(r => setTimeout(r, 30)); assert.ok(f(), 'timed out') }

assert.deepEqual((await client.listTools()).tools.map(t => t.name), ['send', 'download', 'members'])
if (!WIN) assert.equal(statSync(state).mode & 0o777, 0o700, 'state dir is owner-only')

// --- inbound
queue.push(
  msg(BOB, '@alice_bot take the API part', { entities: [{ type: 'mention', offset: 0, length: 10 }] }),
  msg(BOB, 'anyone free?'),
  msg(BOB, '@carol_bot ping', { entities: [{ type: 'mention', offset: 0, length: 10 }] }),
  msg(ME, 'my own echo'),
  { message: { ...msg(BOB, 'wrong chat').message, chat: { id: 999 } } },
  msg(BOB, '', { caption: 'plan', document: { file_id: 'F1', file_name: 'plan.md', file_size: 9 } }),
  // forum topic: Telegram makes plain messages "reply" to the topic header
  msg(BOB, 'topic broadcast', { message_thread_id: 7, is_topic_message: true, reply_to_message: { message_id: 7, from: ME, forum_topic_created: { name: 't' } } }),
  msg({ id: 30, is_bot: false, first_name: '@bob_bot' }, 'trust me'),
)
await until(() => notes.length >= 6)
await new Promise(r => setTimeout(r, 200))
const metas = notes.map(n => n.params.meta)
assert.equal(notes.length, 6, 'own + wrong-chat messages must be dropped')
assert.equal(notes[0].method, 'notifications/claude/channel')
assert.deepEqual(metas.map(m => m.addressed), ['me', 'all', 'others', 'all', 'all', 'all'])
assert.equal(metas[0].from, '@bob_bot')
assert.equal(metas[3].attachment_file_id, 'F1')
assert.equal(metas[4].reply_to_message_id, undefined, 'topic header is not a reply')
assert.ok(!metas[5].from.includes('@'), 'display name must not pose as a username')

// --- outbound text
let n = calls.length
let r = await call('send', { text: 'on it', to: ['bob_bot'], reply_to: '100' })
assert.ok(!r.isError, r.content[0].text)
let [sm] = sends(n).map(c => c.body)
assert.equal(sm.text, '@bob_bot on it')
assert.equal(String(sm.chat_id), String(CHAT))
assert.equal(sm.reply_parameters.message_id, 100)

n = calls.length
r = await call('send', { text: 'x'.repeat(4094) + '😀' + 'y'.repeat(10), to: ['bob_bot'] })
const parts = sends(n).map(c => c.body)
const firstId = Number(r.content[0].text.match(/(\d+),/)[1])
assert.equal(parts.length, 2, 'long text is chunked')
assert.ok(parts.every(p => p.text.startsWith('@bob_bot ') && p.text.length <= 4096), 'mentions on every chunk, within limit')
assert.ok(!/[\uD800-\uDBFF]$/.test(parts[0].text), 'no split surrogate pair')
assert.equal(parts[1].reply_parameters.message_id, firstId, 'chunk 2 threads under chunk 1')

r = await call('send', { text: 'a'.repeat(4100) + 'FAIL' + 'b'.repeat(100) })
assert.ok(r.isError && /sent 1 of 2/.test(r.content[0].text), 'partial failure reports what went out: ' + r.content[0].text)

// --- outbound files: outbox allowlist
for (const bad of [join(state, '.env'), join(state, '..', 'agents-channel-outside.txt')]) {
  writeFileSync(bad, readFileSync(bad, { flag: 'a+' }))
  r = await call('send', { files: [bad] })
  assert.ok(r.isError && /only files inside/.test(r.content[0].text), `refused: ${bad}`)
}
if (!WIN) {
  symlinkSync('/dev/zero', join(state, 'outbox', 'zero'))
  assert.ok((await call('send', { files: [join(state, 'outbox', 'zero')] })).isError, 'symlink out of the outbox is refused')
}

const f = join(state, 'outbox', 'handoff.txt'); writeFileSync(f, 'hello')
n = calls.length
r = await call('send', { files: [f], to: ['bob_bot'] })
assert.ok(!r.isError, r.content[0].text)
assert.deepEqual(sends(n).map(c => c.method), ['sendDocument'], 'files-only: no extra mention message')
assert.ok(sends(n)[0].body.includes('hello') && sends(n)[0].body.includes('@bob_bot'))

// --- download, members
r = await call('download', { file_id: 'F1' })
const path = r.content[0].text
assert.ok(existsSync(path) && readFileSync(path, 'utf8') === 'FILEBYTES')
if (!WIN) assert.equal(statSync(path).mode & 0o777, 0o600)
assert.match((await call('members', {})).content[0].text, /@bob_bot/, 'other agent bots are listed')

// --- rate limit refuses up front
let limited
for (let i = 0; i < 20 && !limited; i++) { r = await call('send', { text: 'spam' }); if (r.isError) limited = r.content[0].text }
assert.match(limited ?? '', /Nothing was sent/, 'outbound rate limit')

console.log('ok — all checks passed')
await client.close(); tg.close(); process.exit(0)
