/* 좀비 게임 — 참가자 화면: 큰 타이머 */
(function () {
  'use strict';
  const { h, mount, keyed } = Kit;
  const LABEL = {
    ready: ['곧 시작해요', '진행자의 신호를 기다려 주세요'],
    playing: ['살아남아라!', '좀비를 피해 끝까지 버티세요'],
    paused: ['일시정지', '잠시 멈췄어요'],
    ended: ['TIME OVER', '게임 종료! 진행자의 발표를 기다려 주세요'],
  };

  let lastStatus = null;
  window.GameViews.zombie = {
    render(root, game) {
      game = { status: 'ready', timer: { duration: 300, running: false, endsAt: null, remainingMs: 300000 }, ...(game || {}) };
      if (lastStatus && lastStatus !== game.status && game.status === 'ended') {
        Kit.flash({ kind: 'info', title: 'TIME OVER', sub: '🧟 게임 종료', ms: 2200 });
      }
      lastStatus = game.status;
      const t = game.timer;
      keyed(root, [game.status, t.running, t.endsAt, t.remainingMs, t.duration], (el) => {
        const [title, sub] = LABEL[game.status] || LABEL.ready;
        mount(el, h('div', { class: `zb zb-${game.status}` },
          h('div', { class: 'zb-emoji' }, '🧟'),
          h('div', { class: 'display-md zb-title' }, title),
          Kit.timerEl(game.status === 'ready' ? { ...t, remainingMs: t.duration * 1000 } : t, 'zb-timer'),
          h('p', { class: 'body-lg muted zb-sub' }, sub)));
      });
    },
  };
})();
