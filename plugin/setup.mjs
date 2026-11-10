#!/usr/bin/env node
/**
 * One-shot setup, meant to be run by Claude Code on the user's behalf:
 *
 *   node setup.mjs --token <BOT_TOKEN>      first run
 *   node setup.mjs                          re-run / check (token already saved)
 *   options: --chat=<id>  use this group instead of auto-detecting (ids are negative, so use =)
 *            --wait <s>   wait up to s seconds for the bot to be added to a group
 *                         (default 0: a bare run is a quick status check)
 *
 * Validates the token, saves .env, installs the `claude-team` launcher next to the
 * `claude` binary, detects the group the bot was added to, and checks the bot's rights.
 * Output lines: "OK ...", "NOTE ...", "ACTION ..." (a human must do this in Telegram), "ERROR ...".
 * Exit code 0 = ready, 2 = waiting on a human ACTION, 1 = error.
 */
import { existsSync, writeFileSync, chmodSync } from 'node:fs'
import { join, delimiter } from 'node:path'
import { homedir } from 'node:os'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { ENV_FILE, STATE_DIR, INBOX, OUTBOX, readEnvFile, writeEnvFile, botApi } from './config.mjs'

const { values: opt } = parseArgs({ options: { token: { type: 'string' }, chat: { type: 'string' }, wait: { type: 'string', default: '0' } } })
const env = readEnvFile()
const actions = []
const ok = s => console.log('OK     ' + s)
const note = s => console.log('NOTE   ' + s)
const action = s => { actions.push(s); console.log('ACTION ' + s) }
const fail = s => { console.log('ERROR  ' + s); process.exit(1) }
const win = process.platform === 'win32'
const CHANNEL = 'plugin:agents-channel@agents-channel-telegram'
const TOOLS = 'mcp__plugin_agents-channel_agents-channel' // all of this plugin's tools
const RERUN = `node "${fileURLToPath(import.meta.url)}" --wait 120`
const ADD_BOT = u => `add @${u} to the team group as an administrator (group settings → Administrators → Add Admin; if you can't, send "@${u}" to the group owner and ask them to add it as admin). If it is already in the group, send any message in the group so setup can see it`

// 1. token
const token = (opt.token ?? env.AGENTS_BOT_TOKEN ?? '').trim()
if (!/^\d+:[\w-]+$/.test(token)) fail(`no valid bot token. Get one from @BotFather (/newbot) and run: node "${fileURLToPath(import.meta.url)}" --token <TOKEN>`)
const tg = botApi(token)
let me
try { me = await tg('getMe') } catch (e) { fail(e.code === 401 ? 'Telegram rejected the token (401). Copy it again from @BotFather.' : `cannot reach Telegram: ${e.message}`) }
await tg('deleteWebhook').catch(() => {}) // a leftover webhook makes every getUpdates fail with 409
writeEnvFile({ ...env, AGENTS_BOT_TOKEN: token })
ok(`bot @${me.username} (id ${me.id}); token saved to ${ENV_FILE}`)
if (!me.can_read_all_group_messages)
  action(`@BotFather → /setprivacy → @${me.username} → Disable. (If the bot is already in the group, remove it and add it again afterwards.)`)
note(`Bot-to-Bot Communication Mode can't be checked from the API: make sure it is enabled for @${me.username} in @BotFather (/mybots → @${me.username} → Bot Settings).`)

// 2. launcher: put `claude-team` next to `claude`, which is already on PATH. It turns on polling,
// loads the channel, pre-approves this plugin's tools, and adds the outbox/inbox as working dirs
// so staging a file for a teammate doesn't need a separate approval each time.
function installLauncher() {
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
  const dir = dirs.find(d => (win ? ['.exe', '.cmd', ''] : ['']).some(e => existsSync(join(d, 'claude' + e))))
  if (!dir) return action('the Claude Code CLI (`claude`) is not on PATH (the VS Code extension and desktop app do not provide it). Install it — Windows PowerShell: irm https://claude.ai/install.ps1 | iex ; macOS/Linux: curl -fsSL https://claude.ai/install.sh | bash — open a new terminal, then re-run setup.')
  // Paths via %USERPROFILE%/$HOME when possible: a .cmd file is read in the console code page,
  // so a literal Korean/accented user name would break inside it.
  const isDefault = STATE_DIR === join(homedir(), '.agents-channel')
  const p = (sub, style) => isDefault ? (style === 'cmd' ? `%USERPROFILE%\\.agents-channel\\${sub}` : `$HOME/.agents-channel/${sub}`) : join(STATE_DIR, sub)
  // `--flag=value` form: these flags take several values and would otherwise swallow a prompt passed after them.
  const args = s => `--dangerously-load-development-channels=${CHANNEL} --allowedTools=${TOOLS} --add-dir="${p('outbox', s)}" --add-dir="${p('inbox', s)}"`
  const files = {
    'claude-team': `#!/bin/sh\nAGENTS_CHANNEL_POLL=1 exec claude ${args('sh')} "$@"\n`,
    ...(win ? { 'claude-team.cmd': `@echo off\r\nsetlocal\r\nset "AGENTS_CHANNEL_POLL=1"\r\ncall claude ${args('cmd')} %*\r\n` } : {}),
  }
  for (const target of [dir, STATE_DIR]) {
    try {
      for (const [name, body] of Object.entries(files)) { writeFileSync(join(target, name), body); chmodSync(join(target, name), 0o755) }
      if (target === dir) { ok(`launcher installed: ${join(dir, win ? 'claude-team.cmd' : 'claude-team')}`); return 'claude-team' }
      // Works, just not on PATH: not a blocker, so a NOTE (an ACTION would never clear on re-run).
      const full = join(STATE_DIR, win ? 'claude-team.cmd' : 'claude-team')
      note(`could not write next to claude (${dir}); the launcher is at ${full}`)
      return win ? `& "${full}"   (PowerShell; in cmd.exe: "${full}")` : `"${full}"`
    } catch {}
  }
  fail('could not write the launcher anywhere')
}
const launch = installLauncher()

