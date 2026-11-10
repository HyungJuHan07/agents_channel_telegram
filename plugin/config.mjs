// Shared by server.mjs and setup.mjs: where state lives, how .env is read/written, Bot API calls.
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Outside ~/.claude on purpose: Claude Code guards that folder, so staging a file in the outbox
// there would need a human approval every single time.
export const STATE_DIR = process.env.AGENTS_CHANNEL_STATE_DIR ?? join(homedir(), '.agents-channel')
export const INBOX = join(STATE_DIR, 'inbox')
export const OUTBOX = join(STATE_DIR, 'outbox')
export const ENV_FILE = join(STATE_DIR, '.env')
export const HISTORY = join(STATE_DIR, 'history.jsonl')
const API = process.env.TELEGRAM_API_BASE ?? 'https://api.telegram.org'

// State dir holds the token and teammates' downloads: owner-only (no-op on Windows,
// where %USERPROFILE% is already private by default ACL).
export function ensureStateDirs() {
  for (const d of [STATE_DIR, INBOX, OUTBOX]) { mkdirSync(d, { recursive: true, mode: 0o700 }); chmodSync(d, 0o700) }
}

export function readEnvFile() {
  const out = {}
  try {
    chmodSync(ENV_FILE, 0o600)
    const raw = readFileSync(ENV_FILE)
    // Windows PowerShell 5.1 `"..." > .env` writes UTF-16LE with a BOM.
    const text = raw[0] === 0xff && raw[1] === 0xfe ? raw.toString('utf16le') : raw.toString('utf8')
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*(\w+)\s*=\s*(.*?)\s*$/)
      if (m) out[m[1]] = m[2]
    }
  } catch {}
  return out
}

export function writeEnvFile(vars) {
  ensureStateDirs()
  const body = Object.entries(vars).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${v}`).join('\n') + '\n'
  writeFileSync(ENV_FILE, body, { mode: 0o600 })
  chmodSync(ENV_FILE, 0o600)
}

export const botApi = token => async function tg(method, body) {
  const isForm = body instanceof FormData
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: 'POST',
    // A long-poll socket that died during laptop sleep / Wi-Fi switch must not hang forever.
    signal: AbortSignal.timeout(body?.timeout ? (body.timeout + 15) * 1000 : isForm ? 300_000 : 60_000),
    headers: isForm ? undefined : { 'content-type': 'application/json' },
    body: isForm ? body : JSON.stringify(body ?? {}),
  })
  const j = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }))
  if (!j.ok) throw Object.assign(new Error(`${method}: ${j.description}`), { code: j.error_code, parameters: j.parameters })
  return j.result
}

export const fileUrl = (token, path) => `${API}/file/bot${token}/${path}`
