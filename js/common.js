/* ==========================================================================
   참가자/관리자 화면 공통: 백엔드 시작, 게임 목록, DB 데이터 → 화면 상태 변환
   ========================================================================== */

/** 게임 목록 — 새 게임은 games/games.json 에 한 줄 추가 + games/<id>/ 폴더 */
export const GAMES = await fetch('games/games.json', { cache: 'no-cache' }).then((r) => r.json());

export const DEFAULT_PUBLIC = {
  title: 'GAME NIGHT',
  phase: 'lobby',
  currentGameId: null,
  teams: { A: { name: 'A팀', score: 0 }, B: { name: 'B팀', score: 0 } },
};

/** 백엔드를 만들고, 설정이 안 되어 있으면 안내 화면을 보여준다 */
export async function boot(createBackend, { role }) {
  let B = null;
  try {
    B = await createBackend();
  } catch (e) {
    console.error(e);
    showSetupNeeded(role, `Firebase에 연결하지 못했어요: ${e.message}`);
    return null;
  }
  if (!B) { showSetupNeeded(role); return null; }
  Kit.setClock(B.now);
  if (B.mode === 'mock') {
    document.body.appendChild(Kit.h('div', { class: 'mock-banner' }, '테스트 모드 (이 브라우저 안에서만 동작)'));
  }
  return B;
}

function showSetupNeeded(role, detail) {
  const { h, mount } = Kit;
  const host = document.querySelector('#view') || document.querySelector('#login') || document.body;
  if (host.hidden !== undefined) host.hidden = false;
  mount(host, h('div', { class: 'card card-xl stack', style: { maxWidth: '560px', margin: '12vh auto 0' } },
    h('div', { class: 'eyebrow' }, 'SETUP'),
    h('h1', { class: 'heading-lg' }, role === 'admin' ? 'Firebase 설정이 필요해요' : '아직 준비 중이에요'),
    h('p', { class: 'muted', style: { margin: 0 } }, role === 'admin'
      ? 'config.js 파일에 Firebase 설정값을 넣어 주세요. 방법은 README.md의 "Firebase 설정"에 있어요.'
      : '진행자가 아직 게임을 준비하고 있어요. 잠시 후 다시 접속해 주세요.'),
    detail ? h('p', { class: 'faint link-sm', style: { margin: 0 } }, detail) : null,
    role === 'admin' ? h('a', { class: 'btn btn-ghost', href: '?mock=1' }, 'Firebase 없이 테스트 모드로 둘러보기') : null));
}

/** DB의 public / players / status 를 화면이 쓰는 하나의 상태로 합친다 */
export function buildState({ pub, players, status }) {
  const p = { ...DEFAULT_PUBLIC, ...(pub || {}) };
  const teams = {
    A: { ...DEFAULT_PUBLIC.teams.A, ...((p.teams || {}).A || {}) },
    B: { ...DEFAULT_PUBLIC.teams.B, ...((p.teams || {}).B || {}) },
  };
  const online = status || {};
  const list = Object.entries(players || {})
    .filter(([, v]) => v && v.nickname)
    .map(([id, v]) => ({ id, nickname: v.nickname, avatar: v.avatar || null, team: v.team || null, online: !!online[id], joinedAt: v.joinedAt || 0 }))
    .sort((a, b) => a.joinedAt - b.joinedAt);
  const gid = p.phase === 'game' ? p.currentGameId : null;
  return {
    title: p.title,
    phase: p.phase,
    teams,
    players: list,
    games: GAMES,
    currentGameId: gid,
    game: gid ? ((p.games || {})[gid] || {}) : null,
    raw: p,
  };
}

/** chat 노드 → 시간순 배열 (최근 200개) */
export function chatList(v) {
  return Object.entries(v || {})
    .map(([id, m]) => ({ id, ...m }))
    .sort((a, b) => (a.at || 0) - (b.at || 0) || (a.id < b.id ? -1 : 1))
    .slice(-200);
}

/** 사이트 기준 참가자 입장 주소 (admin.html → index 경로) */
export function defaultJoinUrl() {
  const u = new URL('./', location.href);
  u.search = '';
  if (new URLSearchParams(location.search).has('mock')) u.search = '?mock=1';
  return u.toString();
}