// 3. group: explicit, saved, or detected from the "bot was added" update.
async function detectGroup(seconds) {
  console.log(`WAIT   ${ADD_BOT(me.username)}. Waiting up to ${seconds}s...`)
  const deadline = Date.now() + seconds * 1000
  let offset
  while (Date.now() < deadline) {
    let updates
    try {
      updates = await tg('getUpdates', { offset, timeout: Math.max(1, Math.min(30, Math.round((deadline - Date.now()) / 1000))), allowed_updates: ['my_chat_member', 'message'] })
    } catch (e) {
      if (e.code === 409) fail('another program is polling this bot (409). Close any running claude-team session, then re-run setup.')
      throw e
    }
    const chats = new Map()
    for (const u of updates) {
      const c = u.my_chat_member?.chat ?? u.message?.chat
      const left = ['left', 'kicked'].includes(u.my_chat_member?.new_chat_member?.status)
      if (c && ['group', 'supergroup'].includes(c.type)) left ? chats.delete(c.id) : chats.set(c.id, c)
      const moved = u.message?.migrate_to_chat_id // group became a supergroup (e.g. Topics turned on)
      if (moved) { chats.delete(u.message.chat.id); chats.set(moved, { id: moved, title: u.message.chat.title, type: 'supergroup' }) }
    }
    // Not confirming these updates (no offset bump) when a group is found: the channel session gets them.
    if (chats.size === 1) return [...chats.values()][0].id
    if (chats.size > 1) {
      for (const c of chats.values()) console.log(`FOUND  ${c.id}  ${c.title}`)
      fail('the bot is in several groups; re-run with --chat=<id> for the team group (the = matters: ids are negative)')
    }
    if (updates.length) offset = updates.at(-1).update_id + 1
  }
  return null
}

let chatId = opt.chat || env.AGENTS_CHAT_ID || (Number(opt.wait) > 0 ? await detectGroup(Number(opt.wait)) : null)
if (!chatId) {
  action(`${ADD_BOT(me.username)}. Then re-run: ${RERUN}`)
  process.exit(2)
}
let chat, member
try {
  chat = await tg('getChat', { chat_id: chatId }).catch(e => {
    const moved = e.parameters?.migrate_to_chat_id // saved basic-group id; Topics turned it into a supergroup
    if (!moved) throw e
    chatId = moved
    return tg('getChat', { chat_id: moved })
  })
  member = await tg('getChatMember', { chat_id: chatId, user_id: me.id })
} catch (e) { fail(`bot can't see group ${chatId}: ${e.message}. Add @${me.username} to the group, then re-run: ${RERUN}`) }
if (chat.type === 'supergroup') {
  writeEnvFile({ ...readEnvFile(), AGENTS_CHAT_ID: chat.id })
  ok(`group "${chat.title}" (${chat.id}) saved`)
} else {
  // Not saved: turning on Topics gives the group a new id, which a re-run auto-detects.
  writeEnvFile({ ...readEnvFile(), AGENTS_CHAT_ID: '' })
  action(`group "${chat.title}" is a basic group: the group owner must turn on Topics in the group settings (it becomes a supergroup with a new id); then send any message in the group and re-run: ${RERUN}`)
}
if (member.status !== 'administrator' && member.status !== 'creator')
  action(`@${me.username} must be an administrator of "${chat.title}". Usually only the group owner can do this: send them "@${me.username}" and ask them to promote it (group settings → Administrators → Add Admin).`)

console.log(actions.length
  ? `\nNOT READY: ${actions.length} action(s) above, then re-run: ${RERUN}`
  : `\nREADY. Open a new terminal, go to your project folder (cd <project>), and run: ${launch}\n(The "local development" warning appears on every launch: choose option 1.)`)
process.exit(actions.length ? 2 : 0)
