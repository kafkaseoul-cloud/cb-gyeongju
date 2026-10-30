/* 초성 퀴즈 — 참가자 화면: 초성만 크게, 정답은 맞힌 뒤 공개 */
(function () {
  'use strict';
  const { h, mount, keyed } = Kit;

  window.GameViews.chosung = {
    render(root, game, ctx) {
      game = game || {};
      const themes = Kit.arr(game.themes);
      if (!game.theme || !game.round) {
        root._quiz = null;
        keyed(root, ['themes', themes], (el) => mount(el,
          h('div', { class: 'bt-themes' },
            h('div', { class: 'bt-themes-head' },
              h('h1', { class: 'display-md' }, '초성 퀴즈'),
              h('p', { class: 'muted body-lg' }, '진행자가 테마를 고르고 있어요')),
            h('div', { class: 'bt-theme-grid' }, themes.map((t, i) =>
              h('div', { class: 'bt-theme', style: { animationDelay: `${i * 70}ms` } },
                h('div', { class: 'bt-theme-icon' }, t.icon),
                h('div', { class: 'heading-sm' }, t.name),
                h('div', { class: 'faint link-sm' }, `${t.count}문제`)))))));
        return;
      }
      if (!root._quiz) { root._quiz = true; root._key = null; }
      QuizKit.renderPlayer(root, game.round, ctx, {
        key: 'chosung',
        mode: 'hint',
        subtitle: `${game.theme.icon} ${game.theme.name}`,
      });
    },
  };
})();
