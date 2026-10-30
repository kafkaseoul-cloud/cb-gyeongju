/* ==========================================================================
   ThemedQuiz — "테마별 문제" 퀴즈 게임의 관리자 모듈 공통 구현
   몸으로 말해요, 초성 퀴즈가 사용한다. (games/<id>/admin.js 에서 설정만 넘김)

   DB 구조 (<id> = 게임 id)
     public/games/<id>  : { themes: [요약], theme: {id,name,icon} | null, round: 공개 라운드 상태 }
     admin/content/<id> : { themes: { <themeId>: { name, icon, order, questions: { <qid>: { answer, image, order } } } } }
     admin/rounds/<id>  : 비공개 라운드 상태 (현재 정답 등)
     admin/played/<id>/<themeId> : 이미 출제된 문제 (앞 팀 문제가 다시 나오지 않게)
     admin/settings/<id>: { duration }
   ========================================================================== */
(function () {
  'use strict';
  const { h, mount } = Kit;
  const E = QuizEngine;

  const EMOJIS = ['🎬', '📺', '🍪', '🎤', '🎵', '⚽', '🍜', '🐶', '🌏', '🎮', '📚', '🚗', '👑', '🎲', '💡', '🔥'];

  /** "🍿 시네마" 처럼 한 줄로 쓴 제목을 { icon, name }으로 나눈다. 앞에 이모지가 없으면 icon은 '' */
  function splitTitle(text) {
    const s = String(text || '').trim().replace(/\s+/g, ' ');
    const m = s.match(/^([^\p{L}\p{N}\s]+)\s*(.*)$/u);
    if (m && m[2] && /\p{Extended_Pictographic}/u.test(m[1])) return { icon: m[1].slice(0, 8), name: m[2].slice(0, 20) };
    return { icon: '', name: s.slice(0, 20) };
  }
  /** 화면 표시용 제목 */
  const titleOf = (t) => (t ? [t.icon, t.name].filter(Boolean).join(' ') : '');

  /** 테마 제목 편집 모달 (이모지 + 이름을 한 칸에) → { icon, name } | null */
  function editThemeModal(theme) {
    return new Promise((resolve) => {
      const input = h('input', { class: 'input theme-title-input', value: titleOf(theme), maxlength: 30, placeholder: '예: 🍿 시네마', 'aria-label': '테마 제목' });
      const close = (v) => { bd.remove(); resolve(v); };
      const save = () => {
        const v = splitTitle(input.value);
        if (!v.name) { Kit.toast('테마 제목을 입력하세요.', 'error'); input.focus(); return; }
        close(v);
      };
      const pick = (e) => { input.value = `${e} ${splitTitle(input.value).name}`.trim(); input.focus(); };
      const bd = h('div', { class: 'modal-backdrop', on: { click: (e) => { if (e.target === bd) close(null); } } },
        h('form', { class: 'modal stack', on: { submit: (e) => { e.preventDefault(); save(); } } },
          h('h3', { class: 'heading-sm' }, '테마 제목'),
          input,
          h('div', { class: 'faint link-sm' }, '이모지와 이름을 자유롭게 입력하세요. 아래 이모지를 누르면 맨 앞 이모지가 바뀌어요.'),
          h('div', { class: 'emoji-picks' }, EMOJIS.map((e) => h('button', { type: 'button', on: { click: () => pick(e) } }, e))),
          h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
            h('button', { type: 'button', class: 'btn btn-ghost', on: { click: () => close(null) } }, '취소'),
            h('button', { type: 'submit', class: 'btn btn-primary' }, '저장'))));
      document.body.appendChild(bd);
      setTimeout(() => { input.focus(); input.select(); }, 30);
    });
  }

  /**
   * @param {object} cfg
   *   id            게임 id
   *   defaultMode   'team' | 'solo'
   *   revealImage   참가자 화면에 이미지 공개
   *   revealAnswer  참가자 화면에 정답 공개 (몸으로 말해요)
   *   hintOf        문제 → 참가자에게 보여줄 힌트 (초성 퀴즈)
   *   note          진행 패널 안내 문구
   *   imageHint     문제 추가 폼의 이미지 안내
   */
  function create(cfg) {
    const ID = cfg.id;
    let contentTab = null;

    const byOrder = (a, b) => (a.order || 0) - (b.order || 0) || (a.id < b.id ? -1 : 1);
    function themesOf(ctx) {
      const themes = ((ctx.content || {}).themes) || {};
      return Object.entries(themes).map(([id, t]) => ({
        id, name: t.name, icon: t.icon || '', order: t.order || 0,
        questions: Object.entries(t.questions || {}).map(([qid, q]) => ({ id: qid, answer: q.answer, image: q.image || null, order: q.order || 0 })).sort(byOrder),
      })).sort(byOrder);
    }
    const duration = (ctx) => Number(ctx.settings.duration) || 120;
    const pub = (ctx) => ctx.pub || {};
    const defaults = { mode: cfg.defaultMode || 'team' };
    const roundOf = (ctx) => E.normalize(pub(ctx).round, ctx.priv, duration(ctx), defaults);
    const newKey = () => `${Date.now().toString(36)}${Kit.uid().slice(0, 4)}`;
    const findTheme = (ctx, id) => {
      const t = themesOf(ctx).find((x) => x.id === id);
      if (!t) throw new Error('테마를 찾을 수 없습니다.');
      return t;
    };

    return {
      /** 첫 실행 시 seed.json 의 기본 테마 */
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
        const map = {};
        const summary = themesOf(ctx).map((t) => ({ id: t.id, name: t.name, icon: t.icon, count: t.questions.length }));
        if (JSON.stringify(summary) !== JSON.stringify(Kit.arr(pub(ctx).themes))) map[`${ctx.P.pub}/themes`] = summary.length ? summary : null;
        // 진행 중인 테마의 이름·이모지를 바꾸면 참가자 화면에도 반영
        const cur = pub(ctx).theme;
        const t = cur && summary.find((x) => x.id === cur.id);
        if (t && (t.name !== cur.name || t.icon !== cur.icon)) map[`${ctx.P.pub}/theme`] = { id: t.id, name: t.name, icon: t.icon };
        return Object.keys(map).length ? map : null;
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
            // 진행 방식(팀전/개인전)과 도전 팀은 테마를 바꿔도 이어서 쓴다
            const prev = pub(ctx).round || {};
            const init = E.initial(duration(ctx), { mode: prev.mode || defaults.mode, team: prev.team || ctx.teamIds[0] || null });
            return { [`${P.pub}/theme`]: { id: t.id, name: t.name, icon: t.icon }, [`${P.pub}/round`]: init.pub, [P.priv]: init.priv };
          }
          case 'backToThemes':
            return { [`${P.pub}/theme`]: null, [`${P.pub}/round`]: null, [P.priv]: null };
          case 'resetPlayed':
            return { [`${P.played}/${payload.themeId}`]: null };
          case 'setDuration': {
            const s = Math.max(10, Math.min(1800, Math.round(Number(payload.seconds) || 0)));
            const map = { [`${P.settings}/duration`]: s };
            if (pub(ctx).round) Object.assign(map, this.action('setDurationRound', { seconds: s }, ctx));
            return map;
          }
          // ── 콘텐츠 ──
          case 'addTheme': {
            const { icon, name } = payload.title !== undefined ? splitTitle(payload.title) : { icon: String(payload.icon || '').trim().slice(0, 8), name: String(payload.name || '').trim().slice(0, 20) };
            if (!name) throw new Error('테마 제목을 입력하세요.');
            const order = themesOf(ctx).length;
            return { [`${P.content}/themes/${newKey()}`]: { name, icon, order } };
          }
          case 'renameTheme': {
            findTheme(ctx, payload.themeId);
            const map = {};
            const v = payload.title !== undefined ? splitTitle(payload.title) : { name: String(payload.name || '').trim().slice(0, 20), icon: payload.icon };
            if (!v.name) throw new Error('테마 제목을 입력하세요.');
            map[`${P.content}/themes/${payload.themeId}/name`] = v.name;
            if (v.icon !== undefined) map[`${P.content}/themes/${payload.themeId}/icon`] = String(v.icon).trim().slice(0, 8);
            return map;
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
              pool: pool ? pool.questions : [], now: ctx.now,
              revealImage: !!cfg.revealImage, revealAnswer: !!cfg.revealAnswer, hintOf: cfg.hintOf || null,
              played: (ctx.played || {})[theme.id] || {},
              teams: ctx.teamIds, players: ctx.players,
            });
            return {
              [`${P.pub}/round`]: res.pub, [P.priv]: res.priv,
              [`${P.played}/${theme.id}`]: Object.keys(res.played).length ? res.played : null,
              ...ctx.scoreOf(res.score),
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
                t.icon ? h('span', { class: 'bt-theme-icon' }, t.icon) : null,
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
            h('span', { class: 'badge', style: { fontSize: '15px', padding: '6px 14px' } }, titleOf(p.theme)),
            cfg.note ? h('span', { class: 'faint link-sm' }, cfg.note) : null,
            h('div', { class: 'spacer' }),
            h('button', { class: 'btn btn-sm btn-ghost', on: { click: () => api.act('backToThemes') } }, '테마 변경')),
          panel));
        QuizKit.renderAdminControl(panel, E.adminView(r.pub, r.priv), api, {
          showImageToAll: !!cfg.revealAnswer,
          imageOf: (x) => images[x.qid],
          hintOf: cfg.hintOf || null,
          progress: E.progress(theme ? theme.questions : [], (ctx.played || {})[p.theme.id]),
          resetPlayed: () => api.act('resetPlayed', { themeId: p.theme.id }),
          resetPlayedLabel: `'${p.theme.name}' 테마`,
        });
      },

      /** 콘텐츠 관리: 게임 시간 + 이미지 일괄 등록 + 테마별 문제 */
      content(root, ctx, api) {
        const themes = themesOf(ctx);
        if (!contentTab || !themes.find((t) => t.id === contentTab)) contentTab = themes[0] && themes[0].id;
        const theme = themes.find((t) => t.id === contentTab);
        const newTitle = h('input', { class: 'input', placeholder: '새 테마 (예: 🍿 시네마)', maxlength: 30, style: { maxWidth: '260px' } });

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
              h('button', { class: `bt-tab ${t.id === contentTab ? 'on' : ''}`, on: { click: () => { contentTab = t.id; api.rerender(); } } }, `${titleOf(t)} · ${t.questions.length}`))),
            h('form', { class: 'row row-wrap', on: { submit: async (e) => {
              e.preventDefault();
              if (await api.act('addTheme', { title: newTitle.value })) Kit.toast('테마를 추가했어요.');
            } } }, newTitle, h('button', { class: 'btn btn-ghost', type: 'submit' }, '+ 테마 추가')),
            theme ? h('div', { class: 'stack' },
              h('div', { class: 'row' },
                h('h4', { class: 'heading-sm grow' }, titleOf(theme)),
                h('button', { class: 'btn btn-sm btn-ghost', on: { click: async () => {
                  const v = await editThemeModal(theme);
                  if (v && await api.act('renameTheme', { themeId: theme.id, name: v.name, icon: v.icon })) Kit.toast('테마를 수정했어요.');
                } } }, '제목 변경'),
                h('button', { class: 'btn btn-sm btn-danger', on: { click: async () => {
                  if (await Kit.confirm(`"${theme.name}" 테마와 문제 ${theme.questions.length}개를 모두 삭제할까요?`, { ok: '삭제', danger: true })) api.act('deleteTheme', { themeId: theme.id });
                } } }, '테마 삭제')),
              QuizKit.questionManager(theme.questions, api, { themeId: theme.id }, { imageHint: cfg.imageHint || '선택' }))
              : h('div', { class: 'empty' }, '테마를 추가해 주세요.'))));
      },
    };
  }

  window.ThemedQuiz = { create, editThemeModal, splitTitle, titleOf };
})();
