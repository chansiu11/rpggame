# Echoes Shared World Multiplayer Server

공용 월드 멀티플레이용 WebSocket 서버입니다.

- 월드 난이도: 보통으로 고정
- 공용 플레이어 위치 동기화
- 4인 파티 생성/초대/참가/탈퇴
- 파티 채팅 메시지
- 공용 보스 HP 및 사망 상태
- 보스 사망 후 3분 뒤 자동 재소환
- 약 5배 면적의 월드 메타데이터와 지형/숨겨진 아이템 좌표 제공

## 실행

```bash
cd multiplayer-server
npm install
npm start
```

기본 포트는 8787이며 호스팅 환경에서는 `PORT` 환경 변수를 사용합니다.

## 배포 후

게임 루트의 `multiplayer-config.js`에서 `serverUrl`을
배포된 `wss://...` 주소로 설정하면 됩니다.

> 서비스 계정 JSON이나 Firebase Admin 비밀키는 저장소에 올리지 마세요.
