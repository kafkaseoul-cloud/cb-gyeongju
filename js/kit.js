/* ==========================================================================
   Kit — 참가자/관리자/게임 모듈이 함께 쓰는 공통 유틸
   ========================================================================== */
(function () {
  'use strict';

  // ───────── DOM ─────────
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') {
          for (const [sk, sv] of Object.entries(v)) {
            if (sk.startsWith('--')) el.style.setProperty(sk, sv); // CSS 변수 (팀 색 등)
            else el.style[sk] = sv;
          }
        }
        else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k === 'html') el.innerHTML = v; // 신뢰된 정적 마크업에만 사용
        else if (k in el && typeof v !== 'string') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    append(el, children);
    return el;
  }
  function append(el, children) {
    for (const c of children.flat(Infinity)) {
      if (c === null || c === undefined || c === false) continue;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  function mount(el, ...children) { el.replaceChildren(); return append(el, children); }
  const $ = (sel, root = document) => root.querySelector(sel);

  // ───────── 저장소 (브라우저마다 실패할 수 있어 try/catch) ─────────
  const store = {
    get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 무시 */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* 무시 */ } },
  };

  // ───────── 서버 시계 (Backend.now 로 교체됨) ─────────
  let clock = () => Date.now();
  function setClock(fn) { clock = fn; }
  const now = () => clock();

  function remaining(t) {
    if (!t) return 0;
    return t.running && t.endsAt ? Math.max(0, t.endsAt - now()) : Math.max(0, t.remainingMs || 0);
  }
  function fmt(ms) {
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  /** 자동으로 줄어드는 타이머 엘리먼트 */
  function timerEl(t, cls = '') {
    const el = h('div', { class: `timer js-timer ${cls}` });
    el._timer = t;
    paintTimer(el);
    return el;
  }
  function paintTimer(el) {
    const ms = remaining(el._timer);
    const txt = fmt(ms);
    if (el.textContent !== txt) el.textContent = txt;
    el.classList.toggle('is-low', ms > 0 && ms <= 10000 && !!(el._timer && el._timer.running));
    el.classList.toggle('is-over', ms <= 0);
  }
  setInterval(() => document.querySelectorAll('.js-timer').forEach(paintTimer), 200);

  // ───────── 아바타 ─────────
  const AVATAR_COLORS = ['#5865f2', '#ec48bd', '#8b5cf6', '#00b0f4', '#f97316', '#14b8a6', '#eab308', '#ef4444'];
  function colorFor(str) {
    let x = 0;
    for (const ch of String(str)) x = (x * 31 + ch.codePointAt(0)) >>> 0;
    return AVATAR_COLORS[x % AVATAR_COLORS.length];
  }
  function avatar(p, size = '') {
    const ring = p && p.team ? ' ring-tc' : '';
    const tc = p && p.team ? { '--tc': teamColor(p.team) } : {};
    if (p && p.avatar) return h('img', { class: `avatar ${size}${ring}`, src: p.avatar, alt: '', loading: 'lazy', style: tc });
    const name = (p && p.nickname) || '?';
    return h('div', { class: `avatar ${size}${ring}`, style: { ...tc, background: colorFor(name) } }, [...name][0].toUpperCase());
  }

  // ───────── 팀 (최대 8팀: A~H, 팀마다 고정 색) ─────────
  const TEAM_IDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const TEAM_COLORS = { A: '#5e5ce6', B: '#ff375f', C: '#30d158', D: '#ff9f0a', E: '#64d2ff', F: '#bf5af2', G: '#ffd60a', H: '#ac8e68' };
  const teamColor = (id) => TEAM_COLORS[id] || '#8e8e93';
  /** teams 객체 → 정렬된 배열 [{ id, name, score, color }] */
  const teamList = (teams) => Object.entries(teams || {})
    .filter(([id, t]) => t && TEAM_IDS.includes(id))
    .map(([id, t]) => ({ id, name: t.name || `${id}팀`, score: Number(t.score) || 0, color: teamColor(id) }))
    .sort((a, b) => TEAM_IDS.indexOf(a.id) - TEAM_IDS.indexOf(b.id));
  /** 팀 색 배지 */
  const teamBadge = (state, id) => (id && state.teams[id]
    ? h('span', { class: 'badge tc', style: { '--tc': teamColor(id) } }, state.teams[id].name) : null);

  // ───────── 피드백 ─────────
  function toast(msg, kind = '') {
    let host = $('.toast-host');
    if (!host) document.body.appendChild(host = h('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' }));
    const t = h('div', { class: `toast ${kind}` }, msg);
    host.appendChild(t);
    setTimeout(() => t.remove(), kind === 'error' ? 3800 : 2400);
  }

  let flashTimer = null;
  function flash({ title, sub, kind = 'info', ms = 1800 }) {
    document.querySelectorAll('.flash').forEach((f) => f.remove());
    clearTimeout(flashTimer);
    const el = h('div', { class: 'flash' }, h('div', { class: `flash-card ${kind}` }, h('div', { class: 't' }, title), sub ? h('div', { class: 's' }, sub) : null));
    document.body.appendChild(el);
    flashTimer = setTimeout(() => el.remove(), ms);
  }

  function confirmModal(message, { ok = '확인', danger = false } = {}) {
    return new Promise((resolve) => {
      const close = (v) => { bd.remove(); resolve(v); };
      const bd = h('div', { class: 'modal-backdrop', on: { click: (e) => { if (e.target === bd) close(false); } } },
        h('div', { class: 'modal stack' },
          h('div', { class: 'body-lg' }, message),
          h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
            h('button', { class: 'btn btn-ghost', on: { click: () => close(false) } }, '취소'),
            h('button', { class: `btn ${danger ? 'btn-magenta' : 'btn-primary'}`, on: { click: () => close(true) } }, ok))));
      document.body.appendChild(bd);
    });
  }

  // ───────── 이미지 ─────────
  /** 파일을 정사각형 크롭 or 긴 변 기준으로 줄여 dataURL(JPEG)로 반환 */
  function resizeImage(file, { max = 1024, square = false, quality = 0.85 } = {}) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('이미지 파일을 선택해 주세요.'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
        if (square) { const m = Math.min(sw, sh); sx = (sw - m) / 2; sy = (sh - m) / 2; sw = sh = m; }
        const scale = Math.min(1, max / Math.max(sw, sh));
        const c = document.createElement('canvas');
        c.width = Math.round(sw * scale); c.height = Math.round(sh * scale);
        c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 읽을 수 없어요.')); };
      img.src = url;
    });
  }

  // ───────── 스코어보드 ─────────
  const lastScores = {};
  function scoreboard(teams, myTeam) {
    const list = teamList(teams);
    if (!list.length) return null;
    const side = (t, flip) => {
      const pts = h('div', { class: 'pts' }, t.score);
      if (lastScores[t.id] !== undefined && lastScores[t.id] !== t.score) pts.classList.add('score-bump');
      lastScores[t.id] = t.score;
      return h('div', { class: `score-team tc ${flip ? 'flip' : ''}`, style: { '--tc': t.color } },
        h('div', { class: 'row', style: { gap: '0', minWidth: 0 } },
          h('span', { class: 'name' }, t.name), myTeam === t.id ? h('span', { class: 'mine' }, 'MY') : null),
        pts);
    };
    if (list.length === 2) return h('div', { class: 'scorebar' }, side(list[0]), h('div', { class: 'score-vs' }, 'VS'), side(list[1], true));
    return h('div', { class: 'scorebar scorebar-n' }, list.map((t) => side(t)));
  }

  /** 개인 순위 (점수 높은 순, 동점은 같은 순위) */
  function rankPlayers(players) {
    const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0) || a.joinedAt - b.joinedAt);
    let rank = 0, prev = null;
    return sorted.map((p, i) => {
      if (p.score !== prev) { rank = i + 1; prev = p.score; }
      return { ...p, rank };
    });
  }

  /** 섹션 단위 부분 렌더: 데이터가 바뀌었을 때만 다시 그려 입력 포커스를 지킨다 */
  function keyed(el, data, render) {
    const key = JSON.stringify(data);
    if (el._key === key) return false;
    el._key = key;
    render(el);
    return true;
  }

  const teamName = (state, team) => (team && state.teams[team] ? state.teams[team].name : '미배정');
  /** 'B' → 'b' 처럼 예전 팀 클래스가 필요한 곳을 위한 호환 */
  const tcStyle = (id) => ({ '--tc': teamColor(id) });

  /** Realtime DB는 배열을 객체로 돌려줄 수 있어 항상 배열로 맞춘다 */
  const arr = (v) => (Array.isArray(v) ? v.filter((x) => x != null) : v && typeof v === 'object' ? Object.values(v) : []);
  const uid = () => Math.random().toString(36).slice(2, 10);

  window.Kit = {
    h, append, mount, $, store, setClock, now, remaining, fmt, timerEl,
    avatar, colorFor, toast, flash, confirm: confirmModal, resizeImage, scoreboard, keyed, teamName, arr, uid,
    TEAM_IDS, teamColor, teamList, teamBadge, tcStyle, rankPlayers,
  };
  window.GameViews = window.GameViews || {};
  window.AdminGames = window.AdminGames || {};
})();
