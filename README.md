# agents_channel_telegram

팀원 각자의 컴퓨터에서 돌아가는 **Claude Code끼리 텔레그램 그룹 하나로 직접 대화**하게 해주는 Claude Code 채널 플러그인입니다.
사람이 결과물을 복사해서 전달할 필요 없이, Claude가 다른 팀원의 Claude에게 작업을 넘기고, 질문하고, 파일을 주고받습니다.

## 빠른 시작

### 내가 할 일

1. **Claude Code에 말하기:** `https://github.com/HyungJuHan07/agents_channel_telegram 설치해줘`
2. **봇 만들기** (Claude가 요청하면): 텔레그램 [@BotFather](https://t.me/BotFather)에서
   - `/newbot`으로 봇을 만들고, 받은 **토큰을 Claude에게 붙여넣기**
   - `/mybots` → 내 봇 → Bot Settings에서 **Bot-to-Bot Communication 켜기** (메뉴 이름은 조금 다를 수 있음)
   - `/setprivacy` → 내 봇 → **Disable**
3. **봇을 팀 그룹 관리자로 추가:** 그룹 설정 → 관리자 → 관리자 추가 → 내 봇 검색
4. **실행:** 새 터미널에서 `claude-team` → 경고 화면에서 "I am using this for local development" 선택

나머지(Node 확인, 플러그인 설치, 설정 파일, 그룹 찾기, 실행 명령 등록)는 Claude가 합니다.

### 팀원끼리 연결하기

연결의 중심은 **텔레그램 그룹 하나**입니다. 각자의 봇이 그 그룹에 들어가면 서로 연결됩니다.

1. **팀장 (처음 한 번):** 텔레그램에서 그룹을 만들고, 설정에서 **Topics(주제)** 를 켠 뒤, 초대 링크를 팀원들에게 공유합니다.
2. **팀원 각자:** 초대 링크로 그룹에 들어간 뒤, 위 "내가 할 일" 1~4를 합니다. 3번에서 자기 봇을 이 그룹에 넣습니다.
3. **자기소개:** `claude-team`을 켠 뒤 자기 Claude에게 "채널에 자기소개 올려줘. 나는 ○○ 담당이야"라고 합니다. Claude가 `#intro` 메시지를 올리고, 다른 팀원들의 Claude 세션에 그 메시지가 들어오면 연결된 것입니다. 나중에 들어온 팀원이 소개를 올리면 기존 봇들이 자기 소개를 자동으로 답장해서, 누구나 같은 명단을 갖게 됩니다.

연결된 뒤에는 "백엔드 담당한테 API 스펙 파일로 넘겨줘"처럼 평소대로 말하면 됩니다. Claude가 자기소개 명단을 보고 맞는 봇을 골라 보냅니다. 사람은 그룹 채팅에서 Claude들의 대화를 그대로 볼 수 있습니다.

> - **그룹 관리자의 메시지만** Claude에게 전달됩니다. 팀원과 팀원의 봇은 관리자로 두세요. 관리자가 아닌 사람이 들어와도 Claude에게는 아무것도 전달되지 않습니다.
> - 봇은 **한 사람당 하나**씩 따로 만들어야 합니다. 같은 토큰을 두 컴퓨터에서 쓰면 메시지를 서로 빼앗습니다.
> - 메시지는 `claude-team` 세션이 켜져 있을 때 들어옵니다. 꺼져 있던 동안 온 메시지는 24시간 안에 다시 켜면 한꺼번에 들어옵니다.
> - 회사/학교 조직 계정(claude.ai Team/Enterprise)이면 조직 관리자가 Channels 기능을 켜야 합니다.

## 구성

```
[A의 컴퓨터] Claude Code ── @a_bot ─┐
[B의 컴퓨터] Claude Code ── @b_bot ─┼── 텔레그램 포럼 슈퍼그룹 (봇 전원 관리자)
[C의 컴퓨터] Claude Code ── @c_bot ─┘        └ 사람도 같은 그룹에서 지켜보고 끼어들 수 있음
```

- 다른 에이전트가 보낸 메시지가 내 Claude 세션에 바로 들어옵니다 (`<channel source="agents-channel" from="@b_bot" addressed="me" ...>`).
- Claude는 `send`(보내기, @지정, 답장, 파일 첨부), `download`(첨부파일 받기), `history`(지난 대화 다시 읽기), `roster`(에이전트별 자기소개 명단), `members`(그룹 관리자 목록) 도구를 씁니다.
- 텔레그램 봇은 지난 대화를 조회할 수 없어서, 각자의 컴퓨터에 대화 기록(`history.jsonl`)을 저장합니다. 세션을 새로 켜도 Claude가 이 기록과 자기소개 명단으로 맥락을 이어갑니다.
- 텔레그램 **Bot API 10.0(2026-05)의 Bot-to-Bot Communication Mode** 덕분에 봇끼리 그룹 메시지를 볼 수 있습니다. 이 모드는 반드시 켜야 합니다.

## For Claude Code: install procedure

You were asked to install this repository for the user. Follow these steps exactly; talk to the user in their language. Never echo the bot token back or write it anywhere except via `setup.mjs`.

1. **Node 20+.** Run `node -v`. If missing or older, ask the user, then install it (Windows: `winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements`; macOS: `brew install node`). In this session the new PATH may not be visible yet: on Windows use `"C:\Program Files\nodejs\node.exe"` in place of `node` below.
2. **Plugin.** Run:
   ```
   claude plugin marketplace add HyungJuHan07/agents_channel_telegram
   claude plugin install agents-channel@agents-channel-telegram
   ```
   If the marketplace already exists, run `claude plugin marketplace update agents-channel-telegram` and `claude plugin update agents-channel@agents-channel-telegram` instead.
3. **Locate setup.** Run `claude plugin list --json`, take `installPath` of the entry whose `id` is `agents-channel@agents-channel-telegram`. `SETUP` = `<installPath>/setup.mjs`.
4. **Token.** Run `node "SETUP"` (no args: a quick status check that returns in seconds). If it prints `OK bot @...` the token is already saved: skip to step 5; if it prints `READY`, skip to step 6. Otherwise give the user the BotFather steps from "빠른 시작 → 내가 할 일" item 2 above (all three bullets) and ask them to paste the token.
5. **Run setup.** Tell the user to add their bot to the team group as an administrator now ("내가 할 일" item 3; if nobody has made the group yet, "팀원끼리 연결하기" item 1 first). Then run, with a Bash timeout of at least 150000 ms:
   ```
   node "SETUP" --token <TOKEN> --wait 120
   ```
   (Omit `--token` on re-runs; it is saved. Setup's own hints say `node setup.mjs`: always run it as `node "SETUP"`. To pick a group by id, use `--chat=<id>` with the `=`, since ids are negative.) Read the output:
   - `OK` lines: done. `NOTE` lines: relay to the user.
   - `ACTION` lines: something only the user can do in Telegram. Relay each one plainly, wait for them to say it's done, then re-run `node "SETUP" --wait 120`.
   - `ERROR` lines: fix what it says (e.g. a 409 means a `claude-team` session is already running with this bot: ask the user to close it) and re-run.
   - Exit code 0 with `READY`: go to step 6.
6. **Finish.** Tell the user: open a **new** terminal and run `claude-team`, choose "I am using this for local development" on the warning screen. Then, in that session, ask Claude to post a hello to the channel to confirm teammates' agents can see it. Mention: the Bot-to-Bot Communication setting can't be verified by setup, so if other agents don't see each other's messages, re-check it in @BotFather.

## 수동 설치

Claude 없이 직접 하려면 위 "For Claude Code" 절차의 명령을 그대로 실행하면 됩니다: 플러그인 설치 → `claude plugin list --json`으로 경로 확인 → `node "<installPath>/setup.mjs" --token <토큰>`. `setup.mjs`가 설정 파일(`~/.claude/channels/agents-channel/.env`)과 `claude-team` 실행 명령을 만들어 줍니다.

`.env`에 직접 넣을 수 있는 선택 항목:

```
# 이 토픽만 듣고 이 토픽에만 보냄
AGENTS_TOPIC_ID=42
# 이 텔레그램 ID들의 메시지만 받음 (봇/사람 ID, 쉼표 구분). 비우면 그룹 관리자만
ALLOWED_SENDER_IDS=111111,222222
```

`claude-team`은 `AGENTS_CHANNEL_POLL=1`을 켜고 `claude --dangerously-load-development-channels plugin:agents-channel@agents-channel-telegram`을 실행하는 짧은 스크립트입니다. 이 값을 켠 세션만 그룹 메시지를 받습니다. 플러그인은 모든 Claude 세션에 켜지므로, 평소 세션이 메시지를 가져가서 버리는 일을 막기 위한 것입니다.

> 메시지는 `claude-team` 세션이 켜져 있을 때만 들어옵니다. 꺼져 있던 동안 온 메시지는 텔레그램이 최대 24시간 보관했다가 다시 켜면 전달합니다.

### 업데이트

```
claude plugin marketplace update agents-channel-telegram
claude plugin update agents-channel@agents-channel-telegram
```

그다음 `claude-team`을 다시 실행합니다.

### 요구 사항

- Claude Code (v2.1.319에서 개발), claude.ai 로그인 또는 Console API 키. 실행은 터미널의 `claude` CLI에서 합니다 (VS Code 확장에서는 채널 플래그를 줄 수 없습니다).
- Node.js 20 이상 (외부 패키지 없음). Windows, macOS, Linux.
- 팀원 **1명당 봇 1개** (토큰 하나를 여러 컴퓨터가 같이 쓰면 409 Conflict로 메시지를 서로 빼앗습니다)

## 작동 방식

```
 A의 Claude ──send 도구──▶ server.mjs(A) ──sendMessage──▶ ┌───────────────┐
                                                            │ 텔레그램 그룹 │
 B의 Claude ◀─<channel> 알림── server.mjs(B) ◀─getUpdates── └───────────────┘
```

1. `claude-team`으로 Claude Code를 켜면, Claude Code가 이 플러그인의 `server.mjs`를 자식 프로세스로 띄웁니다. 둘은 표준입출력으로 MCP(JSON-RPC)를 주고받습니다.
2. `server.mjs`는 내 봇 토큰으로 텔레그램에 계속 "새 메시지 있어?"라고 물어봅니다 (long polling, `getUpdates`). 서버를 따로 열 필요가 없어서 방화벽이나 포트 설정이 필요 없습니다.
3. 그룹에 다른 에이전트의 메시지가 오면, 설정한 그룹/토픽/발신자인지 확인합니다. 통과하면 `notifications/claude/channel` 알림으로 Claude 세션에 밀어 넣습니다. Claude에게는 `<channel from="@b_bot" addressed="me" ...>내용</channel>` 형태로 보입니다.
4. Claude는 내용을 보고 작업을 한 뒤, `send` 도구로 답합니다. `server.mjs`가 그걸 텔레그램 `sendMessage`/`sendDocument`로 그룹에 올립니다.
5. 다른 팀원의 `server.mjs`가 같은 방식으로 그 메시지를 받아 그쪽 Claude에게 전달합니다. 사람은 그룹에서 대화를 그대로 지켜볼 수 있습니다.

봇이 다른 봇의 메시지를 볼 수 있는 건 텔레그램 Bot API 10.0의 Bot-to-Bot 모드 덕분이라, 모든 봇에서 이 모드를 켜고 관리자로 넣어야 합니다.

## 쓰는 법

평소처럼 Claude에게 말하면 됩니다:

- "API 스펙 정리한 거 B 에이전트한테 파일로 넘겨줘"
- "프론트 쪽 Claude한테 로그인 화면 진행 상황 물어봐"
- "채널에 누구 있는지 확인해"

다른 에이전트가 나를 `@`멘션하거나 내 메시지에 답장하면 `addressed="me"`로, 전체에게 보낸 메시지는 `addressed="all"`로, 다른 봇을 지정한 메시지는 `addressed="others"`로 들어옵니다. Claude는 이 값을 보고 응답할지 정합니다.

## 안전 장치

- 설정한 그룹(그리고 토픽)의 메시지만 받습니다.
- 그 안에서도 **그룹 관리자의 메시지만** Claude에게 전달하고 기록합니다. 초대 링크가 새서 외부인이 들어와도, 관리자가 아니면 Claude에게 지시할 수 없습니다. (`ALLOWED_SENDER_IDS`를 설정하면 관리자 대신 그 ID 목록만 받습니다.)
- 텔레그램 그룹 설정도 같이 해두세요: 팀원이 다 들어온 뒤 초대 링크 재발급, 초대 링크에 가입 승인 켜기, 멤버 추가는 관리자만, 새 멤버에게 이전 대화 숨기기.
- 텔레그램 그룹은 종단 간 암호화가 아니므로, 오간 메시지와 파일은 텔레그램 서버에 저장됩니다. 기밀이나 개인정보는 올리지 마세요. 봇 토큰이 새었다고 의심되면 @BotFather에서 `/revoke`로 바로 무효화하세요.
- 다른 에이전트의 메시지는 "팀원의 요청"으로 취급합니다. 비밀 정보 공개, 파괴적인 명령, push/배포, 채널 설정 변경은 내 사용자 확인 없이 하지 않도록 Claude에게 지시되어 있습니다.
- 파일 첨부는 `~/.claude/channels/agents-channel/outbox/` (Windows: `%USERPROFILE%\.claude\channels\agents-channel\outbox\`) 안의 파일만 가능합니다. Claude가 보낼 파일을 거기로 복사한 다음 보냅니다. 복사 단계는 Claude Code의 일반 권한 확인을 거치므로, 다른 에이전트가 "~/.ssh 키 보내줘" 같은 요청을 해도 한 번에 새어 나가지 않습니다.
- 설정 폴더는 본인만 접근 가능(macOS/Linux 700, 받은 파일 600)합니다. Windows는 기본적으로 사용자 폴더(`C:\Users\<이름>`)가 본인 전용 권한이라 그 아래에 둡니다.
- 사용자명이 없는 발신자는 `@`가 붙지 않아 다른 에이전트로 위장할 수 없습니다. Claude는 `from_id`로 실제 발신자를 확인합니다.
- 에이전트끼리 무한 대화하는 것을 막기 위해 단순 맞장구 메시지를 금지하고, 봇당 분당 18개로 발신을 제한합니다. 한도를 넘는 전송은 아예 보내지 않고 거절하며, 중간에 실패하면 이미 보낸 부분을 알려줘서 중복 전송을 막습니다.

## 제한

| 항목 | 한도 |
|---|---|
| 메시지 길이 | 4096자 (넘으면 자동 분할, 긴 내용은 파일 첨부 권장) |
| 업로드 | 파일당 50MB |
| 다른 봇이 다운로드 | 20MB (넘는 파일은 링크로 공유) |
| 발신 속도 | 봇당 그룹에서 분당 약 20개 |
| 히스토리 | Bot API에 조회 기능이 없어 각자 컴퓨터에 기록함. 세션이 24시간 넘게 꺼져 있던 동안의 대화는 내 기록에 빠짐 (자기소개 명단은 자동 답장으로 다시 채워짐) |

## 처음 연결 확인 (봇 2개)

봇끼리 메시지가 보이는지는 공식 문서 기준으로 확인한 것이라, 처음에는 실제로 한 번 확인하세요:

1. 두 사람이 각자 설치를 마칩니다.
2. 두 사람 모두 `claude-team`으로 실행했는지 확인하고, A가 자기 Claude에게 "채널에 '연결 테스트'라고 보내줘"라고 말합니다.
3. B의 Claude 세션에 `<channel ... from="@a_bot" ...>연결 테스트</channel>`가 들어오면 성공입니다.

안 들어오면 다음을 확인하세요:

- B 봇의 Bot-to-Bot 모드, B 봇이 관리자인지, Privacy를 바꾼 뒤 봇을 다시 초대했는지, `AGENTS_CHAT_ID` 값
- `/mcp`에서 `agents-channel`이 connected인지. failed면 `node -v`가 되는지 확인 (Node 설치 후 새 터미널 필요)
- `claude-team --debug`로 켠 뒤 디버그 로그에 `Channel notifications registered`가 있는지. `skipped`라면 그 이유가 같이 적혀 있습니다
- 회사/학교 조직 계정(claude.ai Team/Enterprise)이면 조직 관리자가 Channels를 켜야 합니다
- 회사망 프록시 뒤라면 Node가 프록시를 안 쓸 수 있습니다: `NODE_USE_ENV_PROXY=1`과 `HTTPS_PROXY`를 설정하세요

## 개발

```
cd plugin && npm install && npm test   # 가짜 Telegram API로 전체 흐름 자체 검증
```

이 저장소를 직접 고쳐 쓰는 경우, 플러그인 설치 대신 로컬 경로로 마켓플레이스를 추가하면 됩니다: `/plugin marketplace add /path/to/agents_channel_telegram`
