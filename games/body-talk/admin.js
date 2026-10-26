/* 몸으로 말해요 — 관리자: 진행 로직 + 진행 패널 + 콘텐츠 관리
   제시어와 이미지는 참가자 화면에도 공개된다 (round.currentAnswer / currentImage)
   DB 구조
     public/games/body-talk  : { themes: [요약], theme: {id,name,icon} | null, round: 공개 라운드 상태 }
     admin/content/body-talk : { themes: { <themeId>: { name, icon, order, questions: { <qid>: { answer, image, order } } } } }
     admin/rounds/body-talk  : 비공개 라운드 상태 (현재 제시어 등)
     admin/settings/body-talk: { duration }
*/
(function () {
  'use strict';
  const { h, mount } = Kit;
  const E = QuizEngine;
  const ID = 'body-talk';
  let contentTab = null;

  const byOrder = (a, b) => (a.order || 0) - (b.order || 0) || (a.id < b.id ? -1 : 1);
  function themesOf(ctx) {
    const themes = ((ctx.content || {}).themes) || {};
    return Object.entries(themes).map(([id, t]) => ({
      id, name: t.name, icon: t.icon || '🎲', order: t.order || 0,
      questions: Object.entries(t.questions || {}).map(([qid, q]) => ({ id: qid, answer: q.answer, image: q.image || null, order: q.order || 0 })).sort(byOrder),
    })).sort(byOrder);
  }
  const duration = (ctx) => Number(ctx.settings.duration) || 120;
  const pub = (ctx) => ctx.pub || {};
  const roundOf = (ctx) => E.normalize(pub(ctx).round, ctx.priv, duration(ctx));
  const newKey = () => `${Date.now().toString(36)}${Kit.uid().slice(0, 4)}`;
  const findTheme = (ctx, id) => {
    const t = themesOf(ctx).find((x) => x.id === id);
    if (!t) throw new Error('테마를 찾을 수 없습니다.');
    return t;
  };

  window.AdminGames[ID] = {
    /** 첫 실행 시 기본 테마 4개 × 20문제 */
    async seed(ctx) {
      if (ctx.seeded || ctx.content) return {};
      const seed = await fetch(`games/${ID}/seed.json`).then((r) => r.json());
      const themes = {};
      seed.themes.forEach((t, i) => {
        const questions = {};
        t.questions.forEach((q, j) => { questions[q.id] = { answer: q.answer, image: q.image || null, order: j }; });
        themes[t.id] = { name: t.name, icon: t.icon, order: i, questions };
      });
      return { [ctx.P.content]: { themes }, [ctx.P.seeded]: true, [`${ctx.P.settings}/duration`]: 120 };
    },

    publicSync(ctx) {
      const summary = themesOf(ctx).map((t) => ({ id: t.id, name: t.name, icon: t.icon, count: t.questions.length }));
      if (JSON.stringify(summary) === JSON.stringify(Kit.arr(pub(ctx).themes))) return null;
      return { [`${ctx.P.pub}/themes`]: summary.length ? summary : null };
    },

    tick(ctx) {
      const r = pub(ctx).round;
      return r && r.status === 'playing' && E.Timer.expired(r.timer, ctx.now) ? 'expire' : null;
    },

    onExit(ctx) {
      const r = pub(ctx).round;
      if (!r || r.status !== 'playing') return {};
      return this.action('pause', {}, ctx);
    },

    controlKey: (ctx) => [ctx.pub, ctx.priv, duration(ctx), ctx.played],

    action(type, payload, ctx) {
      const P = ctx.P;
      switch (type) {
        case 'selectTheme': {
          const t = findTheme(ctx, payload.themeId);
          const init = E.initial(duration(ctx));
          return { [`${P.pub}/theme`]: { id: t.id, name: t.name, icon: t.icon }, [`${P.pub}/round`]: init.pub, [P.priv]: init.priv };
        }
        case 'backToThemes':
          return { [`${P.pub}/theme`]: null, [`${P.pub}/round`]: null, [P.priv]: null };
        case 'resetPlayed':
          // 이 테마의 출제 기록을 비워 처음부터 다시 낼 수 있게 한다
          return { [`${P.played}/${payload.themeId}`]: null };
        case 'setDuration': {
          const s = Math.max(10, Math.min(1800, Math.round(Number(payload.seconds) || 0)));
          const map = { [`${P.settings}/duration`]: s };
          if (pub(ctx).round) Object.assign(map, this.action('setDurationRound', { seconds: s }, ctx));
          return map;
        }
        // ── 콘텐츠 ──
        case 'addTheme': {
          const name = String(payload.name || '').trim().slice(0, 20);
          if (!name) throw new Error('테마 이름을 입력하세요.');
          const order = themesOf(ctx).length;
          return { [`${P.content}/themes/${newKey()}`]: { name, icon: String(payload.icon || '🎲').slice(0, 4), order } };
        }
        case 'renameTheme': {
          findTheme(ctx, payload.themeId);
          const name = String(payload.name || '').trim().slice(0, 20);
          return name ? { [`${P.content}/themes/${payload.themeId}/name`]: name } : null;
        }
        case 'deleteTheme': {
          findTheme(ctx, payload.themeId);
          const map = { [`${P.content}/themes/${payload.themeId}`]: null, [`${P.played}/${payload.themeId}`]: null };
          if ((pub(ctx).theme || {}).id === payload.themeId) Object.assign(map, this.action('backToThemes', {}, ctx));
          return map;
        }
        case 'addQuestion': {
          const t = findTheme(ctx, payload.themeId);
          const answer = String(payload.answer || '').trim().slice(0, 60);
          if (!answer) throw new Error('정답을 입력하세요.');
          return { [`${P.content}/themes/${t.id}/questions/${newKey()}`]: { answer, image: payload.image || null, order: Date.now() } };
        }
        case 'updateQuestion': {
          const base = `${P.content}/themes/${payload.themeId}/questions/${payload.questionId}`;
          const map = {};
          if (payload.answer !== undefined) {
            const a = String(payload.answer).trim().slice(0, 60);
            if (!a) throw new Error('정답을 입력하세요.');
            map[`${base}/answer`] = a;
          }
          if (payload.image !== undefined) map[`${base}/image`] = payload.image || null;
          return map;
        }
        case 'deleteQuestion':
          return { [`${P.content}/themes/${payload.themeId}/questions/${payload.questionId}`]: null };
        case 'bulkImages': {
          // 이미지 일괄 등록: sets = 기존 문제에 이미지, creates = 새 문제
          const map = {};
          (payload.sets || []).forEach((x) => { map[`${P.content}/themes/${x.themeId}/questions/${x.questionId}/image`] = x.image; });
          (payload.creates || []).forEach((x, i) => {
            const t = findTheme(ctx, x.themeId);
            const answer = String(x.answer || '').trim().slice(0, 60);
            if (answer) map[`${P.content}/themes/${t.id}/questions/${newKey()}${i}`] = { answer, image: x.image || null, order: Date.now() + i };
          });
          return map;
        }
        default: {
          // ── 라운드 진행 (공통 퀴즈 엔진) ──
          const theme = pub(ctx).theme;
          if (!theme) throw new Error('먼저 테마를 선택하세요.');
          const pool = themesOf(ctx).find((t) => t.id === theme.id);
          const res = E.apply(type === 'setDurationRound' ? 'setDuration' : type, payload, roundOf(ctx), {
            pool: pool ? pool.questions : [], now: ctx.now, revealImage: true, revealAnswer: true,
            played: (ctx.played || {})[theme.id] || {}, // 앞 팀이 진행한 문제는 다시 나오지 않도록
          });
          return {
            [`${P.pub}/round`]: res.pub, [P.priv]: res.priv,
            [`${P.played}/${theme.id}`]: Object.keys(res.played).length ? res.played : null,
            ...(res.score ? ctx.score(res.score.team, res.score.delta) : {}),
          };
        }
      }
    },

    /** 진행 패널 */
    control(root, ctx, api) {
      const p = pub(ctx);
      const themes = themesOf(ctx);
      if (!p.theme || !p.round) {
        mount(root, h('div', { class: 'stack' },
          h('div', { class: 'label' }, '테마를 선택하세요'),
          themes.length ? h('div', { class: 'bt-admin-themes' }, themes.map((t) => {
            const pr = E.progress(t.questions, (ctx.played || {})[t.id]);
            return h('button', { class: `bt-admin-theme ${pr.remaining ? '' : 'is-done'}`, on: { click: () => api.act('selectTheme', { themeId: t.id }) } },
              h('span', { class: 'bt-theme-icon' }, t.icon),
              h('strong', { class: 'heading-sm' }, t.name),
              h('span', { class: 'faint link-sm' }, pr.remaining === pr.total ? `${pr.total}문제` : pr.remaining ? `남은 문제 ${pr.remaining} / ${pr.total}` : `모두 출제됨 · ${pr.total}문제`));
          }))
            : h('div', { class: 'empty' }, '테마가 없어요. 콘텐츠 관리에서 추가하세요.')));
        return;
      }
      const theme = themes.find((t) => t.id === p.theme.id);
      const images = {};
      (theme ? theme.questions : []).forEach((q) => { images[q.id] = q.image; });
      const r = roundOf(ctx);
      const panel = h('div');
      mount(root, h('div', { class: 'stack' },
        h('div', { class: 'row row-wrap' },
          h('span', { class: 'badge', style: { fontSize: '15px', padding: '6px 14px' } }, `${p.theme.icon} ${p.theme.name}`),
          h('span', { class: 'faint link-sm' }, '제시어와 이미지가 참가자 화면에도 함께 표시됩니다.'),
          h('div', { class: 'spacer' }),
          h('button', { class: 'btn btn-sm btn-ghost', on: { click: () => api.act('backToThemes') } }, '테마 변경')),
        panel));
      QuizKit.renderAdminControl(panel, E.adminView(r.pub, r.priv), api, {
        showImageToAll: true,
        imageOf: (x) => images[x.qid],
        progress: E.progress(theme ? theme.questions : [], (ctx.played || {})[p.theme.id]),
        resetPlayed: () => api.act('resetPlayed', { themeId: p.theme.id }),
        resetPlayedLabel: `'${p.theme.name}' 테마`,
      });
    },

    /** 콘텐츠 관리: 게임 시간 + 테마별 문제 */
    content(root, ctx, api) {
      const themes = themesOf(ctx);
      if (!contentTab || !themes.find((t) => t.id === contentTab)) contentTab = themes[0] && themes[0].id;
      const theme = themes.find((t) => t.id === contentTab);
      const newName = h('input', { class: 'input', placeholder: '새 테마 이름', maxlength: 20, style: { maxWidth: '220px' } });
      const newIcon = h('input', { class: 'input', placeholder: '🎲', maxlength: 4, style: { width: '72px', textAlign: 'center' } });

      const allQuestions = [];
      themes.forEach((t) => t.questions.forEach((q) => allQuestions.push({ ...q, themeId: t.id, themeName: t.name })));
      const withImage = allQuestions.filter((q) => q.image).length;

      mount(root, h('div', { class: 'stack' },
        h('div', { class: 'card stack' },
          h('h3', { class: 'heading-sm' }, '⏱ 게임 시간'),
          QuizKit.durationForm(duration(ctx), api)),
        h('div', { class: 'card stack' },
          h('div', { class: 'row row-wrap' },
            h('h3', { class: 'heading-sm grow' }, '🖼️ 이미지 일괄 등록'),
            h('span', { class: 'badge badge-ghost' }, `이미지 있음 ${withImage} / ${allQuestions.length}문제`)),
          h('p', { class: 'muted', style: { margin: 0 } }, '모든 테마의 정답과 파일 이름을 비교해 자동으로 연결해요. 테마를 가리지 않고 한 번에 올려도 됩니다.'),
          QuizKit.bulkImageZone(api, {
            questions: allQuestions,
            createIn: theme ? { themeId: theme.id } : null,
            createLabel: theme ? `매칭 안 된 파일은 '${theme.name}' 테마에 새 문제로 추가 (파일 이름 = 정답)` : '',
            createDefault: false,
          })),
        h('div', { class: 'card stack' },
          h('h3', { class: 'heading-sm' }, '🎭 테마 & 문제'),
          h('div', { class: 'bt-tabs' }, themes.map((t) =>
            h('button', { class: `bt-tab ${t.id === contentTab ? 'on' : ''}`, on: { click: () => { contentTab = t.id; api.rerender(); } } }, `${t.icon} ${t.name} · ${t.questions.length}`))),
          h('form', { class: 'row row-wrap', on: { submit: async (e) => {
            e.preventDefault();
            if (await api.act('addTheme', { name: newName.value, icon: newIcon.value || '🎲' })) Kit.toast('테마를 추가했어요.');
          } } }, newIcon, newName, h('button', { class: 'btn btn-ghost', type: 'submit' }, '+ 테마 추가')),
          theme ? h('div', { class: 'stack' },
            h('div', { class: 'row' },
              h('h4', { class: 'heading-sm grow' }, `${theme.icon} ${theme.name}`),
              h('button', { class: 'btn btn-sm btn-ghost', on: { click: () => {
                const v = prompt('테마 이름 변경', theme.name);
                if (v && v.trim()) api.act('renameTheme', { themeId: theme.id, name: v });
              } } }, '이름 변경'),
              h('button', { class: 'btn btn-sm btn-danger', on: { click: async () => {
                if (await Kit.confirm(`"${theme.name}" 테마와 문제 ${theme.questions.length}개를 모두 삭제할까요?`, { ok: '삭제', danger: true })) api.act('deleteTheme', { themeId: theme.id });
              } } }, '테마 삭제')),
            QuizKit.questionManager(theme.questions, api, { themeId: theme.id }, { imageHint: '선택 (참가자 화면에도 정답과 함께 표시)' }))
            : h('div', { class: 'empty' }, '테마를 추가해 주세요.'))));
    },
  };
})();
