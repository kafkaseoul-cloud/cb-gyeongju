/* ==========================================================================
   ★ 설정 파일 — Firebase 프로젝트를 만든 뒤 아래 값을 채워 주세요.
   (README.md의 "Firebase 설정" 단계 참고)
   ========================================================================== */
window.APP_CONFIG = {
  // 방법 A) 프로젝트 설정 → 일반 → 내 앱 → 웹 앱(</>)의 firebaseConfig 값을 그대로 붙여넣기
  // 방법 B) 웹 앱 등록이 안 되면 아래 3개만 채워도 동작합니다 (나머지는 비워 두기)
  //   apiKey      : 프로젝트 설정 → 일반 → '웹 API 키'
  //   projectId   : 프로젝트 설정 → 일반 → '프로젝트 ID'
  //   databaseURL : Realtime Database 화면 위쪽의 https://....firebasedatabase.app 주소
  firebase: {
    apiKey: 'AIzaSyCYZGs8eilMAuPLa-I2rrXwI1IXfxuhgHw',
    authDomain: 'cb-gyeongju.firebaseapp.com',
    databaseURL: 'https://cb-gyeongju-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'cb-gyeongju',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
  },
};
