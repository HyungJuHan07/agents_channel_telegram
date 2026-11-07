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
 * Output lines: "OK ...", "ACTION ..." (a human must do this in Telegram), "ERROR ...".
 * Exit code 0 = ready, 2 = waiting on a human ACTION, 1 = error.
 */
import { existsSync, writeFileSync, chmodSync } from 'node:fs'
import { join, delimiter } from 'node:path'
import { parseArgs } from 'node:util'
import { ENV_FILE, STATE_DIR, readEnvFile, writeEnvFile, botApi } from './config.mjs'

const { values: opt } = parseArgs({ options: { token: { type: 'string' }, chat: { type: 'string' }, wait: { type: 'string', default: '0' } } })
const env = readEnvFile()
const actions = []
const ok = s => console.log('OK     ' + s)
const action = s => { actions.push(s); console.log('ACTION ' + s) }
const fail = s => { console.log('ERROR  ' + s); process.exit(1) }
const CHANNEL = 'plugin:agents-channel@agents-channel-telegram'
const RERUN = 'node setup.mjs --wait 120'
const ADD_BOT = u => `add @${u} to the team group as an administrator (group settings → Administrators → Add Admin). If it is already in the group, send any message in the group so setup can see it`

// 1. token
const token = (opt.token ?? env.TELEGRAM_BOT_TOKEN ?? '').trim()
if (!/^\d+:[\w-]+$/.test(token)) fail('no valid bot token. Get one from @BotFather (/newbot) and run: node setup.mjs --token <TOKEN>')
const tg = botApi(token)
let me
try { me = await tg('getMe') } catch (e) { fail(e.code === 401 ? 'Telegram rejected the token (401). Copy it again from @BotFather.' : `cannot reach Telegram: ${e.message}`) }
writeEnvFile({ ...env, TELEGRAM_BOT_TOKEN: token })
ok(`bot @${me.username} (id ${me.id}); token saved to ${ENV_FILE}`)
if (!me.can_read_all_group_messages)
  action(`@BotFather → /setprivacy → @${me.username} → Disable. (If the bot is already in the group, remove it and add it again afterwards.)`)
console.log(`NOTE   Bot-to-Bot Communication Mode can't be checked from the API: make sure it is enabled for @${me.username} in @BotFather (/mybots → @${me.username} → Bot Settings).`)

// 2. launcher: put `claude-team` next to `claude`, which is already on PATH.
function installLauncher() {
  const win = process.platform === 'win32'
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
  const dir = dirs.find(d => (win ? ['.exe', '.cmd', ''] : ['']).some(e => existsSync(join(d, 'claude' + e))))
  const files = {
    'claude-team': `#!/bin/sh\nAGENTS_CHANNEL_POLL=1 exec claude --dangerously-load-development-channels ${CHANNEL} "$@"\n`,
    ...(win ? { 'claude-team.cmd': `@echo off\r\nsetlocal\r\nset "AGENTS_CHANNEL_POLL=1"\r\ncall claude --dangerously-load-development-channels ${CHANNEL} %*\r\n` } : {}),
  }
  for (const target of [dir, STATE_DIR].filter(Boolean)) {
    try {
      for (const [name, body] of Object.entries(files)) { writeFileSync(join(target, name), body); chmodSync(join(target, name), 0o755) }
      if (target === dir) return ok(`launcher installed: ${join(dir, win ? 'claude-team.cmd' : 'claude-team')} → start the team session with: claude-team`)
      // Works, just not on PATH: not a blocker, so a NOTE (an ACTION would never clear on re-run).
      return console.log(`NOTE   could not write next to claude; start the team session with the full path: "${join(STATE_DIR, win ? 'claude-team.cmd' : 'claude-team')}"`)
    } catch {}
  }
  fail(`could not write the launcher anywhere`)
}
installLauncher()

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
  action(`group "${chat.title}" is a basic group: turn on Topics in the group settings (it becomes a supergroup with a new id), then send any message in the group and re-run: ${RERUN}`)
}
if (member.status !== 'administrator' && member.status !== 'creator') action(`make @${me.username} an administrator of "${chat.title}" (group settings → Administrators → Add Admin).`)

console.log(actions.length
  ? `\nNOT READY: ${actions.length} action(s) above, then re-run: ${RERUN}`
  : `\nREADY. Open a new terminal and run: claude-team  (accept the "local development" prompt once)`)
process.exit(actions.length ? 2 : 0)
