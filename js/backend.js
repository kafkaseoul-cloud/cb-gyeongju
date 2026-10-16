/* ==========================================================================
   Backend — 실시간 데이터 계층
   - 기본: Firebase Realtime Database + Firebase Authentication
   - ?mock=1 : 서버 없이 같은 브라우저의 탭끼리만 동작하는 테스트 모드
   화면 코드는 이 인터페이스만 사용한다:
     signInAnon() / signInAdmin(email, pw) / signOut() / user()
     on(path, cb) → unsubscribe, get(path), set(path, v), update(path, map),
     push(path, v) → key, remove(path), presence(path), now(), TIMESTAMP
   ========================================================================== */

const FIREBASE_VERSION = '10.14.1';
const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;

export function isConfigured() {
  const c = (window.APP_CONFIG && window.APP_CONFIG.firebase) || {};
  return !!(c.apiKey && c.databaseURL && c.projectId);
}

export async function createBackend() {
  const params = new URLSearchParams(location.search);
  if (params.has('mock')) return createMockBackend();
  if (!isConfigured()) return null;
  const cfg = { ...window.APP_CONFIG.firebase };
  // 웹 앱을 등록하지 않아도 동작하도록 빠진 값은 프로젝트 ID로 채운다
  if (!cfg.authDomain) cfg.authDomain = `${cfg.projectId}.firebaseapp.com`;
  Object.keys(cfg).forEach((k) => { if (!cfg[k]) delete cfg[k]; });
  return createFirebaseBackend(cfg);
}

// ───────────────────────── Firebase ─────────────────────────

async function createFirebaseBackend(config) {
  const [{ initializeApp }, authMod, dbMod] = await Promise.all([
    import(`${CDN}/firebase-app.js`),
    import(`${CDN}/firebase-auth.js`),
    import(`${CDN}/firebase-database.js`),
  ]);
  const app = initializeApp(config);
  const auth = authMod.getAuth(app);
  const db = dbMod.getDatabase(app);
  const { ref, onValue, get, set, update, push, remove, onDisconnect, serverTimestamp } = dbMod;

  let offset = 0;
  onValue(ref(db, '.info/serverTimeOffset'), (s) => { offset = s.val() || 0; });

  const authReady = new Promise((resolve) => {
    const un = authMod.onAuthStateChanged(auth, (u) => { un(); resolve(u); });
  });
  const wrapUser = (u) => (u ? { uid: u.uid, email: u.email || null, isAnonymous: u.isAnonymous } : null);

  return {
    mode: 'firebase',
    TIMESTAMP: serverTimestamp(),
    async ready() { return wrapUser(await authReady); },
    user: () => wrapUser(auth.currentUser),
    async signInAnon() {
      await authReady;
      if (auth.currentUser) return wrapUser(auth.currentUser);
      return wrapUser((await authMod.signInAnonymously(auth)).user);
    },
    async signInAdmin(email, password) {
      try {
        return wrapUser((await authMod.signInWithEmailAndPassword(auth, email, password)).user);
      } catch (e) {
        throw new Error(/invalid|wrong|not-found|credential/.test(e.code || '') ? '이메일 또는 비밀번호가 올바르지 않습니다.' : `로그인 실패: ${e.code || e.message}`);
      }
    },
    signOut: () => authMod.signOut(auth),
    on(path, cb, onError) {
      return onValue(ref(db, path), (s) => cb(s.val()), (e) => { console.error(path, e); if (onError) onError(e); });
    },
    async get(path) { return (await get(ref(db, path))).val(); },
    set: (path, v) => set(ref(db, path), v),
    update: (path, map) => update(path && path !== '/' ? ref(db, path) : ref(db), map),
    async push(path, v) { const r = push(ref(db, path)); await set(r, v); return r.key; },
    remove: (path) => remove(ref(db, path)),
    /** 접속해 있는 동안 path=true, 끊기면 자동 삭제 */
    presence(path) {
      return onValue(ref(db, '.info/connected'), async (s) => {
        if (!s.val()) return;
        try {
          await onDisconnect(ref(db, path)).remove();
          await set(ref(db, path), true);
        } catch (e) { console.warn('presence', e); }
      });
    },
    now: () => Date.now() + offset,
  };
}

