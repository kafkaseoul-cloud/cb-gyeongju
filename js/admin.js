/* ==========================================================================
   관리자 화면 (Firebase 버전 — 게임 진행 로직이 이 브라우저에서 실행된다)
   - 진행: 단계 전환(대기실 → 게임 선택 → 게임 진행), 게임별 진행 패널
   - 참가자·팀: A/B 배정, 랜덤 배정, 강퇴
   - 콘텐츠 관리: 게임별 문제/이미지/시간 (games/<id>/admin.js)
   - 대기실 채팅, QR·설정
   ========================================================================== */
import { createBackend } from './backend.js';
import { boot, GAMES, buildState, chatList, defaultJoinUrl, DEFAULT_PUBLIC } from './common.js';

(async function () {
  'use strict';
  const { h, mount, $, store, keyed } = Kit;

  const B = await boot(createBackend, { role: 'admin' });
  if (!B) return;

  const S = {
    raw: { pub: null, players: null, status: null, admin: null },
    loaded: new Set(),
    state: null,
    page: store.get('pg.admin.page', 'control'),
    chat: [],
    unread: 0,
    loaded_: {},
    subs: [],
    busy: {},
    inited: false,
  };

  // ───────── 로그인 ─────────
  function showLogin(message) {
    S.subs.forEach((u) => u()); S.subs = [];
    $('#app').hidden = true;
    $('#login').hidden = false;
    if (message) Kit.toast(message, 'error');
    if (B.mode === 'mock' && !$('#login-email').value) { $('#login-email').value = 'admin@test.local'; }
    setTimeout(() => ($('#login-email').value ? $('#login-pw') : $('#login-email')).focus(), 30);
  }
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await B.signInAdmin($('#login-email').value.trim(), $('#login-pw').value);
      $('#login-pw').value = '';
      start();
    } catch (err) { Kit.toast(err.message, 'error'); }
  });

  async function logout() { await B.signOut(); showLogin(); }

  // ───────── 실시간 구독 ─────────
  function start() {
    $('#login').hidden = true;
    $('#app').hidden = false;
    $('#player-link').href = defaultJoinUrl();
    S.subs.forEach((u) => u());
    const denied = () => { B.signOut(); showLogin('이 계정에는 관리자 권한이 없어요. database.rules.json의 ADMIN_EMAIL을 확인하세요.'); };
    const onData = (key) => (v) => { S.raw[key] = v; S.loaded.add(key); refresh(); };
    S.subs = [
      B.on('admin', onData('admin'), denied),
      B.on('public', onData('pub')),
      B.on('players', onData('players')),
      B.on('status', onData('status')),
      B.on('chat', (v) => {
        const list = chatList(v);
        const prevLen = S.chat.length;
        const cleared = list.length < prevLen;
        const added = cleared ? [] : list.slice(prevLen);
        S.chat = list;
        if (S.page !== 'chat') S.unread += added.length;
        if (S.page === 'chat') { if (cleared) renderPage(true); else added.forEach(appendChat); }
        renderNav();
      }),
      B.on('.info/connected', (v) => $('#conn').classList.toggle('on', !!v)),
    ];
  }

  async function refresh() {
    if (!['admin', 'pub', 'players', 'status'].every((k) => S.loaded.has(k))) return;
    S.state = { ...buildState(S.raw), joinUrl: (S.raw.pub && S.raw.pub.joinUrl) || '' };
    await loadAllGameModules();
    if (!S.inited) { S.inited = true; await initData(); }
    syncPublic();
    render();
  }

  /** 첫 로그인 시 기본값 + 기본 문제(더미) 넣기 */
  async function initData() {
    const map = {};
    if (!S.raw.pub) Object.entries(DEFAULT_PUBLIC).forEach(([k, v]) => { map[`public/${k}`] = v; });
    for (const g of GAMES) {
      const mod = window.AdminGames[g.id];
      if (mod && mod.seed) Object.assign(map, await mod.seed(gameCtx(g.id)));
    }
    if (Object.keys(map).length) await B.update('', map).catch((e) => Kit.toast(`초기화 실패: ${e.message}`, 'error'));
  }

  /** 콘텐츠가 바뀌면 참가자에게 보이는 요약(테마 목록, 문제 수 등)을 맞춘다 */
  let syncing = false;
  async function syncPublic() {
    if (syncing) return;
    const map = {};
    for (const g of GAMES) {
      const mod = window.AdminGames[g.id];
      if (mod && mod.publicSync) Object.assign(map, mod.publicSync(gameCtx(g.id)) || {});
    }
    if (!Object.keys(map).length) return;
    syncing = true;
    await B.update('', map).catch(() => {});
    syncing = false;
  }

  // ───────── 게임 모듈 연결 ─────────
  function loadGameAdmin(id) {
    if (S.loaded_[id]) return S.loaded_[id];
    S.loaded_[id] = new Promise((resolve) => {
      document.head.appendChild(h('link', { rel: 'stylesheet', href: `games/${id}/style.css` }));
      const s = h('script', { src: `games/${id}/admin.js` });
      s.onload = resolve; s.onerror = resolve;
      document.head.appendChild(s);
    });
    return S.loaded_[id];
  }
  const loadAllGameModules = () => Promise.all(GAMES.map((g) => loadGameAdmin(g.id)));

  /** 게임 모듈에 넘겨주는 컨텍스트: 현재 데이터 + DB 경로 + 점수 헬퍼 */
  function gameCtx(gid) {
    const adm = S.raw.admin || {};
    const pick = (o) => (o || {})[gid];
    return {
      id: gid,
      state: S.state,
      teams: S.state ? S.state.teams : DEFAULT_PUBLIC.teams,
      pub: pick((S.raw.pub || {}).games) || null,
      content: pick(adm.content) || null,
      settings: pick(adm.settings) || {},
      priv: pick(adm.rounds) || null,
      played: pick(adm.played) || {}, // 이미 출제된 문제 (테마별) — 라운드·팀이 바뀌어도 유지
      seeded: !!pick(adm.seeded),
      now: B.now(),
      P: {
        pub: `public/games/${gid}`, content: `admin/content/${gid}`, settings: `admin/settings/${gid}`,
        priv: `admin/rounds/${gid}`, seeded: `admin/seeded/${gid}`, played: `admin/played/${gid}`,
      },
      score(team, delta) {
        const cur = (S.state ? S.state.teams[team].score : 0) || 0;
        return { [`public/teams/${team}/score`]: cur + delta };
      },
    };
  }

  async function runGame(gid, type, payload) {
    const mod = window.AdminGames[gid];
    if (!mod) return false;
    try {
      const map = await mod.action(type, payload || {}, gameCtx(gid));
      if (map && Object.keys(map).length) await B.update('', map);
      return true;
    } catch (err) { Kit.toast(err.message, 'error'); return false; }
  }

  function gameApi(gid) {
    return {
      state: S.state,
      Kit,
      act: (type, payload) => runGame(gid, type, payload),
      upload: async (dataUrl) => dataUrl, // 이미지는 DB에 직접 저장
      rerender: () => renderPage(true),
    };
  }

  // 타이머 종료 감지 (관리자 화면이 열려 있는 동안)
  setInterval(() => {
    if (!S.state || S.state.phase !== 'game') return;
    const gid = S.state.currentGameId;
    const mod = window.AdminGames[gid];
    if (!mod || !mod.tick || S.busy[gid]) return;
    const type = mod.tick(gameCtx(gid));
    if (!type) return;
    S.busy[gid] = true;
    runGame(gid, type).finally(() => { setTimeout(() => { S.busy[gid] = false; }, 800); });
  }, 400);

  // ───────── 세션 명령 ─────────
  const exitMap = async () => {
    const gid = S.state.currentGameId;
    const mod = gid && window.AdminGames[gid];
    return mod && mod.onExit ? (await mod.onExit(gameCtx(gid))) || {} : {};
  };

  const actions = {
    async setPhase({ phase }) {
      return { ...(await exitMap()), 'public/phase': phase, 'public/currentGameId': null };
    },
    async startGame({ gameId }) {
      const mod = window.AdminGames[gameId];
      const enter = mod && mod.onEnter ? (await mod.onEnter(gameCtx(gameId))) || {} : {};
      return { ...(await exitMap()), ...enter, 'public/phase': 'game', 'public/currentGameId': gameId };
    },
    setTitle: ({ title }) => ({ 'public/title': String(title || '').trim().slice(0, 30) || 'GAME NIGHT' }),
    setJoinUrl: ({ url }) => ({ 'public/joinUrl': String(url || '').trim().slice(0, 300) || null }),
    setTeamName: ({ team, name }) => ({ [`public/teams/${team}/name`]: String(name || '').trim().slice(0, 12) || `${team}팀` }),
    addScore: ({ team, delta }) => ({ [`public/teams/${team}/score`]: (S.state.teams[team].score || 0) + delta }),
    setScore: ({ team, score }) => ({ [`public/teams/${team}/score`]: Math.trunc(Number(score) || 0) }),
    resetScores: () => ({ 'public/teams/A/score': 0, 'public/teams/B/score': 0 }),
    assignTeam: ({ playerId, team }) => ({ [`players/${playerId}/team`]: team || null }),
    randomTeams() {
      const list = S.state.players.filter((p) => p.online);
      for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
      const map = {};
      list.forEach((p, i) => { map[`players/${p.id}/team`] = i % 2 === 0 ? 'A' : 'B'; });
      return map;
    },
    clearTeams() {
      const map = {};
      S.state.players.forEach((p) => { map[`players/${p.id}/team`] = null; });
      return map;
    },
    async kick({ playerId }) {
      const p = S.state.players.find((x) => x.id === playerId);
      if (p) B.push('chat', { uid: B.user().uid, kind: 'system', nickname: '', text: `${p.nickname} 님이 퇴장 처리되었어요.`, at: B.TIMESTAMP }).catch(() => {});
      return { [`players/${playerId}`]: null };
    },
    removeOffline() {
      const map = {};
      S.state.players.filter((p) => !p.online).forEach((p) => { map[`players/${p.id}`] = null; });
      return map;
    },
    clearChat: () => ({ chat: null }),
    async adminChat({ text }) {
      const t = String(text || '').trim().slice(0, 200);
      if (t) await B.push('chat', { uid: B.user().uid, kind: 'admin', nickname: '진행자', text: t, at: B.TIMESTAMP });
      return null;
    },
    async resetEvent() {
      // 보안 규칙상 players 전체를 한 번에 지울 수 없어 참가자별로 삭제한다 (한 번에 지우면 초기화 전체가 거부됨)
      const map = { chat: null, 'public/phase': 'lobby', 'public/currentGameId': null,
        'public/teams/A/score': 0, 'public/teams/B/score': 0, 'public/games': null, 'admin/rounds': null, 'admin/played': null };
      Object.keys(S.raw.players || {}).forEach((uid) => { map[`players/${uid}`] = null; });
      return map;
    },
  };

  async function action(type, payload) {
    try {
      const map = await actions[type](payload || {});
      if (map && Object.keys(map).length) await B.update('', map);
      return true;
    } catch (err) { Kit.toast(err.message, 'error'); return false; }
  }

  const qrSrc = (url) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(QR.toSvg(url, { margin: 2 }))}`;
  const joinUrlOf = (st) => st.joinUrl || defaultJoinUrl();

  // ───────── 공통 렌더 ─────────
  const PAGES = () => [
    { id: 'control', icon: '🎮', label: '진행' },
    { id: 'players', icon: '👥', label: '참가자 · 팀' },
    { group: '콘텐츠 관리' },
    ...S.state.games.map((g) => ({ id: `content:${g.id}`, icon: g.icon, label: g.name })),
    { group: '기타' },
    { id: 'chat', icon: '💬', label: '대기실 채팅' },
    { id: 'settings', icon: '📱', label: 'QR · 설정' },
  ];
  const PHASE = { lobby: '① 대기실', select: '② 게임 선택', game: '③ 게임 진행' };

  function render() {
    const st = S.state;
    $('#side-title').textContent = st.title;
    const online = st.players.filter((p) => p.online).length;
    $('#online-count').textContent = `접속 ${online}명 / 전체 ${st.players.length}명`;
    const pill = $('#phase-pill');
    const gname = st.currentGameId ? (st.games.find((g) => g.id === st.currentGameId) || {}).name : '';
    pill.textContent = st.phase === 'game' ? `${PHASE.game} · ${gname}` : PHASE[st.phase];
    pill.className = `badge ${st.phase === 'game' ? '' : 'badge-primary'}`;
    keyed($('#scorebar'), st.teams, renderScoreAdmin);
    renderNav();
    renderPage(false);
  }

  function renderNav() {
    if (!S.state) return;
    keyed($('#nav'), [S.page, S.unread, S.state.games], (el) => mount(el, PAGES().map((p) => p.group
      ? h('div', { class: 'nav-group' }, p.group)
      : h('button', { class: `nav-row ${S.page === p.id ? 'on' : ''}`, on: { click: () => go(p.id) } },
        h('span', { class: 'nav-icon' }, p.icon), h('span', { class: 'grow ellipsis' }, p.label),
        p.id === 'chat' && S.unread ? h('span', { class: 'badge' }, S.unread) : null))));
  }

  function go(page) {
    S.page = page;
    store.set('pg.admin.page', page);
    if (page === 'chat') S.unread = 0;
    renderNav();
    renderPage(true);
    window.scrollTo(0, 0);
  }

  function renderScoreAdmin(el) {
    const st = S.state;
    const side = (key) => {
      const t = st.teams[key];
      const name = h('input', { class: 'team-name-input', value: t.name, maxlength: 12, 'aria-label': `${key}팀 이름`,
        on: { change: () => action('setTeamName', { team: key, name: name.value }), keydown: (e) => { if (e.key === 'Enter') name.blur(); } } });
      return h('div', { class: `admin-team ${key.toLowerCase()}` },
        h('div', { class: 'grow stack-sm', style: { gap: '2px' } }, h('span', { class: 'link-sm', style: { opacity: 0.8 } }, `TEAM ${key}`), name),
        h('button', { class: 'btn btn-icon btn-dark', title: '-1', on: { click: () => action('addScore', { team: key, delta: -1 }) } }, '−'),
        h('button', { class: 'admin-pts', title: '클릭해서 점수 직접 입력', on: { click: () => {
          const v = prompt(`${t.name} 점수 입력`, t.score);
          if (v !== null && v.trim() !== '' && !Number.isNaN(Number(v))) action('setScore', { team: key, score: Number(v) });
        } } }, t.score),
        h('button', { class: 'btn btn-icon btn-dark', title: '+1', on: { click: () => action('addScore', { team: key, delta: 1 }) } }, '+'));
    };
    mount(el, side('A'), side('B'),
      h('button', { class: 'btn btn-sm btn-ghost', title: '두 팀 점수를 0으로', on: { click: async () => {
        if (await Kit.confirm('두 팀 점수를 0점으로 초기화할까요?', { ok: '초기화', danger: true })) action('resetScores');
      } } }, '점수 초기화'));
  }

  function renderPage(force) {
    if (!S.state) return;
    const page = $('#page');
    const st = S.state;
    if (page._page !== S.page || force) { page._page = S.page; page._key = null; page.replaceChildren(); page._sections = {}; page.classList.remove('is-game'); }
    const titleOf = PAGES().find((p) => p.id === S.page);
    if (!titleOf) { go('control'); return; }
    $('#page-title').textContent = `${titleOf.icon} ${titleOf.label}`;

    if (S.page === 'control') return pageControl(page, st);
    if (S.page === 'players') return keyed(page, [st.players, st.teams], () => pagePlayers(page, st));
    if (S.page === 'chat') return pageChat(page, force);
    if (S.page === 'settings') return keyed(page, [st.title, st.joinUrl], () => pageSettings(page, st));
    if (S.page.startsWith('content:')) return pageContent(page, st, S.page.slice(8));
  }

  /** 페이지 안의 섹션 (데이터가 바뀐 섹션만 다시 그림) */
  function section(page, id, data, fn) {
    let el = page._sections[id];
    if (!el) { el = page._sections[id] = h('section', { class: `page-section sec-${id}` }); page.appendChild(el); }
    keyed(el, data, fn);
    return el;
  }

  // ───────── 진행 페이지 ─────────
  function pageControl(page, st) {
    page.classList.toggle('is-game', st.phase === 'game'); // 게임 중: 진행 패널을 위로, 게임 바꾸기는 아래에 작게
    section(page, 'phase', [st.phase, st.currentGameId, st.players.filter((p) => p.online).length, st.joinUrl], (el) => {
      const step = (key, num, title, desc, onClick) => h('button', {
        class: `step ${st.phase === key ? 'on' : ''}`, disabled: !onClick, on: onClick ? { click: onClick } : null,
      }, h('span', { class: 'step-num' }, num), h('span', { class: 'grow' }, h('strong', null, title), h('span', { class: 'link-sm muted' }, desc)));
      const online = st.players.filter((p) => p.online).length;
      const joinUrl = joinUrlOf(st);
      mount(el, h('div', { class: 'stack' },
        h('div', { class: 'steps' },
          step('lobby', '1', '대기실', `입장 · 채팅 (접속 ${online}명)`, st.phase === 'lobby' ? null : async () => {
            if (await Kit.confirm('대기실로 돌아갈까요? 참가자 화면이 대기실로 바뀝니다.')) action('setPhase', { phase: 'lobby' });
          }),
          step('select', '2', '게임 선택', '참가자에게 게임 목록 표시', st.phase === 'select' ? null : () => action('setPhase', { phase: 'select' })),
          step('game', '3', '게임 진행', st.currentGameId ? (st.games.find((g) => g.id === st.currentGameId) || {}).name : '아래에서 게임을 고르세요', null)),
        st.phase === 'lobby'
          ? h('div', { class: 'card-blurple lobby-cta' },
            h('div', { class: 'qr-mini', title: joinUrl }, h('img', { src: qrSrc(joinUrl), alt: '입장 QR' })),
            h('div', { class: 'grow stack-sm' },
              h('div', { class: 'heading-lg' }, `${online}명 입장`),
              h('div', { class: 'muted' }, joinUrl),
              h('div', { class: 'row row-wrap' },
                h('button', { class: 'btn btn-white', on: { click: () => showBigQr(joinUrl) } }, 'QR 크게 보기'),
                h('button', { class: 'btn btn-green', on: { click: async () => {
                  if (await Kit.confirm('입장을 마감하고 게임 선택 화면으로 전환할까요?', { ok: '전환' })) action('setPhase', { phase: 'select' });
                } } }, '입장 마감 → 게임 선택 화면'))))
          : null));
    });

    if (st.phase === 'lobby') {
      section(page, 'games', ['lobby'], (el) => mount(el));
      section(page, 'game', ['lobby'], (el) => mount(el));
      return;
    }

    section(page, 'games', [st.games, st.currentGameId], (el) => mount(el, h('div', { class: 'stack-sm' },
      h('div', { class: 'label' }, st.phase === 'game' ? '다른 게임으로 바꾸기' : '진행할 게임을 고르세요'),
      h('div', { class: 'admin-games' }, st.games.map((g) => h('button', {
        class: `admin-game c-${g.color || 'primary'} ${st.currentGameId === g.id ? 'on' : ''}`,
        on: { click: async () => {
          if (st.currentGameId === g.id) return;
          if (st.phase === 'game' && !(await Kit.confirm(`"${g.name}"(으)로 전환할까요? 진행 중인 타이머는 일시정지됩니다.`, { ok: '전환' }))) return;
          action('startGame', { gameId: g.id });
        } },
      }, h('span', { class: 'admin-game-icon' }, g.icon), h('span', { class: 'grow' }, h('strong', null, g.name), h('span', { class: 'link-sm muted' }, g.description)),
      st.currentGameId === g.id ? h('span', { class: 'badge badge-ghost' }, '진행 중') : null))))));

    const gid = st.currentGameId;
    if (st.phase !== 'game' || !gid) { section(page, 'game', ['none'], (el) => mount(el)); return; }
    const mod = window.AdminGames[gid];
    const meta = st.games.find((g) => g.id === gid) || {};
    const ctx = gameCtx(gid);
    section(page, 'game', [gid, mod && mod.controlKey ? mod.controlKey(ctx) : [ctx.pub, ctx.priv, ctx.settings], st.teams], (el) => {
      const body = h('div');
      mount(el, h('div', { class: 'card card-xl stack game-panel' },
        h('div', { class: 'row row-wrap' },
          h('h2', { class: 'heading-sm grow' }, `${meta.icon} ${meta.name} 진행`),
          h('button', { class: 'btn btn-sm btn-ghost', on: { click: () => go(`content:${gid}`) } }, '콘텐츠 관리'),
          h('button', { class: 'btn btn-sm btn-ghost', on: { click: () => action('setPhase', { phase: 'select' }) } }, '← 게임 선택 화면으로')),
        body));
      if (mod && mod.control) mod.control(body, ctx, gameApi(gid));
      else mount(body, h('div', { class: 'empty' }, '이 게임은 진행 패널이 없어요.'));
    });
  }

  // ───────── 참가자 · 팀 ─────────
  function pagePlayers(page, st) {
    const col = (team, title) => {
      const list = st.players.filter((p) => (p.team || null) === team);
      return h('div', { class: `team-col ${team ? `team-col-${team.toLowerCase()}` : ''}` },
        h('div', { class: 'team-col-head row' }, h('strong', { class: 'grow' }, title), h('span', { class: 'badge badge-ghost' }, `${list.length}명`)),
        list.length ? list.map((p) => h('div', { class: `prow ${p.online ? '' : 'offline'}` },
          h('div', { class: 'avatar-wrap' }, Kit.avatar(p), h('span', { class: `dot ${p.online ? 'on' : ''}` })),
          h('span', { class: 'grow ellipsis prow-name' }, p.nickname),
          h('div', { class: 'seg seg-sm' },
            ['A', 'B'].map((t) => h('button', { class: `seg-btn ${p.team === t ? `on team-${t.toLowerCase()}` : ''}`, title: `${st.teams[t].name}로`, on: { click: () => action('assignTeam', { playerId: p.id, team: p.team === t ? null : t }) } }, t))),
          h('button', { class: 'btn btn-icon btn-danger', title: '강퇴', on: { click: async () => {
            if (await Kit.confirm(`${p.nickname} 님을 퇴장시킬까요?`, { ok: '퇴장', danger: true })) action('kick', { playerId: p.id });
          } } }, '✕')))
          : h('div', { class: 'empty', style: { padding: '20px' } }, '없음'));
    };
    mount(page, h('div', { class: 'stack' },
      h('div', { class: 'row row-wrap' },
        h('button', { class: 'btn btn-primary', on: { click: async () => {
          if (await Kit.confirm('접속 중인 참가자를 A/B팀에 랜덤으로 나눌까요? 기존 배정은 덮어씁니다.', { ok: '랜덤 배정' })) action('randomTeams');
        } } }, '🎲 랜덤 팀 배정'),
        h('button', { class: 'btn btn-ghost', on: { click: async () => { if (await Kit.confirm('모든 팀 배정을 해제할까요?')) action('clearTeams'); } } }, '배정 초기화'),
        h('button', { class: 'btn btn-ghost', on: { click: async () => {
          if (await Kit.confirm('접속이 끊긴 참가자를 명단에서 삭제할까요?', { ok: '정리', danger: true })) action('removeOffline');
        } } }, '오프라인 정리'),
        h('span', { class: 'faint link-sm' }, 'A/B 버튼으로 팀 지정 · 다시 누르면 해제')),
      h('div', { class: 'team-cols' }, col('A', st.teams.A.name), col('B', st.teams.B.name), col(null, '미배정'))));
  }

  // ───────── 채팅 ─────────
  var chatLog = null; // var: 구독 콜백이 선언보다 먼저 올 수 있음
  function chatRow(m) {
    if (m.kind === 'system' || m.kind === 'join') return h('div', { class: 'chat-sys' }, m.text);
    const p = S.state.players.find((x) => x.id === m.uid) || { nickname: m.nickname };
    const time = new Date(m.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    return h('div', { class: 'achat' },
      m.kind === 'admin' ? h('div', { class: 'avatar avatar-sm', style: { background: 'var(--magenta)' } }, '★') : Kit.avatar(p, 'avatar-sm'),
      h('div', { class: 'grow' }, h('div', { class: 'row', style: { gap: '6px' } }, h('strong', null, m.nickname), m.kind === 'admin' ? h('span', { class: 'badge' }, '진행자') : null, h('span', { class: 'faint link-sm' }, time)),
        h('div', { class: 'achat-text' }, m.text)));
  }
  function pageChat(page, force) {
    if (!force && chatLog && chatLog.isConnected) return;
    const input = h('input', { class: 'input', placeholder: '진행자로 메시지 보내기', maxlength: 200 });
    chatLog = h('div', { class: 'admin-chat-log' }, S.chat.length ? S.chat.map(chatRow) : h('div', { class: 'chat-sys chat-empty' }, '아직 메시지가 없어요'));
    mount(page, h('div', { class: 'card stack' },
      h('div', { class: 'row' }, h('span', { class: 'muted grow' }, '게임이 진행 중일 때(타이머가 도는 동안)만 참가자 채팅이 닫혀요.'),
        h('button', { class: 'btn btn-sm btn-danger', on: { click: async () => { if (await Kit.confirm('채팅 기록을 모두 지울까요?', { danger: true, ok: '지우기' })) action('clearChat'); } } }, '채팅 비우기')),
      chatLog,
      h('form', { class: 'row', on: { submit: async (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        if (await action('adminChat', { text })) input.value = '';
      } } }, input, h('button', { class: 'btn btn-primary', type: 'submit' }, '전송'))));
    chatLog.scrollTop = chatLog.scrollHeight;
  }
  function appendChat(m) {
    if (!chatLog || !chatLog.isConnected) return;
    if (chatLog.firstChild && chatLog.firstChild.classList.contains('chat-empty')) chatLog.replaceChildren();
    chatLog.appendChild(chatRow(m));
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  // ───────── QR · 설정 ─────────
  function showBigQr(url) {
    const close = () => bd.remove();
    const bd = h('div', { class: 'qr-full', on: { click: close } },
      h('div', { class: 'qr-full-inner' },
        h('div', { class: 'display-lg' }, S.state.title),
        h('div', { class: 'qr-full-code' }, h('img', { src: qrSrc(url), alt: '입장 QR 코드' })),
        h('div', { class: 'heading-sm' }, '📱 카메라로 QR을 찍어 입장하세요'),
        h('div', { class: 'body-lg muted' }, url),
        h('div', { class: 'faint link-sm' }, '화면을 클릭하면 닫힙니다')));
    document.body.appendChild(bd);
    if (bd.requestFullscreen) bd.requestFullscreen().catch(() => {});
    bd.addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); });
  }

  function pageSettings(page, st) {
    const current = joinUrlOf(st);
    const custom = h('input', { class: 'input', value: st.joinUrl || '', placeholder: defaultJoinUrl() });
    const title = h('input', { class: 'input', value: st.title, maxlength: 30 });
    mount(page, h('div', { class: 'settings-grid' },
      h('div', { class: 'card stack qr-card' },
        h('div', { class: 'qr-box' }, h('img', { src: qrSrc(current), alt: '입장 QR 코드' })),
        h('div', { class: 'center muted', style: { wordBreak: 'break-all' } }, current),
        h('div', { class: 'row row-wrap', style: { justifyContent: 'center' } },
          h('button', { class: 'btn btn-primary', on: { click: () => showBigQr(current) } }, 'QR 크게 보기'),
          h('button', { class: 'btn btn-ghost', on: { click: () => navigator.clipboard && navigator.clipboard.writeText(current).then(() => Kit.toast('링크를 복사했어요.')) } }, '링크 복사'),
          h('a', { class: 'btn btn-ghost', href: qrSrc(current), download: 'join-qr.svg' }, 'QR 저장'))),
      h('div', { class: 'stack' },
        h('div', { class: 'card stack' },
          h('h3', { class: 'heading-sm' }, '입장 주소'),
          h('p', { class: 'muted', style: { margin: 0 } }, '참가자가 QR로 접속할 주소예요. 기본값은 이 사이트의 참가자 화면이에요. 짧은 주소(단축 URL 등)를 쓰고 싶을 때만 바꾸세요.'),
          h('form', { class: 'row', on: { submit: (e) => { e.preventDefault(); action('setJoinUrl', { url: custom.value }); } } },
            custom, h('button', { class: 'btn btn-ghost', type: 'submit' }, '저장')),
          st.joinUrl ? h('button', { class: 'btn btn-sm btn-ghost', style: { justifySelf: 'start' }, on: { click: () => action('setJoinUrl', { url: '' }) } }, '기본 주소로 되돌리기') : null),
        h('div', { class: 'card stack' },
          h('h3', { class: 'heading-sm' }, '행사 이름'),
          h('form', { class: 'row', on: { submit: (e) => { e.preventDefault(); action('setTitle', { title: title.value }).then((ok) => ok && Kit.toast('저장했어요.')); } } },
            title, h('button', { class: 'btn btn-primary', type: 'submit' }, '저장'))),
        h('div', { class: 'card stack' },
          h('h3', { class: 'heading-sm' }, '새 행사 시작'),
          h('p', { class: 'muted', style: { margin: 0 } }, '참가자 명단 · 채팅 · 점수 · 진행 상태 · 출제 기록을 비웁니다. 문제와 게임 설정은 그대로 남아요.'),
          h('button', { class: 'btn btn-danger', style: { justifySelf: 'start' }, on: { click: async () => {
            if (await Kit.confirm('정말 새 행사를 시작할까요? 참가자 명단과 점수가 모두 지워집니다.', { ok: '초기화', danger: true })) {
              if (await action('resetEvent')) Kit.toast('초기화했어요.');
            }
          } } }, '행사 초기화')),
        h('div', { class: 'card stack' },
          h('h3', { class: 'heading-sm' }, '로그아웃'),
          h('div', { class: 'faint link-sm' }, `로그인: ${(B.user() || {}).email || ''}`),
          h('button', { class: 'btn btn-ghost', style: { justifySelf: 'start' }, on: { click: logout } }, '관리자 로그아웃')))));
  }

  // ───────── 콘텐츠 관리 ─────────
  function pageContent(page, st, gid) {
    const mod = window.AdminGames[gid];
    if (!mod || !mod.content) { mount(page, h('div', { class: 'empty' }, '관리할 콘텐츠가 없어요.')); return; }
    const ctx = gameCtx(gid);
    keyed(page, [gid, ctx.content, ctx.settings], () => mod.content(page, ctx, gameApi(gid)));
  }

  // ───────── 시작 ─────────
  const u = await B.ready();
  if (u && !u.isAnonymous) start(); else showLogin();
})();
