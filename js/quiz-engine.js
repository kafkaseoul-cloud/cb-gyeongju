/* ==========================================================================
   QuizEngine — "랜덤 출제 + 정답/패스 + 제한시간" 진행 로직 (관리자 브라우저에서 실행)
   몸으로 말해요, 인물 퀴즈가 함께 쓴다.

   pub  (모두 공개)   : status, mode(team|solo), team, number, stats, timer, currentImage, currentAnswer, currentHint,
                        lastResult, history(종료 시)
   mode = 'team' : 도전 팀이 맞히면 팀 +1
          'solo' : 개인전 — 진행자가 맞힌 사람을 고르면 그 사람 +1 (소속 팀이 있으면 팀도 +1)
   priv (관리자 전용) : current{id,answer,image}, history[], seq
   played (관리자 전용): 이미 출제된 문제 {qid:true} — 라운드·팀·테마 변경과 상관없이 유지되어
                        앞 팀이 진행한 문제가 뒤 팀에게 다시 나오지 않는다. (행사 초기화/출제 기록 초기화로만 비움)
   모든 함수는 새 상태를 돌려주고, 호출한 쪽이 DB에 한 번에 기록한다.
   ========================================================================== */
(function () {
  'use strict';

  // ───────── 타이머 (서버 시각 기준) ─────────
  const Timer = {
    create: (duration) => ({ duration, running: false, endsAt: null, remainingMs: duration * 1000 }),
    start(t, now) { if (t.running || t.remainingMs <= 0) return t; return { ...t, running: true, endsAt: now + t.remainingMs }; },
    pause(t, now) { if (!t.running) return t; return { ...t, running: false, endsAt: null, remainingMs: Math.max(0, t.endsAt - now) }; },
    reset(t) { return { ...t, running: false, endsAt: null, remainingMs: t.duration * 1000 }; },
    end(t) { return { ...t, running: false, endsAt: null, remainingMs: 0 }; },
    adjust(t, sec, now) {
      const d = Number(sec) * 1000;
      if (t.running) return { ...t, endsAt: Math.max(now + 1000, t.endsAt + d) };
      return { ...t, remainingMs: Math.max(0, t.remainingMs + d) };
    },
    setDuration(t, sec) {
      const next = { ...t, duration: sec };
      if (!t.running) next.remainingMs = sec * 1000;
      return next;
    },
    expired: (t, now) => !!(t && t.running && t.endsAt && now >= t.endsAt),
  };

  const LIVE = ['playing', 'paused'];
  const clone = (x) => JSON.parse(JSON.stringify(x == null ? null : x));
  const arr = (v) => Kit.arr(v);

  function initial(duration, { mode = 'team', team = null } = {}) {
    return {
      pub: { status: 'ready', mode, team, number: 0, stats: { correct: 0, pass: 0 }, timer: Timer.create(duration), currentImage: null, currentAnswer: null, lastResult: null, history: null, exhausted: false },
      priv: { current: null, history: [], seq: 0 },
    };
  }

  /** DB에서 읽은 값의 빈 필드를 채워 안전한 상태로 만든다 */
  function normalize(pub, priv, duration, defaults = {}) {
    const base = initial(duration, defaults);
    const p = { ...base.pub, ...(pub || {}) };
    p.stats = { correct: 0, pass: 0, ...(p.stats || {}) };
    p.timer = { ...base.pub.timer, ...(p.timer || {}) };
    const q = { ...base.priv, ...(priv || {}) };
    q.history = arr(q.history);
    return { pub: p, priv: q };
  }

  /** 아직 출제되지 않은 문제 목록 */
  const remainingOf = (pool, played) => pool.filter((q) => !(played && played[q.id]));

  /** 다음 문제 뽑기. 남은 문제가 없으면 false (같은 문제를 다시 내지 않는다) */
  function draw(r, pool, played, revealImage, revealAnswer, hintOf) {
    const cands = remainingOf(pool, played);
    if (!cands.length) {
      r.priv.current = null; r.pub.currentImage = null; r.pub.currentAnswer = null; r.pub.currentHint = null;
      return false;
    }
    const q = cands[Math.floor(Math.random() * cands.length)];
    played[q.id] = true; // 화면에 나간 순간 '출제됨' (정답이 공개되므로 남은 시간에 뜬 문제도 포함)
    r.priv.current = { id: q.id, answer: q.answer, image: q.image || null };
    r.pub.number += 1;
    r.pub.currentImage = revealImage ? (q.image || null) : null;
    r.pub.currentAnswer = revealAnswer ? q.answer : null;
    r.pub.currentHint = hintOf ? hintOf(q) : null; // 초성 퀴즈: 초성만 공개
    return true;
  }

  const stats = (history) => ({
    correct: history.filter((h) => h.result === 'correct').length,
    pass: history.filter((h) => h.result === 'pass').length,
  });

  /**
   * 명령 실행
   * @param {object} opts.played  이미 출제된 문제 {qid:true} (admin/played/<게임>/<테마>)
   * @param {string[]} opts.teams   현재 팀 id 목록
   * @param {object[]} opts.players 참가자 [{id, nickname, team}] (개인전 정답자 확인용)
   * @param {function} opts.hintOf  문제 → 참가자에게 보여줄 힌트 (초성 등)
   * @returns {{pub, priv, played, score: null | {team, delta} | {playerId, delta}}}
   */
  function apply(type, payload, state, { pool, now, revealImage, revealAnswer = false, played = {}, teams = [], players = [], hintOf = null }) {
    const r = { pub: clone(state.pub), priv: clone(state.priv) };
    played = { ...(played || {}) };
    let score = null;
    const p = r.pub;

    switch (type) {
      case 'start': {
        if (p.status === 'ended') Object.assign(r, reset(r));
        if (r.pub.status !== 'ready') break;
        if (!pool.length) throw new Error('등록된 문제가 없습니다. 콘텐츠 관리에서 문제를 추가하세요.');
        if (!remainingOf(pool, played).length) throw new Error('이 테마의 문제를 모두 출제했어요. 다른 테마를 고르거나 "출제 기록 초기화"를 눌러 주세요.');
        if (r.pub.mode !== 'solo' && !teams.includes(r.pub.team)) {
          if (!teams.length) throw new Error('팀이 없어요. 개인전으로 바꾸거나 상단에서 팀을 추가하세요.');
          r.pub.team = teams[0];
        }
        draw(r, pool, played, revealImage, revealAnswer, hintOf);
        r.pub.status = 'playing';
        r.pub.timer = Timer.start(r.pub.timer, now);
        break;
      }
      case 'pause':
        if (p.status !== 'playing') break;
        p.timer = Timer.pause(p.timer, now); p.status = 'paused';
        break;
      case 'resume':
        if (p.status !== 'paused') break;
        p.status = 'playing'; p.timer = Timer.start(p.timer, now);
        break;
      case 'correct':
      case 'pass': {
        if (!r.priv.current || !LIVE.includes(p.status)) throw new Error('진행 중인 문제가 없습니다.');
        const done = r.priv.current;
        const solo = p.mode === 'solo';
        let who = null;
        if (type === 'correct' && solo) {
          who = players.find((x) => x.id === payload.playerId);
          if (!who) throw new Error('맞힌 사람을 골라 주세요.');
        }
        const team = solo ? (who ? who.team || null : null) : p.team;
        const entry = { qid: done.id, answer: done.answer, result: type, team: team || null };
        if (who) { entry.playerId = who.id; entry.nickname = who.nickname; }
        r.priv.history.push(entry);
        r.priv.seq = (r.priv.seq || 0) + 1;
        p.lastResult = { type, answer: done.answer, team: team || null, playerId: who ? who.id : null, nickname: who ? who.nickname : null, seq: r.priv.seq, at: now };
        if (type === 'correct') score = who ? { playerId: who.id, delta: 1 } : (team ? { team, delta: 1 } : null);
        if (!draw(r, pool, played, revealImage, revealAnswer, hintOf)) {
          // 남은 문제가 없으면 반복 출제하지 않고 라운드를 끝낸다
          p.timer = Timer.end(p.timer); p.status = 'ended'; p.exhausted = true;
        }
        break;
      }
      case 'undo': {
        const last = r.priv.history.pop();
        if (!last) throw new Error('되돌릴 기록이 없습니다.');
        if (last.result === 'correct') score = last.playerId ? { playerId: last.playerId, delta: -1 } : (last.team ? { team: last.team, delta: -1 } : null);
        p.lastResult = null;
        break;
      }
      case 'end':
        p.timer = Timer.end(p.timer); p.status = 'ended';
        break;
      case 'expire':
        if (p.status !== 'playing') break;
        p.timer = Timer.end(p.timer); p.status = 'ended';
        break;
      case 'newRound':
        Object.assign(r, reset(r));
        break;
      case 'setTeam':
        if (!teams.includes(payload.team)) throw new Error('없는 팀입니다.');
        p.team = payload.team;
        break;
      case 'setMode':
        if (!['team', 'solo'].includes(payload.mode)) throw new Error('알 수 없는 방식입니다.');
        if (LIVE.includes(p.status)) throw new Error('라운드 진행 중에는 바꿀 수 없어요. 라운드를 끝낸 뒤 바꿔 주세요.');
        p.mode = payload.mode;
        if (p.mode === 'team' && !teams.includes(p.team)) p.team = teams[0] || null;
        break;
      case 'adjustTime':
        p.timer = Timer.adjust(p.timer, payload.seconds, now);
        break;
      case 'setDuration':
        p.timer = Timer.setDuration(p.timer, payload.seconds);
        break;
      default:
        throw new Error(`알 수 없는 명령: ${type}`);
    }

    r.pub.stats = stats(r.priv.history);
    r.pub.history = r.pub.status === 'ended'
      ? r.priv.history.map(({ answer, result, team, nickname }) => ({ answer, result, team: team || null, nickname: nickname || null })) : null;
    if (!LIVE.includes(r.pub.status)) { r.pub.currentImage = null; r.pub.currentAnswer = null; r.pub.currentHint = null; }
    ['currentAnswer', 'currentHint', 'team', 'currentImage'].forEach((k) => { if (r.pub[k] === undefined) r.pub[k] = null; });
    delete r.priv.used; // 이전 버전의 라운드별 기록 (played로 대체)
    return { pub: r.pub, priv: r.priv, played, score };
  }

  function reset(r) {
    return {
      pub: { ...r.pub, status: 'ready', number: 0, timer: Timer.reset(r.pub.timer), currentImage: null, currentAnswer: null, currentHint: null, history: null, exhausted: false },
      priv: { ...r.priv, current: null, history: [] },
    };
  }

  /** 관리자 화면에서 쓰는 형태로 합친다 (QuizKit.renderAdminControl 입력) */
  function adminView(pub, priv) {
    return { ...pub, current: LIVE.includes(pub.status) ? priv.current : null, history: priv.history };
  }

  /** 한글 → 초성 (그 외 글자·공백은 그대로) */
  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  function chosung(text) {
    return [...String(text || '')].map((ch) => {
      const c = ch.charCodeAt(0);
      return c >= 0xac00 && c <= 0xd7a3 ? CHO[Math.floor((c - 0xac00) / 588)] : ch;
    }).join('');
  }

  /** 남은 문제 수 / 전체 문제 수 */
  const progress = (pool, played) => ({ remaining: remainingOf(pool, played).length, total: pool.length });

  window.QuizEngine = { Timer, initial, normalize, apply, adminView, progress, chosung };
})();
