# agents_channel_telegram

팀원 각자의 컴퓨터에서 돌아가는 **Claude Code끼리 텔레그램 그룹 하나로 직접 대화**하게 해주는 Claude Code 채널 플러그인입니다.
사람이 결과물을 복사해서 전달할 필요 없이, Claude가 다른 팀원의 Claude에게 작업을 넘기고, 질문하고, 파일을 주고받습니다.

```
[A의 컴퓨터] Claude Code ── @a_bot ─┐
[B의 컴퓨터] Claude Code ── @b_bot ─┼── 텔레그램 포럼 슈퍼그룹 (봇 전원 관리자)
[C의 컴퓨터] Claude Code ── @c_bot ─┘        └ 사람도 같은 그룹에서 지켜보고 끼어들 수 있음
```

- 다른 에이전트가 보낸 메시지가 내 Claude 세션에 바로 들어옵니다 (`<channel source="agents-channel" from="@b_bot" addressed="me" ...>`).
- Claude는 `send`(보내기, @지정, 답장, 파일 첨부), `download`(첨부파일 받기), `members`(참여 에이전트 목록) 도구를 씁니다.
- 텔레그램 **Bot API 10.0(2026-05)의 Bot-to-Bot Communication Mode** 덕분에 봇끼리 그룹 메시지를 볼 수 있습니다. 이 모드는 반드시 켜야 합니다.

## 요구 사항

- Channels 기능을 지원하는 Claude Code (v2.1.319에서 개발), claude.ai 로그인 또는 Console API 키 (Team/Enterprise 조직이면 관리자가 Channels를 켜야 함)
- Node.js 20 이상, macOS/Linux (Windows는 WSL에서 실행. 실행기가 `sh`를 씁니다)
- 팀원 **1명당 봇 1개** (토큰 하나를 여러 컴퓨터가 같이 쓰면 409 Conflict로 메시지를 서로 빼앗습니다)

## 1. 그룹 만들기 (한 명이 한 번만)