// ───────────────────────── Mock (테스트용) ─────────────────────────
// 같은 브라우저의 여러 탭이 localStorage를 공유해 실시간처럼 동작한다.

function createMockBackend() {
  const KEY = 'mockdb.v1';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  let tree = read();
  const listeners = new Set();
  const split = (p) => String(p).split('/').filter(Boolean);
  const getAt = (t, p) => split(p).reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), t);
  const clean = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v, (k, x) => (x === MOCK_TS ? Date.now() : x))));
  const MOCK_TS = { '.sv': 'timestamp' };
  function setAt(t, p, v) {
    const ks = split(p);
    if (!ks.length) return clean(v) || {};
    let o = t;
    for (let i = 0; i < ks.length - 1; i++) { if (!o[ks[i]] || typeof o[ks[i]] !== 'object') o[ks[i]] = {}; o = o[ks[i]]; }
    const val = clean(v);
    if (val === null || (typeof val === 'object' && !Object.keys(val).length)) delete o[ks.at(-1)];
    else o[ks.at(-1)] = val;
    return t;
  }
  const fire = () => {
    for (const l of listeners) {
      const v = getAt(tree, l.path);
      const s = JSON.stringify(v === undefined ? null : v);
      if (s !== l.last) { l.last = s; l.cb(v === undefined ? null : JSON.parse(s)); }
    }
  };
  const commit = () => { localStorage.setItem(KEY, JSON.stringify(tree)); fire(); };
  window.addEventListener('storage', (e) => { if (e.key === KEY) { tree = read(); fire(); } });

  const tabUser = (() => {
    let u = null;
    try { u = JSON.parse(sessionStorage.getItem('mock.user')); } catch { /* */ }
    return u;
  })();
  let current = tabUser;
  const saveUser = () => sessionStorage.setItem('mock.user', JSON.stringify(current));
  const presencePaths = new Set();
  window.addEventListener('pagehide', () => { presencePaths.forEach((p) => { tree = setAt(read(), p, null); }); localStorage.setItem(KEY, JSON.stringify(tree)); });
  const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  return {
    mode: 'mock',
    TIMESTAMP: MOCK_TS,
    async ready() { return current; },
    user: () => current,
    async signInAnon() { if (!current) { current = { uid: `u${rid()}`, email: null, isAnonymous: true }; saveUser(); } return current; },
    async signInAdmin(email, password) {
      if (!email || password !== 'admin1234') throw new Error('이메일 또는 비밀번호가 올바르지 않습니다. (테스트 모드 비밀번호: admin1234)');
      current = { uid: `admin-${email}`, email, isAnonymous: false }; saveUser(); return current;
    },
    async signOut() { current = null; sessionStorage.removeItem('mock.user'); },
    on(path, cb) {
      if (path === '.info/connected') { setTimeout(() => cb(true), 0); return () => {}; }
      const cur = getAt(tree, path);
      const l = { path, cb, last: JSON.stringify(cur === undefined ? null : cur) };
      listeners.add(l);
      setTimeout(() => { if (listeners.has(l)) cb(JSON.parse(l.last)); }, 0);
      return () => listeners.delete(l);
    },
    async get(path) { const v = getAt(tree, path); return v === undefined ? null : clean(v); },
    async set(path, v) { tree = setAt(read(), path, v); commit(); },
    async update(path, map) {
      tree = read();
      for (const [k, v] of Object.entries(map)) tree = setAt(tree, `${path}/${k}`, v);
      commit();
    },
    async push(path, v) { const k = `${Date.now().toString(36)}${rid()}`; tree = setAt(read(), `${path}/${k}`, v); commit(); return k; },
    async remove(path) { tree = setAt(read(), path, null); commit(); },
    presence(path) { presencePaths.add(path); tree = setAt(read(), path, true); commit(); return () => {}; },
    now: () => Date.now(),
  };
}
