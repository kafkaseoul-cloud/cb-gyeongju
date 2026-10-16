/* ==========================================================================
   QuizEngine — "랜덤 출제 + 정답/패스 + 제한시간" 진행 로직 (관리자 브라우저에서 실행)
   몸으로 말해요, 인물 퀴즈가 함께 쓴다.

   pub  (모두 공개)   : status, team, number, stats, timer, currentImage, lastResult, history(종료 시)
   priv (관리자 전용) : current{id,answer,image}, used{id:true}, history[], seq
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

  function initial(duration) {
    return {
      pub: { status: 'ready', team: 'A', number: 0, stats: { correct: 0, pass: 0 }, timer: Timer.create(duration), currentImage: null, lastResult: null, history: null },
      priv: { current: null, used: {}, history: [], seq: 0 },
    };
  }

  /** DB에서 읽은 값의 빈 필드를 채워 안전한 상태로 만든다 */
  function normalize(pub, priv, duration) {
    const base = initial(duration);
    const p = { ...base.pub, ...(pub || {}) };
    p.stats = { correct: 0, pass: 0, ...(p.stats || {}) };
    p.timer = { ...base.pub.timer, ...(p.timer || {}) };
    const q = { ...base.priv, ...(priv || {}) };
    q.used = q.used || {};
    q.history = arr(q.history);
    return { pub: p, priv: q };
  }

  function draw(r, pool, revealImage) {
    if (!pool.length) { r.priv.current = null; r.pub.currentImage = null; return; }
    let cands = pool.filter((q) => !r.priv.used[q.id]);
    if (!cands.length) {
      r.priv.used = {};
      cands = pool.filter((q) => !r.priv.current || q.id !== r.priv.current.id);
      if (!cands.length) cands = pool;
    }
    const q = cands[Math.floor(Math.random() * cands.length)];
    r.priv.used[q.id] = true;
    r.priv.current = { id: q.id, answer: q.answer, image: q.image || null };
    r.pub.number += 1;
    r.pub.currentImage = revealImage ? (q.image || null) : null;
  }

  const stats = (history) => ({
    correct: history.filter((h) => h.result === 'correct').length,
    pass: history.filter((h) => h.result === 'pass').length,
  });

  /**
   * 명령 실행
   * @returns {{pub, priv, score: null | {team, delta}}}
   */
  function apply(type, payload, state, { pool, now, revealImage }) {
    const r = { pub: clone(state.pub), priv: clone(state.priv) };
    let score = null;
    const p = r.pub;

    switch (type) {
      case 'start': {
        if (p.status === 'ended') Object.assign(r, reset(r));
        if (r.pub.status !== 'ready') break;
        if (!pool.length) throw new Error('등록된 문제가 없습니다. 콘텐츠 관리에서 문제를 추가하세요.');
        draw(r, pool, revealImage);
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
        r.priv.history.push({ qid: done.id, answer: done.answer, result: type, team: p.team });
        r.priv.seq = (r.priv.seq || 0) + 1;
        p.lastResult = { type, answer: done.answer, team: p.team, seq: r.priv.seq, at: now };
        if (type === 'correct') score = { team: p.team, delta: 1 };
        draw(r, pool, revealImage);
        break;
      }
      case 'undo': {
        const last = r.priv.history.pop();
        if (!last) throw new Error('되돌릴 기록이 없습니다.');
        if (last.result === 'correct') score = { team: last.team, delta: -1 };
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
        if (!['A', 'B'].includes(payload.team)) throw new Error('팀은 A 또는 B만 가능합니다.');
        p.team = payload.team;
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
    r.pub.history = r.pub.status === 'ended' ? r.priv.history.map(({ answer, result, team }) => ({ answer, result, team })) : null;
    if (!LIVE.includes(r.pub.status)) r.pub.currentImage = null;
    return { pub: r.pub, priv: r.priv, score };
  }

  function reset(r) {
    return {
      pub: { ...r.pub, status: 'ready', number: 0, timer: Timer.reset(r.pub.timer), currentImage: null, history: null },
      priv: { ...r.priv, current: null, history: [] },
    };
  }

  /** 관리자 화면에서 쓰는 형태로 합친다 (QuizKit.renderAdminControl 입력) */
  function adminView(pub, priv) {
    return { ...pub, current: LIVE.includes(pub.status) ? priv.current : null, history: priv.history };
  }

  window.QuizEngine = { Timer, initial, normalize, apply, adminView };
})();
