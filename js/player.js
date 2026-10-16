/* ==========================================================================
   참가자 화면: 입장(닉네임/사진) → 대기실(명단+채팅) → 게임 선택 → 게임 진행
   데이터는 Firebase Realtime Database (js/backend.js) 에서 실시간으로 받는다.
   ========================================================================== */
import { createBackend } from './backend.js';
import { boot, GAMES, buildState, chatList } from './common.js';

(async function () {
  'use strict';
  const { h, mount, $, store, keyed } = Kit;

  const B = await boot(createBackend, { role: 'player' });
  if (!B) return;
  const user = await B.signInAnon();

  const S = {
    pid: user.uid,
    profile: store.get('pg.profile'), // { nickname, avatar }
    raw: { pub: null, players: null, status: null },
    state: null,
    view: null,
    editing: false,
    wasJoined: false,
    chat: [],
    loadedGames: {},
  };

  const me = () => (S.state && S.pid ? S.state.players.find((p) => p.id === S.pid) : null);

  // ───────── 실시간 구독 ─────────
  const loaded = new Set();
  const onData = (key) => (v) => {
    S.raw[key] = v;
    loaded.add(key);
    S.state = buildState(S.raw);
    if (!loaded.has('pub') || !loaded.has('players')) return; // 첫 데이터가 모두 올 때까지 대기
    // 퇴장 처리 감지: 입장해 있었는데 내 정보가 사라짐
    const m = me();
    if (m) S.wasJoined = true;
    else if (S.wasJoined && S.raw.players !== null) {
      S.wasJoined = false;
      Kit.toast('진행자가 퇴장 처리했어요. 다시 입장할 수 있어요.', 'error');
    }
    render();
  };
  B.on('public', onData('pub'), () => showDenied());
  B.on('players', onData('players'));
  B.on('status', onData('status'));
  B.on('chat', (v) => {
    const list = chatList(v);
    const fresh = list.length < S.chat.length || (S.chat.length && list.length && list[0].id !== S.chat[0].id);
    const added = list.slice(S.chat.length);
    S.chat = list;
    if (fresh || !S.chat.length) paintChat(true);
    else added.forEach(appendChat);
  });
  B.presence(`status/${S.pid}`);
  B.on('.info/connected', (v) => { const c = $('#conn'); if (c) c.classList.toggle('on', !!v); });

  function showDenied() {
    mount($('#view'), h('div', { class: 'card center' }, h('h2', { class: 'heading-sm' }, '접속 권한 오류'),
      h('p', { class: 'muted' }, 'Firebase 보안 규칙 또는 익명 로그인 설정을 확인해 주세요. (README의 Firebase 설정 단계)')));
  }

  async function join(profile) {
    const nickname = String(profile.nickname || '').replace(/\s+/g, ' ').trim().slice(0, 12);
    if (!nickname) { Kit.toast('닉네임을 입력해 주세요.', 'error'); return false; }
    const dup = (S.state ? S.state.players : []).find((p) => p.nickname === nickname && p.id !== S.pid);
    if (dup) { Kit.toast('이미 사용 중인 닉네임이에요. 다른 닉네임을 써주세요.', 'error'); return false; }
    const isNew = !me();
    try {
      const data = { nickname, avatar: profile.avatar || null };
      if (isNew) data.joinedAt = B.TIMESTAMP;
      await B.update(`players/${S.pid}`, data);
      B.set(`status/${S.pid}`, true).catch(() => {});
      S.profile = { nickname, avatar: profile.avatar || null };
      store.set('pg.profile', S.profile);
      S.editing = false;
      S.view = null;
      if (isNew && S.state && S.state.phase === 'lobby') {
        B.push('chat', { uid: S.pid, kind: 'join', nickname, text: `${nickname} 님이 입장했어요 👋`, at: B.TIMESTAMP }).catch(() => {});
      }
      render();
      return true;
    } catch (err) {
      Kit.toast(`입장하지 못했어요: ${err.message}`, 'error');
      return false;
    }
  }

  // ───────── 렌더 ─────────
  function render() {
    const st = S.state;
    if (!st || !loaded.has('pub') || !loaded.has('players')) return;
    $('#brand-title').textContent = st.title;
    document.title = st.title;
    const m = me();

    if (!m || S.editing) {
      $('#scorebar-host').hidden = true;
      $('#me-chip').hidden = true;
      if (S.view !== 'join') renderJoin();
      return;
    }

    // 상단: 내 정보 + 스코어
    const chip = $('#me-chip');
    chip.hidden = false;
    keyed(chip, [m, st.teams[m.team] && st.teams[m.team].name, st.phase], (el) => {
      mount(el, Kit.avatar(m, 'avatar-sm'), h('span', { class: 'ellipsis' }, m.nickname),
        m.team ? h('span', { class: `badge badge-${m.team.toLowerCase()}` }, st.teams[m.team].name) : null);
      el.onclick = st.phase === 'lobby' ? () => { S.editing = true; render(); } : null;
      el.title = st.phase === 'lobby' ? '프로필 수정' : '';
    });
    const sb = $('#scorebar-host');
    sb.hidden = false;
    keyed(sb, [st.teams, m.team], (el) => mount(el, Kit.scoreboard(st.teams, m.team)));

    if (st.phase === 'lobby') renderLobby(st);
    else if (st.phase === 'select') renderSelect(st);
    else renderGame(st, m);
  }

  // ───────── 입장 ─────────
  function renderJoin() {
    S.view = 'join';
    let avatarData = S.profile ? S.profile.avatar : null;
    const nick = h('input', { class: 'input input-lg', maxlength: 12, placeholder: '닉네임 (최대 12자)', value: (S.profile && S.profile.nickname) || '', autocomplete: 'off', enterkeyhint: 'go' });
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
    const preview = h('div', { class: 'avatar-picker-preview' });
    const removeBtn = h('button', { type: 'button', class: 'btn btn-sm btn-ghost' }, '사진 지우기');

    const paintPreview = () => {
      mount(preview, avatarData
        ? h('img', { class: 'avatar avatar-xl', src: avatarData, alt: '프로필 사진' })
        : h('div', { class: 'avatar avatar-xl avatar-placeholder' }, h('span', null, '📷')));
      removeBtn.hidden = !avatarData;
    };
    paintPreview();

    file.addEventListener('change', async () => {
      try {
        avatarData = await Kit.resizeImage(file.files[0], { max: 256, square: true, quality: 0.82 });
        paintPreview();
      } catch (e) { Kit.toast(e.message, 'error'); }
      file.value = '';
    });
    removeBtn.addEventListener('click', () => { avatarData = null; paintPreview(); });

    const submit = h('button', { type: 'submit', class: 'btn btn-green btn-lg btn-block' }, S.editing ? '저장하기' : '입장하기');
    const form = h('form', { class: 'stack', on: { submit: async (e) => {
      e.preventDefault();
      if (!nick.value.trim()) { Kit.toast('닉네임을 입력해 주세요.', 'error'); nick.focus(); return; }
      submit.disabled = true;
      const ok = await join({ nickname: nick.value, avatar: avatarData });
      submit.disabled = false;
      if (ok && S.editing) { S.editing = false; }
    } } },
      h('div', { class: 'avatar-picker' },
        h('button', { type: 'button', class: 'avatar-picker-btn', 'aria-label': '프로필 사진 선택', on: { click: () => file.click() } },
          preview, h('span', { class: 'avatar-picker-badge' }, '＋')),
        h('div', { class: 'row', style: { justifyContent: 'center' } },
          h('button', { type: 'button', class: 'btn btn-sm btn-ghost', on: { click: () => file.click() } }, '사진 선택'), removeBtn),
        file),
      h('div', null, h('label', { class: 'label' }, '닉네임'), nick),
      submit,
      S.editing ? h('button', { type: 'button', class: 'btn btn-ghost btn-block', on: { click: () => { S.editing = false; S.view = null; render(); } } }, '취소') : null);

    mount($('#view'),
      h('section', { class: 'join' },
        h('div', { class: 'join-hero' },
          h('div', { class: 'eyebrow' }, S.editing ? 'EDIT PROFILE' : 'WELCOME'),
          h('h1', { class: 'display-lg' }, S.state ? S.state.title : 'GAME NIGHT'),
          h('p', { class: 'body-lg muted' }, S.editing ? '닉네임과 프로필 사진을 바꿀 수 있어요.' : '닉네임과 프로필 사진을 정하고 입장하세요!')),
        h('div', { class: 'card card-xl join-card' }, form)));
    if (!S.editing && !nick.value) setTimeout(() => nick.focus(), 50);
  }

  // ───────── 대기실 ─────────
  var chatLog = null; // var: 구독 콜백이 선언보다 먼저 올 수 있음
  function renderLobby(st) {
    if (S.view !== 'lobby') {
      S.view = 'lobby';
      mount($('#view'),
        h('section', { class: 'lobby' },
          h('div', { class: 'lobby-hero' },
            h('div', { class: 'eyebrow' }, 'WAITING ROOM'),
            h('h1', { class: 'display-md' }, '곧 시작해요!'),
            h('p', { class: 'muted' }, '모두 입장할 때까지 자유롭게 이야기 나눠요.')),
          h('div', { class: 'lobby-grid' },
            h('div', { class: 'card players-card' },
              h('div', { class: 'row' }, h('h2', { class: 'heading-sm' }, '대기자 명단'), h('span', { id: 'player-count', class: 'badge' }, '0')),
              h('div', { id: 'player-grid', class: 'player-grid' })),
            chatCard('채팅'))));
      paintChat(true);
    }
    const online = st.players.filter((p) => p.online);
    $('#player-count').textContent = `${online.length}명`;
    keyed($('#player-grid'), st.players, (el) => mount(el, st.players.length
      ? st.players.map((p) => h('div', { class: `player-tile ${p.online ? '' : 'offline'} ${p.id === S.pid ? 'is-me' : ''}` },
        h('div', { class: 'avatar-wrap' }, Kit.avatar(p, 'avatar-lg'), h('span', { class: `dot ${p.online ? 'on' : ''}` })),
        h('div', { class: 'player-name ellipsis' }, p.nickname),
        p.team ? h('span', { class: `badge badge-${p.team.toLowerCase()}` }, st.teams[p.team].name) : null))
      : h('div', { class: 'empty' }, '아직 아무도 없어요')));
  }

  /** 채팅 카드 (대기실 · 게임 선택 · 게임 사이 쉬는 시간에 공통 사용) */
  function chatCard(title, hint) {
    const input = h('input', { class: 'input', maxlength: 200, placeholder: '메시지 보내기', autocomplete: 'off', enterkeyhint: 'send' });
    const send = h('button', { type: 'submit', class: 'btn btn-primary' }, '전송');
    chatLog = h('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite' });
    return h('div', { class: 'card chat-card' },
      h('div', { class: 'row' }, h('h2', { class: 'heading-sm grow' }, title), hint ? h('span', { class: 'faint link-sm' }, hint) : null),
      chatLog,
      h('form', { class: 'chat-form row', on: { submit: async (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        const m = me();
        try { await B.push('chat', { uid: S.pid, kind: 'user', nickname: m.nickname, team: m.team || null, text: text.slice(0, 200), at: B.TIMESTAMP }); }
        catch (err) { Kit.toast('지금은 채팅을 보낼 수 없어요.', 'error'); input.value = text; }
        input.focus();
      } } }, input, send));
  }

  /** 게임이 실제로 진행 중(타이머가 돌고 있음)인지 — 이때만 채팅을 닫는다 */
  function gamePlaying(st) {
    if (st.phase !== 'game' || !st.game) return false;
    const g = st.game;
    return (g.round && g.round.status === 'playing') || g.status === 'playing';
  }

  /** slot 안에 채팅 카드를 (없으면) 붙이고, 진행 중이면 숨긴다 */
  function syncChatSlot(slot, show) {
    if (!slot) return;
    slot.hidden = !show;
    if (show && !slot.firstChild) { mount(slot, chatCard('채팅', '게임이 진행 중일 땐 잠시 닫혀요')); paintChat(true); }
    if (show && slot.firstChild) { const log = slot.querySelector('.chat-log'); if (log !== chatLog) { chatLog = log; paintChat(true); } }
  }

  function chatItem(m) {
    if (m.kind === 'system' || m.kind === 'join') return h('div', { class: 'chat-sys' }, m.text);
    const players = S.state ? S.state.players : [];
    const p = players.find((x) => x.id === m.uid) || { nickname: m.nickname, team: m.team };
    const mine = m.uid && m.uid === S.pid;
    const time = new Date(m.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    if (m.kind === 'admin') {
      return h('div', { class: 'chat-msg admin' },
        h('div', { class: 'avatar avatar-sm', style: { background: 'var(--magenta)' } }, '★'),
        h('div', { class: 'bubble-wrap' }, h('div', { class: 'chat-meta' }, h('span', { class: 'badge' }, '진행자'), h('span', { class: 'faint' }, time)),
          h('div', { class: 'bubble' }, m.text)));
    }
    return h('div', { class: `chat-msg ${mine ? 'mine' : ''}` },
      mine ? null : Kit.avatar(p, 'avatar-sm'),
      h('div', { class: 'bubble-wrap' },
        h('div', { class: 'chat-meta' }, mine ? null : h('strong', null, m.nickname), h('span', { class: 'faint' }, time)),
        h('div', { class: 'bubble' }, m.text)));
  }

  function paintChat(full) {
    if (!chatLog || !chatLog.isConnected) return;
    if (full) mount(chatLog, S.chat.length ? S.chat.map(chatItem) : h('div', { class: 'chat-sys' }, '첫 메시지를 남겨보세요 💬'));
    chatLog.scrollTop = chatLog.scrollHeight;
  }
  function appendChat(m) {
    if (!chatLog || !chatLog.isConnected) return;
    const nearBottom = chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight < 120;
    if (S.chat.length === 1) chatLog.replaceChildren();
    chatLog.appendChild(chatItem(m));
    while (chatLog.children.length > 200) chatLog.firstChild.remove();
    if (nearBottom || m.uid === S.pid) chatLog.scrollTop = chatLog.scrollHeight;
  }

  // ───────── 게임 선택 ─────────
  function renderSelect(st) {
    if (S.view !== 'select') $('#view')._key = null;
    S.view = 'select';
    keyed($('#view'), ['select', st.games], (el) => { mount(el,
      h('section', { class: 'select' },
        h('div', { class: 'card-gradient select-hero' },
          h('div', { class: 'eyebrow', style: { color: 'rgba(255,255,255,.85)' } }, 'GAME SELECT'),
          h('h1', { class: 'display-md' }, '다음 게임은?'),
          h('p', { class: 'body-lg' }, '진행자가 게임을 고르고 있어요. 두근두근!')),
        h('div', { class: 'game-list' }, st.games.map((g, i) =>
          h('div', { class: `game-card c-${g.color || 'primary'}`, style: { animationDelay: `${i * 80}ms` } },
            h('div', { class: 'game-icon' }, g.icon || '🎮'),
            h('div', { class: 'grow' }, h('div', { class: 'heading-sm' }, g.name), h('div', { class: 'muted' }, g.description || ''))))),
        h('div', { id: 'chat-slot', class: 'chat-slot' })));
      syncChatSlot($('#chat-slot'), true); });
  }

  // ───────── 게임 진행 ─────────
  function loadGame(id) {
    if (S.loadedGames[id]) return S.loadedGames[id];
    S.loadedGames[id] = new Promise((resolve) => {
      document.head.appendChild(h('link', { rel: 'stylesheet', href: `games/${id}/style.css` }));
      const s = h('script', { src: `games/${id}/player.js` });
      s.onload = resolve;
      s.onerror = resolve;
      document.head.appendChild(s);
    });
    return S.loadedGames[id];
  }

  async function renderGame(st, m) {
    const id = st.currentGameId;
    const meta = st.games.find((g) => g.id === id) || { name: id, icon: '🎮' };
    if (S.view !== `game:${id}`) {
      S.view = `game:${id}`;
      mount($('#view'), h('section', { class: 'game' },
        h('div', { class: 'game-head row' }, h('span', { class: 'game-head-icon' }, meta.icon), h('span', { class: 'eyebrow' }, meta.name)),
        h('div', { id: 'game-root', class: 'game-root' }),
        h('div', { id: 'chat-slot', class: 'chat-slot' })));
    }
    syncChatSlot($('#chat-slot'), !gamePlaying(st));
    await loadGame(id);
    const root = $('#game-root');
    const view = window.GameViews[id];
    if (!root || !view || S.view !== `game:${id}`) return;
    view.render(root, st.game, { state: st, me: m, Kit, teamName: (t) => Kit.teamName(st, t), role: 'player' });
  }

  // ───────── 시작 ─────────
  mount($('#view'), h('div', { class: 'empty', style: { marginTop: '20vh' } }, '연결 중…'));
})();
