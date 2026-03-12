# Agent Office

Claude Code 에이전트 활동을 실시간으로 시각화하는 대시보드입니다.
터미널에서 Claude Code를 사용하면, 픽셀아트 사무실에서 에이전트들이 일하는 모습을 볼 수 있습니다.

## 요구사항

- **Node.js** >= 18.0.0
- **Claude Code** CLI 설치 필요

## 설치 및 실행

### 1. 저장소 클론

```bash
git clone https://github.com/SeongJaeJ/claude-agent-office.git
cd claude-agent-office
```

### 2. 의존성 설치

```bash
npm install
```

> `postinstall` 스크립트가 자동으로 터미널(node-pty) 실행 환경을 설정합니다.

### 3. 실행

```bash
npm start
```

서버가 `http://localhost:7777`에서 시작되고, 브라우저가 자동으로 열립니다.

### 4. Claude Code 훅 설정

최초 실행 시 자동으로 `~/.claude/settings.json`에 훅이 등록됩니다.
수동으로 설정하려면:

```bash
npx agent-office setup
```

### 5. 사용

평소처럼 아무 프로젝트에서 Claude Code를 사용하면 됩니다.
대시보드에 에이전트 활동이 실시간으로 표시됩니다.

## 글로벌 설치 (선택)

```bash
npm install -g .
```

이후 어디서든 `agent-office` 명령어로 실행할 수 있습니다.

## CLI 명령어

| 명령어 | 설명 |
|--------|------|
| `agent-office` | 서버 시작 + 브라우저 열기 |
| `agent-office setup` | Claude Code 훅 등록 |
| `agent-office uninstall` | 등록된 훅 제거 |
| `agent-office help` | 도움말 |

## 포트 변경

기본 포트는 `7777`입니다. 변경하려면:

```bash
AGENT_OFFICE_PORT=8888 npm start
```

## 개발 모드

파일 변경 시 자동 재시작:

```bash
npm run dev
```

## 프로젝트 구조

```
├── bin/
│   ├── agent-office.js   # CLI 엔트리 (start/setup/uninstall/help)
│   └── hook.js           # Claude Code 훅 (이벤트 → 서버 전송)
├── public/
│   ├── index.html        # 대시보드 UI (픽셀아트 사무실)
│   └── sprites/          # 에이전트 스프라이트 이미지
├── scripts/
│   ├── postinstall.cjs   # 설치 후 자동 실행 (node-pty 권한 설정)
│   ├── generate-sprites.js
│   └── clean-sprites.js
├── server.js             # HTTP + WebSocket 서버
└── package.json
```

## 동작 원리

1. Claude Code에서 도구를 사용할 때마다 **훅 이벤트**가 발생합니다
2. `hook.js`가 이벤트를 받아 Agent Office 서버로 전송합니다
3. 서버가 WebSocket으로 브라우저에 실시간 전달합니다
4. 대시보드에서 에이전트 상태가 업데이트됩니다

## 라이선스

MIT
