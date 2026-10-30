/* 인물 퀴즈 — 관리자: 진행 로직 + 진행 패널 + 콘텐츠 관리
   DB 구조
     public/games/person-quiz  : { count, round: 공개 라운드 상태 (현재 사진 포함) }
     admin/content/person-quiz : { questions: { <qid>: { answer, image, order } } }
     admin/rounds/person-quiz  : 비공개 라운드 상태 (현재 정답 등)
     admin/settings/person-quiz: { duration }
*/
(function () {
  'use strict';
  const { h, mount } = Kit;
  const E = QuizEngine;
  const ID = 'person-quiz';

  const questionsOf = (ctx) => Object.entries(((ctx.content || {}).questions) || {})
    .map(([id, q]) => ({ id, answer: q.answer, image: q.image || null, order: q.order || 0 }))
    .sort((a, b) => a.order - b.order);
  const duration = (ctx) => Number(ctx.settings.duration) || 120;
  const pub = (ctx) => ctx.pub || {};
  // 인물 퀴즈는 기본 개인전 (진행 패널에서 팀전으로 바꿀 수 있음)
  const roundOf = (ctx) => E.normalize(pub(ctx).round, ctx.priv, duration(ctx), { mode: 'solo' });
  const newKey = () => `${Date.now().toString(36)}${Kit.uid().slice(0, 4)}`;

  window.AdminGames[ID] = {
    seed(ctx) {
      if (ctx.seeded) return {};
      return { [ctx.P.seeded]: true, [`${ctx.P.settings}/duration`]: 120 };
    },

    publicSync(ctx) {
      const map = {};
      const count = questionsOf(ctx).length;
      if ((pub(ctx).count || 0) !== count) map[`${ctx.P.pub}/count`] = count;
      if (!pub(ctx).round) {
        const init = E.initial(duration(ctx), { mode: 'solo' });
        map[`${ctx.P.pub}/round`] = init.pub;
      }
      return map;
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

    controlKey: (ctx) => [ctx.pub, ctx.priv, duration(ctx), questionsOf(ctx).length, ctx.played],

    action(type, payload, ctx) {
      const P = ctx.P;
      switch (type) {
        case 'setDuration': {
          const s = Math.max(10, Math.min(1800, Math.round(Number(payload.seconds) || 0)));
          return { [`${P.settings}/duration`]: s, ...this.action('setDurationRound', { seconds: s }, ctx) };
        }
        case 'addQuestion': {
          const answer = String(payload.answer || '').trim().slice(0, 60);
          if (!answer) throw new Error('정답을 입력하세요.');
          return { [`${P.content}/questions/${newKey()}`]: { answer, image: payload.image || null, order: Date.now() } };
        }
        case 'updateQuestion': {
          const base = `${P.content}/questions/${payload.questionId}`;
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
          return { [`${P.content}/questions/${payload.questionId}`]: null };
        case 'bulkImages': {
          const map = {};
          (payload.sets || []).forEach((x) => { map[`${P.content}/questions/${x.questionId}/image`] = x.image; });
          (payload.creates || []).forEach((x, i) => {
            const answer = String(x.answer || '').trim().slice(0, 60);
            if (answer) map[`${P.content}/questions/${newKey()}${i}`] = { answer, image: x.image || null, order: Date.now() + i };
          });
          return map;
        }
        case 'resetPlayed':
          return { [`${P.played}/all`]: null };
        default: {
          const res = E.apply(type === 'setDurationRound' ? 'setDuration' : type, payload, roundOf(ctx), {
            pool: questionsOf(ctx), now: ctx.now, revealImage: true,
            played: (ctx.played || {}).all || {}, // 앞 팀이 진행한 인물은 다시 나오지 않도록
            teams: ctx.teamIds, players: ctx.players,
          });
          return {
            [`${P.pub}/round`]: res.pub, [P.priv]: res.priv,
            [`${P.played}/all`]: Object.keys(res.played).length ? res.played : null,
            ...ctx.scoreOf(res.score),
          };
        }
      }
    },

    control(root, ctx, api) {
      const qs = questionsOf(ctx);
      const images = {};
      qs.forEach((q) => { images[q.id] = q.image; });
      const r = roundOf(ctx);
      const panel = h('div');
      mount(root, h('div', { class: 'stack' },
        h('div', { class: 'row row-wrap' },
          h('span', { class: 'badge badge-primary', style: { fontSize: '15px', padding: '6px 14px' } }, `🕵️ 등록된 인물 ${qs.length}명`),
          h('span', { class: 'faint link-sm' }, '사진은 참가자 화면에 크게 표시되고, 이름(정답)은 정답/패스 처리 후 공개됩니다.')),
        qs.length ? null : h('div', { class: 'empty' }, '등록된 문제가 없어요. 콘텐츠 관리 → 인물 퀴즈에서 사진과 정답을 추가하세요.'),
        panel));
      QuizKit.renderAdminControl(panel, E.adminView(r.pub, r.priv), api, {
        showImageToAll: true,
        imageOf: (x) => images[x.qid],
        progress: E.progress(qs, (ctx.played || {}).all),
        resetPlayed: () => api.act('resetPlayed'),
        resetPlayedLabel: '인물 퀴즈',
      });
    },

    content(root, ctx, api) {
      mount(root, h('div', { class: 'stack' },
        h('div', { class: 'card stack' },
          h('h3', { class: 'heading-sm' }, '⏱ 게임 시간'),
          QuizKit.durationForm(duration(ctx), api)),
        h('div', { class: 'card stack' },
          h('h3', { class: 'heading-sm' }, '🖼️ 사진 일괄 등록'),
          h('p', { class: 'muted', style: { margin: 0 } }, '사진 파일 이름을 정답(이름)으로 해서 여러 장을 한 번에 올리세요. 예) 홍길동.jpg → 정답 "홍길동"'),
          QuizKit.bulkImageZone(api, {
            questions: questionsOf(ctx),
            createIn: {},
            createLabel: '등록되지 않은 이름은 새 문제로 추가 (파일 이름 = 정답)',
            createDefault: true,
          })),
        h('div', { class: 'card stack' },
          h('h3', { class: 'heading-sm' }, '🕵️ 인물 문제'),
          h('p', { class: 'muted', style: { margin: 0 } }, '인물 사진을 올리고 정답(이름)을 입력하세요. 사진은 참가자 화면에 표시됩니다.'),
          QuizKit.questionManager(questionsOf(ctx), api, {}, { imageHint: '권장 (참가자 화면에 표시)' }))));
    },
  };
})();
