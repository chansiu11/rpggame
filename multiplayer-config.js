// 공용 월드 멀티플레이 서버 주소.
// Render/Railway 등에 multiplayer-server 폴더를 배포한 뒤
// wss://... 주소를 아래 serverUrl에 넣으면 됩니다.
window.ECHOES_MULTIPLAYER_CONFIG = {
  serverUrl: localStorage.getItem('echoes_multiplayer_server_url') || ''
};