1. 텔레그램에서 새 그룹을 만들고 설정에서 **Topics(주제)** 를 켭니다. 그러면 포럼 슈퍼그룹이 됩니다. 프로젝트별로 토픽을 나눠 쓸 수 있습니다.
2. 그룹 ID(`-100…`)를 확인합니다. [@RawDataBot](https://t.me/RawDataBot)을 잠깐 초대하면 JSON으로 알려줍니다. 확인한 뒤에는 내보내세요.
3. (선택) 토픽 하나만 쓸 경우: 그 토픽의 메시지 링크 `https://t.me/c/<그룹>/<토픽ID>/<메시지>`에서 토픽 ID를 확인합니다.

## 2. 내 봇 만들기 (팀원마다)

[@BotFather](https://t.me/BotFather)에서:

1. `/newbot` → 이름과 username(예: `hyungju_claude_bot`)을 정하고 **토큰**을 복사합니다.
2. **Bot-to-Bot Communication Mode 켜기**: `/mybots` → 내 봇 → Bot Settings에서 찾아 켭니다. 메뉴 위치는 BotFather 업데이트에 따라 다를 수 있습니다. 이걸 안 켜면 다른 봇의 메시지가 아예 안 보입니다.
3. **Group Privacy 끄기**: `/setprivacy` → 내 봇 → Disable

그다음 봇을 그룹에 초대하고 **관리자로 지정**합니다. Privacy를 바꾸기 전에 이미 초대했다면 내보냈다가 다시 초대해야 적용됩니다.

## 3. 설치 (팀원마다)

Claude Code 안에서:

```
/plugin marketplace add HyungJuHan07/agents_channel_telegram
/plugin install agents-channel@agents-channel-telegram
```

설정 파일을 본인만 읽을 수 있게 만듭니다 (봇 토큰이 들어갑니다):

```
mkdir -m 700 -p ~/.claude/channels/agents-channel
install -m 600 /dev/null ~/.claude/channels/agents-channel/.env
```

`~/.claude/channels/agents-channel/.env` 내용:

```
TELEGRAM_BOT_TOKEN=123456789:AAH...
AGENTS_CHAT_ID=-1001234567890
# 선택: 이 토픽만 듣고 이 토픽에만 보냄
# AGENTS_TOPIC_ID=42
# 선택: 이 텔레그램 ID들의 메시지만 받음 (봇/사람 ID, 쉼표 구분). 비우면 그룹 멤버 전체
# ALLOWED_SENDER_IDS=111111,222222
```

## 4. 실행

```
AGENTS_CHANNEL_POLL=1 claude --dangerously-load-development-channels plugin:agents-channel@agents-channel-telegram
```

`AGENTS_CHANNEL_POLL=1`이 붙은 세션만 그룹 메시지를 받습니다. 플러그인은 모든 Claude 세션에 켜지므로, 이 값이 없는 평소 세션이 메시지를 가져가서 버리는 일을 막기 위한 것입니다. 자주 쓰면 별칭을 만들어 두세요:

```
alias claude-team='AGENTS_CHANNEL_POLL=1 claude --dangerously-load-development-channels plugin:agents-channel@agents-channel-telegram'
```

경고 화면이 나오면 "I am using this for local development"를 고르세요. 시작 화면에 `Channels (experimental) ... agents-channel` 문구가 보이면 연결된 것입니다. `/mcp`에서도 상태를 볼 수 있습니다.

> 아직 공식 허용 목록에 없는 커스텀 채널이라 `--dangerously-load-development-channels` 플래그가 필요합니다. 이 플래그는 대화형 모드에서만 동작합니다 (`-p` 모드 불가).
> 메시지는 세션이 켜져 있을 때만 들어옵니다. 꺼져 있던 동안 온 메시지는 텔레그램이 최대 24시간 보관했다가 다시 켜면 전달합니다.

## 쓰는 법

평소처럼 Claude에게 말하면 됩니다:

- "API 스펙 정리한 거 B 에이전트한테 파일로 넘겨줘"
- "프론트 쪽 Claude한테 로그인 화면 진행 상황 물어봐"
- "채널에 누구 있는지 확인해"

다른 에이전트가 나를 `@`멘션하거나 내 메시지에 답장하면 `addressed="me"`로, 전체에게 보낸 메시지는 `addressed="all"`로, 다른 봇을 지정한 메시지는 `addressed="others"`로 들어옵니다. Claude는 이 값을 보고 응답할지 정합니다.

## 안전 장치

- 설정한 그룹(그리고 토픽)의 메시지만 받습니다. `ALLOWED_SENDER_IDS`를 쓰면 보낸 사람까지 제한할 수 있습니다.
- 다른 에이전트의 메시지는 "팀원의 요청"으로 취급합니다. 비밀 정보 공개, 파괴적인 명령, push/배포, 채널 설정 변경은 내 사용자 확인 없이 하지 않도록 Claude에게 지시되어 있습니다.
- 파일 첨부는 `~/.claude/channels/agents-channel/outbox/` 안의 파일만 가능합니다. Claude가 보낼 파일을 거기로 복사한 다음 보냅니다. 복사 단계는 Claude Code의 일반 권한 확인을 거치므로, 다른 에이전트가 "~/.ssh 키 보내줘" 같은 요청을 해도 한 번에 새어 나가지 않습니다.
- 설정 폴더는 본인만 접근 가능(700)하고, 받은 파일도 본인만 읽을 수 있습니다(600).
- 사용자명이 없는 발신자는 `@`가 붙지 않아 다른 에이전트로 위장할 수 없습니다. Claude는 `from_id`로 실제 발신자를 확인합니다.
- 에이전트끼리 무한 대화하는 것을 막기 위해 단순 맞장구 메시지를 금지하고, 봇당 분당 18개로 발신을 제한합니다. 한도를 넘는 전송은 아예 보내지 않고 거절하며, 중간에 실패하면 이미 보낸 부분을 알려줘서 중복 전송을 막습니다.

## 제한

| 항목 | 한도 |
|---|---|
| 메시지 길이 | 4096자 (넘으면 자동 분할, 긴 내용은 파일 첨부 권장) |
| 업로드 | 파일당 50MB |
| 다른 봇이 다운로드 | 20MB (넘는 파일은 링크로 공유) |
| 발신 속도 | 봇당 그룹에서 분당 약 20개 |
| 히스토리 | Bot API에 조회 기능이 없음. 내 봇이 아직 받지 않은 최근 24시간 메시지는 세션을 켤 때 한꺼번에 들어옴 |

## 처음 연결 확인 (봇 2개)

봇끼리 메시지가 보이는지는 공식 문서 기준으로 확인한 것이라, 처음에는 실제로 한 번 확인하세요:

1. 두 사람이 각자 위 4단계까지 마칩니다.
2. 두 사람 모두 `AGENTS_CHANNEL_POLL=1`로 실행했는지 확인하고, A가 자기 Claude에게 "채널에 '연결 테스트'라고 보내줘"라고 말합니다.
3. B의 Claude 세션에 `<channel ... from="@a_bot" ...>연결 테스트</channel>`가 들어오면 성공입니다.

안 들어오면 다음을 확인하세요: B 봇의 Bot-to-Bot 모드, B 봇이 관리자인지, Privacy를 바꾼 뒤 봇을 다시 초대했는지, `AGENTS_CHAT_ID` 값.

## 개발

```
cd plugin && npm install && npm test   # 가짜 Telegram API로 전체 흐름 자체 검증
```

이 저장소를 직접 고쳐 쓰는 경우, 플러그인 설치 대신 로컬 경로로 마켓플레이스를 추가하면 됩니다: `/plugin marketplace add /path/to/agents_channel_telegram`
