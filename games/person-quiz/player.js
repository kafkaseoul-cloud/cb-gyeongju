/* 인물 퀴즈 — 참가자 화면 (사진은 모두에게 공개, 정답은 맞힌 뒤 공개) */
(function () {
  'use strict';
  const { h, mount, keyed } = Kit;
  window.GameViews['person-quiz'] = {
    render(root, game, ctx) {
      game = game || {};
      if (!game.round) {
        keyed(root, ['wait'], (el) => mount(el, h('div', { class: 'card-gradient qk-ready-card' },
          h('div', { class: 'display-lg' }, '인물 퀴즈'), h('p', { class: 'body-lg', style: { margin: 0 } }, '곧 시작합니다'))));
        return;
      }
      if (root._key && root._key.startsWith('["wait"')) root._key = null;
      QuizKit.renderPlayer(root, game.round, ctx, {
        key: 'person-quiz',
        mode: 'image',
        subtitle: `인물 퀴즈 · ${game.count || 0}문제`,
      });
    },
  };
})();
