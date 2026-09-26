// 공용 월드/PVP 멀티플레이 서버 주소.
// 이전 테스트 서버 주소가 localStorage에 남아 있으면 현재 공식 서버로 되돌립니다.
(()=>{
  const OFFICIAL_SERVER='wss://echoes-world-server.onrender.com';
  try{
    const saved=localStorage.getItem('echoes_multiplayer_server_url');
    if(saved&&saved!==OFFICIAL_SERVER)localStorage.removeItem('echoes_multiplayer_server_url');
  }catch{}
  window.ECHOES_MULTIPLAYER_CONFIG={serverUrl:OFFICIAL_SERVER};
})();
