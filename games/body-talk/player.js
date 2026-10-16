/* 몸으로 말해요 — 참가자 화면 */
(function () {
  'use strict';
  const { h, mount, keyed } = Kit;

  window.GameViews['body-talk'] = {
    render(root, game, ctx) {
      game = game || {};
      const themes = Kit.arr(game.themes);
      // 1) 테마 선택 대기
      if (!game.theme || !game.round) {
        root._quiz = null;
        keyed(root, ['themes', themes], (el) => mount(el,
          h('div', { class: 'bt-themes' },
            h('div', { class: 'bt-themes-head' },
              h('h1', { class: 'display-md' }, '테마 선택'),
              h('p', { class: 'muted body-lg' }, '진행자가 테마를 고르고 있어요')),
            h('div', { class: 'bt-theme-grid' }, themes.map((t, i) =>
              h('div', { class: 'bt-theme', style: { animationDelay: `${i * 70}ms` } },
                h('div', { class: 'bt-theme-icon' }, t.icon),
                h('div', { class: 'heading-sm' }, t.name),
                h('div', { class: 'faint link-sm' }, `${t.count}문제`)))))));
        return;
      }

      // 2) 라운드 진행 (공통 퀴즈 화면)
      if (!root._quiz) { root._quiz = true; root._key = null; }
      QuizKit.renderPlayer(root, game.round, ctx, {
        key: 'body-talk',
        mode: 'reveal',
        subtitle: `${game.theme.icon} ${game.theme.name}`,
        actHint: `테마: ${game.theme.icon} ${game.theme.name}`,
      });
    },
  };
})();
