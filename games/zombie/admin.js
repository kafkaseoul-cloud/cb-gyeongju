/* 좀비 게임 — 관리자: 시간 설정 + 타이머 조작
   DB 구조
     public/games/zombie  : { status: ready|playing|paused|ended, timer }
     admin/settings/zombie: { duration }
*/
(function () {
  'use strict';
  const { h, mount } = Kit;
  const T = QuizEngine.Timer;
  const ID = 'zombie';
  const STATUS = { ready: '준비', playing: '진행 중', paused: '일시정지', ended: '종료' };

  const duration = (ctx) => Number(ctx.settings.duration) || 300;
  const stateOf = (ctx) => {
    const p = ctx.pub || {};
    return { status: p.status || 'ready', timer: { ...T.create(duration(ctx)), ...(p.timer || {}) } };
  };

  function durationForm(ctx, api) {
    const s = duration(ctx);
    const min = h('input', { class: 'input', type: 'number', min: 0, max: 60, value: Math.floor(s / 60), style: { width: '90px' } });
    const sec = h('input', { class: 'input', type: 'number', min: 0, max: 59, value: s % 60, style: { width: '90px' } });
    return h('form', { class: 'row row-wrap', on: { submit: async (e) => {
      e.preventDefault();
      if (await api.act('setDuration', { seconds: Number(min.value || 0) * 60 + Number(sec.value || 0) })) Kit.toast('게임 시간이 저장되었어요.');
    } } }, min, h('span', null, '분'), sec, h('span', null, '초'), h('button', { class: 'btn btn-primary', type: 'submit' }, '저장'),
    h('span', { class: 'faint link-sm' }, '대기 상태일 때 바로 반영돼요'));
  }

  // 생존자(개인 점수) 선택 — 다시 그려도 선택이 유지되도록 모듈에 보관
  const picked = new Set();

  /** 개인전 점수 패널: 사람을 골라서 한 번에 +1 / −1 */
  function scorePanel(ctx, api) {
    const players = [...ctx.players].sort((a, b) => (b.online - a.online) || a.joinedAt - b.joinedAt);
    [...picked].forEach((id) => { if (!players.find((p) => p.id === id)) picked.delete(id); });
    const box = h('div', { class: 'card stack' });
    const paint = () => {
      const n = picked.size;
      mount(box,
        h('div', { class: 'row row-wrap' },
          h('h3', { class: 'heading-sm grow' }, '🏅 개인 점수 (생존자 등)'),
          h('button', { class: 'btn btn-sm btn-ghost', on: { click: () => {
            if (picked.size === players.length) picked.clear(); else players.forEach((p) => picked.add(p.id));
            paint();
          } } }, picked.size === players.length && players.length ? '전체 해제' : '전체 선택')),
        h('p', { class: 'faint link-sm', style: { margin: 0 } }, '점수를 줄 사람을 고른 뒤 +1 을 누르세요. 소속 팀이 있으면 팀 점수에도 더해져요.'),
        players.length ? h('div', { class: 'qk-pick-grid' }, players.map((p) => h('button', {
          class: `qk-pick-btn ${p.online ? '' : 'offline'} ${picked.has(p.id) ? 'sel' : ''}`, 'aria-pressed': picked.has(p.id) ? 'true' : 'false',
          on: { click: () => { if (picked.has(p.id)) picked.delete(p.id); else picked.add(p.id); paint(); } },
        }, Kit.avatar(p), h('span', { class: 'ellipsis' }, p.nickname), h('span', { class: 'pts' }, `${p.score || 0}점`))))
          : h('div', { class: 'empty' }, '참가자가 없어요'),
        h('div', { class: 'row row-wrap' },
          h('button', { class: 'btn btn-primary', disabled: !n, on: { click: async () => {
            if (await api.act('award', { playerIds: [...picked], delta: 1 })) { Kit.toast(`${n}명에게 +1 했어요.`); picked.clear(); }
          } } }, n ? `선택한 ${n}명 +1` : '+1'),
          h('button', { class: 'btn btn-ghost', disabled: !n, on: { click: async () => {
            if (await api.act('award', { playerIds: [...picked], delta: -1 })) { Kit.toast(`${n}명 −1 했어요.`); picked.clear(); }
          } } }, '−1'),
          n ? h('button', { class: 'btn btn-sm btn-ghost', on: { click: () => { picked.clear(); paint(); } } }, '선택 해제') : null));
    };
    paint();
    return box;
  }

  window.AdminGames[ID] = {
    seed(ctx) { return ctx.seeded ? {} : { [ctx.P.seeded]: true, [`${ctx.P.settings}/duration`]: 300 }; },

    publicSync(ctx) {
      return ctx.pub && ctx.pub.timer ? null : { [ctx.P.pub]: stateOf(ctx) };
    },

    tick(ctx) {
      const s = stateOf(ctx);
      return s.status === 'playing' && T.expired(s.timer, ctx.now) ? 'expire' : null;
    },

    onExit(ctx) {
      return stateOf(ctx).status === 'playing' ? this.action('pause', {}, ctx) : {};
    },

    controlKey: (ctx) => [ctx.pub, duration(ctx), ctx.players],

    action(type, payload, ctx) {
      let { status, timer } = stateOf(ctx);
      const now = ctx.now;
      switch (type) {
        case 'start':
          if (status === 'ended') { timer = T.reset(timer); status = 'ready'; }
          if (status !== 'ready') return null;
          status = 'playing'; timer = T.start(timer, now);
          break;
        case 'pause': if (status === 'playing') { timer = T.pause(timer, now); status = 'paused'; } break;
        case 'resume': if (status === 'paused') { status = 'playing'; timer = T.start(timer, now); } break;
        case 'reset': timer = T.reset(timer); status = 'ready'; break;
        case 'end': timer = T.end(timer); status = 'ended'; break;
        case 'expire': if (status === 'playing') { timer = T.end(timer); status = 'ended'; } break;
        case 'adjustTime':
          timer = T.adjust(timer, payload.seconds, now);
          if (status === 'ended' && timer.remainingMs > 0) status = 'paused';
          break;
        case 'setDuration': {
          const s = Math.max(10, Math.min(3600, Math.round(Number(payload.seconds) || 0)));
          timer = T.setDuration(timer, s);
          return { [`${ctx.P.settings}/duration`]: s, [ctx.P.pub]: { status, timer } };
        }
        case 'award': {
          // 개인전: 고른 사람들에게 점수 (소속 팀에도 합산)
          const ids = (payload.playerIds || []).filter(Boolean);
          if (!ids.length) throw new Error('점수를 줄 사람을 골라 주세요.');
          return ctx.awardMany(ids, Number(payload.delta) || 1);
        }
        default: throw new Error(`알 수 없는 명령: ${type}`);
      }
      return { [ctx.P.pub]: { status, timer } };
    },

    control(root, ctx, api) {
      const g = stateOf(ctx);
      const act = (type, payload) => () => api.act(type, payload);
      const live = g.status === 'playing' || g.status === 'paused';
      const t = g.status === 'ready' ? { ...g.timer, remainingMs: g.timer.duration * 1000 } : g.timer;
      mount(root, h('div', { class: 'stack' },
        h('div', { class: 'card-black zb-admin' },
          h('div', { class: 'label' }, `🧟 좀비 게임 · ${STATUS[g.status]}`),
          Kit.timerEl(t, 'zb-admin-timer')),
        h('div', { class: 'qk-admin-main' },
          g.status === 'playing' ? h('button', { class: 'btn btn-ghost btn-xl', on: { click: act('pause') } }, '일시정지')
            : g.status === 'paused' ? h('button', { class: 'btn btn-primary btn-xl', on: { click: act('resume') } }, '▶ 재개')
              : h('button', { class: 'btn btn-primary btn-xl', on: { click: act('start') } }, g.status === 'ended' ? '▶ 다시 시작' : '▶ 시작')),
        h('div', { class: 'qk-admin-tools' },
          h('button', { class: 'btn btn-sm btn-ghost', on: { click: act('adjustTime', { seconds: 30 }) } }, '+30초'),
          h('button', { class: 'btn btn-sm btn-ghost', on: { click: act('adjustTime', { seconds: 60 }) } }, '+1분'),
          live ? h('button', { class: 'btn btn-sm btn-ghost', on: { click: act('adjustTime', { seconds: -30 }) } }, '−30초') : null,
          h('div', { class: 'spacer' }),
          live ? h('button', { class: 'btn btn-sm btn-danger', on: { click: act('end') } }, '종료') : null,
          g.status !== 'ready' ? h('button', { class: 'btn btn-sm btn-ghost', on: { click: act('reset') } }, '리셋') : null),
        scorePanel(ctx, api),
        h('div', { class: 'card stack' }, h('h3', { class: 'heading-sm' }, '⏱ 게임 시간'), durationForm(ctx, api)),
        h('p', { class: 'faint link-sm', style: { margin: 0 } }, '팀 점수는 상단 스코어보드의 +/− 로도 직접 바꿀 수 있어요.')));
    },

    content(root, ctx, api) {
      mount(root, h('div', { class: 'card stack' },
        h('h3', { class: 'heading-sm' }, '⏱ 게임 시간'),
        durationForm(ctx, api),
        h('p', { class: 'muted', style: { margin: 0 } }, '좀비 게임은 규칙을 오프라인으로 진행하고, 화면에는 타이머만 표시됩니다.')));
    },
  };
})();
