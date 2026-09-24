# rpggame

GitHub Pages용 단일 HTML RPG입니다.

## Firebase 서버 로그인/저장 켜기

1. Firebase에서 새 프로젝트를 만듭니다.
2. Authentication > Sign-in method에서 **Email/Password**를 활성화합니다.
3. Firestore Database를 생성합니다.
4. 이 저장소의 `firebase-config.js`에서 `window.ECHOES_FIREBASE_CONFIG = null;`을 Firebase 웹 앱 설정값으로 교체합니다.
5. Firebase 콘솔의 Firestore Rules에 `firestore.rules` 내용을 적용합니다.
6. GitHub Pages를 다시 열면 회원가입/로그인과 진행 저장이 Firebase 서버를 사용합니다.

Firebase 설정이 비어 있으면 기존 브라우저 로컬 저장 방식으로 자동 전환됩니다.

> 서비스 계정 JSON, Admin SDK 비밀키, 비밀번호 같은 비밀 정보는 GitHub에 올리지 마세요.
