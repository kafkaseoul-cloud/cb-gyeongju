/* ==========================================================================
   QuizKit — "랜덤 출제 + 정답/패스 + 제한시간" 게임 공통 화면
   (몸으로 말해요, 인물 퀴즈가 사용. 서버 쪽 대응: server/lib/quizRound.js)
   ========================================================================== */
(function () {
  'use strict';
  const { h, mount, keyed } = Kit;

  const STATUS_LABEL = { ready: '준비', playing: '진행 중', paused: '일시정지', ended: '종료' };

  // 정답/패스 순간 효과 (같은 결과를 두 번 띄우지 않도록 seq 기억)
  const seen = {};
  function flashResult(key, last, { revealAnswer = true } = {}) {
    if (!last) { if (seen[key] === undefined) seen[key] = null; return; }
    const id = `${last.seq}:${last.at}`;
    if (seen[key] === undefined) { seen[key] = id; return; } // 화면을 막 연 경우: 지난 결과는 띄우지 않음
    if (seen[key] === id) return;
    seen[key] = id;
    if (Kit.now() - last.at > 4000) return;
    Kit.flash({
      kind: last.type === 'correct' ? 'correct' : 'pass',
      title: last.type === 'correct' ? '정답!' : '패스',
      sub: revealAnswer ? last.answer : null,
      ms: 1600,
    });
  }

  function teamPill(ctx, team, label = '도전 팀') {
    return h('div', { class: `qk-team team-${team.toLowerCase()}` }, h('span', { class: 'qk-team-label' }, label), h('strong', null, ctx.teamName(team)));
  }

  function historyList(history, { showImage = false, imageOf = null } = {}) {
    history = Kit.arr(history);
    if (!history.length) return h('div', { class: 'empty' }, '기록이 없어요');
    return h('ol', { class: 'qk-history' }, history.map((x, i) => {
      const img = x.image || (imageOf && imageOf(x));
      return h('li', { class: `qk-hist ${x.result}` },
      h('span', { class: 'qk-hist-no' }, i + 1),
      showImage ? (img ? h('img', { class: 'thumb', src: img, alt: '' }) : h('div', { class: 'thumb thumb-empty' }, '?')) : null,
      h('span', { class: 'grow ellipsis qk-hist-answer' }, x.answer),
      h('span', { class: `badge ${x.result === 'correct' ? 'badge-primary' : 'badge-ghost'}` }, x.result === 'correct' ? '정답' : '패스'));
    }));
  }

  /**
   * 참가자 화면
   * @param {HTMLElement} root
   * @param {object} round   서버 QuizRound.publicState()
   * @param {object} ctx     player.js가 넘겨주는 컨텍스트
   * @param {object} opts    { key, mode: 'act' | 'image', subtitle, actHint }
   */
  function renderPlayer(root, round, ctx, opts) {
    flashResult(opts.key, round.lastResult, { revealAnswer: true });
    const { timer, ...rest } = round;
    keyed(root, [rest, timer.running, timer.endsAt, timer.remainingMs, opts.subtitle, ctx.state.teams], (el) => {
      const myTeam = ctx.me && ctx.me.team;
      const playingMine = myTeam && myTeam === round.team;

      if (round.status === 'ready') {
        mount(el, h('div', { class: 'qk-stage qk-ready' },
          h('div', { class: 'card-gradient qk-ready-card' },
            h('div', { class: 'eyebrow', style: { color: 'rgba(255,255,255,.85)' } }, opts.subtitle || 'READY'),
            h('div', { class: 'display-lg' }, 'READY?'),
            teamPill(ctx, round.team),
            h('p', { class: 'body-lg', style: { margin: 0 } }, playingMine ? '우리 팀 차례! 준비하세요 🔥' : '곧 시작합니다'),
            h('div', { class: 'qk-ready-time' }, '제한 시간 ', h('strong', null, Kit.fmt(timer.duration * 1000))))));
        return;
      }

      if (round.status === 'ended') {
        mount(el, h('div', { class: 'qk-stage' },
          h('div', { class: 'card-black qk-over' },
            h('div', { class: 'display-lg' }, 'TIME OVER'),
            teamPill(ctx, round.team, '이번 라운드'),
            h('div', { class: 'qk-result-nums' },
              h('div', null, h('div', { class: 'qk-big' }, round.stats.correct), h('div', { class: 'muted' }, '정답')),
              h('div', null, h('div', { class: 'qk-big faint' }, round.stats.pass), h('div', { class: 'muted' }, '패스')))),
          h('div', { class: 'card' }, h('h3', { class: 'heading-sm', style: { marginBottom: '12px' } }, '이번 라운드 정답'), historyList(round.history))));
        return;
      }

      // playing / paused
      const center = opts.mode === 'image'
        ? (round.currentImage
          ? h('div', { class: 'qk-photo' }, h('img', { src: round.currentImage, alt: '문제 이미지' }))
          : h('div', { class: 'qk-photo qk-photo-empty' }, h('div', { class: 'display-md' }, '?'), h('div', { class: 'muted' }, '이미지 없는 문제 — 진행자의 설명을 들어보세요')))
        : h('div', { class: 'card-gradient qk-act' },
          h('div', { class: 'qk-act-emoji' }, '🙆'),
          h('div', { class: 'display-md' }, playingMine ? '맞혀라!' : '몸으로 말해요'),
          h('p', { class: 'body-lg', style: { margin: 0 } }, opts.actHint || '제시어는 진행자만 볼 수 있어요'));

      mount(el, h('div', { class: 'qk-stage' },
        h('div', { class: 'qk-topline' },
          teamPill(ctx, round.team),
          h('div', { class: 'qk-counts' },
            h('span', null, `#${round.number}`),
            h('span', { class: 'badge badge-primary' }, `정답 ${round.stats.correct}`),
            h('span', { class: 'badge badge-ghost' }, `패스 ${round.stats.pass}`))),
        Kit.timerEl(timer, 'qk-timer'),
        h('div', { class: 'qk-center' }, center,
          round.status === 'paused' ? h('div', { class: 'qk-paused' }, h('div', { class: 'display-md' }, 'PAUSE'), h('div', null, '잠시 멈췄어요')) : null)));
    });
  }

  // ─────────────────────────── 관리자 ───────────────────────────

  /**
   * 관리자 진행 패널
   * @param {object} api  { act(type,payload), Kit, state }
   * @param {object} opts { showImageToAll: boolean }
   */
  function renderAdminControl(root, round, api, opts = {}) {
    const st = api.state;
    const { timer } = round;
    const act = (type, payload) => () => api.act(type, payload);
    const live = ['playing', 'paused'].includes(round.status);

    const current = round.current && live
      ? h('div', { class: 'qk-admin-answer' },
        round.current.image ? h('img', { class: 'qk-admin-img', src: round.current.image, alt: '' }) : null,
        h('div', { class: 'grow' },
          h('div', { class: 'eyebrow' }, `#${round.number} 제시어 ${opts.showImageToAll ? '(정답)' : ''}`),
          h('div', { class: 'qk-admin-word' }, round.current.answer)))
      : h('div', { class: 'qk-admin-answer qk-admin-answer-empty' },
        h('div', { class: 'muted' }, round.status === 'ended' ? '라운드가 끝났어요. 새 라운드를 시작하세요.' : '시작을 누르면 첫 문제가 출제됩니다.'));

    mount(root,
      h('div', { class: 'qk-admin' },
        h('div', { class: 'qk-admin-top' },
          h('div', { class: 'stack-sm' },
            h('div', { class: 'label' }, '도전 팀'),
            h('div', { class: 'seg' },
              ['A', 'B'].map((t) => h('button', { class: `seg-btn ${round.team === t ? `on team-${t.toLowerCase()}` : ''}`, on: { click: act('setTeam', { team: t }) } }, st.teams[t].name)))),
          h('div', { class: 'stack-sm', style: { textAlign: 'center' } },
            h('div', { class: 'label' }, `타이머 · ${STATUS_LABEL[round.status]}`),
            Kit.timerEl(timer, 'qk-admin-timer')),
          h('div', { class: 'stack-sm' },
            h('div', { class: 'label' }, '이번 라운드'),
            h('div', { class: 'row' }, h('span', { class: 'badge badge-primary' }, `정답 ${round.stats.correct}`), h('span', { class: 'badge badge-ghost' }, `패스 ${round.stats.pass}`)))),

        current,

        h('div', { class: 'qk-admin-judge' },
          h('button', { class: 'btn btn-primary btn-xl', disabled: !live, on: { click: act('correct') } }, '⭕ 정답'),
          h('button', { class: 'btn btn-ghost btn-xl', disabled: !live, on: { click: act('pass') } }, '➡️ 패스')),

        h('div', { class: 'row row-wrap' },
          round.status === 'ready' || round.status === 'ended'
            ? h('button', { class: 'btn btn-green', on: { click: round.status === 'ended' ? async () => { await api.act('newRound'); await api.act('start'); } : act('start') } }, round.status === 'ended' ? '▶ 새 라운드 시작' : '▶ 시작')
            : null,
          round.status === 'playing' ? h('button', { class: 'btn btn-ghost', on: { click: act('pause') } }, '⏸ 일시정지') : null,
          round.status === 'paused' ? h('button', { class: 'btn btn-primary', on: { click: act('resume') } }, '▶ 재개') : null,
          live ? h('button', { class: 'btn btn-ghost', on: { click: act('adjustTime', { seconds: 10 }) } }, '+10초') : null,
          live ? h('button', { class: 'btn btn-ghost', on: { click: act('adjustTime', { seconds: -10 }) } }, '−10초') : null,
          round.history.length ? h('button', { class: 'btn btn-ghost', title: '마지막 정답/패스 기록을 취소합니다 (정답이었다면 1점 차감)', on: { click: act('undo') } }, '↶ 마지막 판정 취소') : null,
          h('div', { class: 'spacer' }),
          live ? h('button', { class: 'btn btn-danger', on: { click: act('end') } }, '라운드 종료') : null,
          round.status !== 'ready' && !live ? h('button', { class: 'btn btn-ghost', on: { click: act('newRound') } }, '↺ 대기 상태로') : null),

        h('details', { class: 'card qk-admin-history', open: round.status === 'ended' },
          h('summary', { class: 'heading-sm' }, `이번 라운드 기록 (${round.history.length})`),
          h('div', { style: { marginTop: '12px' } }, historyList(round.history, { showImage: !!opts.imageOf, imageOf: opts.imageOf })))));
  }

  /** 제한 시간 설정 폼 */
  function durationForm(seconds, api) {
    const min = h('input', { class: 'input', type: 'number', min: 0, max: 60, value: Math.floor(seconds / 60), style: { width: '90px' } });
    const sec = h('input', { class: 'input', type: 'number', min: 0, max: 59, value: seconds % 60, style: { width: '90px' } });
    return h('form', { class: 'row row-wrap', on: { submit: async (e) => {
      e.preventDefault();
      const total = Number(min.value || 0) * 60 + Number(sec.value || 0);
      if (await api.act('setDuration', { seconds: total })) Kit.toast('게임 시간이 저장되었어요.');
    } } },
      min, h('span', null, '분'), sec, h('span', null, '초'),
      h('button', { class: 'btn btn-primary', type: 'submit' }, '저장'),
      h('span', { class: 'faint link-sm' }, '라운드 1회 제한 시간'));
  }

  /**
   * 문제(정답 + 이미지) 관리 UI
   * @param {Array} questions
   * @param {object} api   { act, upload(dataUrl) → url }
   * @param {object} extra 서버 액션에 함께 보낼 값 (예: { themeId })
   */
  function questionManager(questions, api, extra = {}, { imageHint = '선택' } = {}) {
    let pendingImage = null;
    const answer = h('input', { class: 'input', placeholder: '정답 입력 (예: 기생충)', maxlength: 60 });
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
    const preview = h('div', { class: 'thumb thumb-empty qk-upload', title: '이미지 선택', on: { click: () => file.click() } }, '🖼️');
    const paint = () => mount(preview, pendingImage ? h('img', { class: 'thumb', src: pendingImage, alt: '' }) : '🖼️');
    file.addEventListener('change', async () => {
      try { pendingImage = await Kit.resizeImage(file.files[0], { max: 800, quality: 0.8 }); paint(); }
      catch (e) { Kit.toast(e.message, 'error'); }
      file.value = '';
    });
    const addBtn = h('button', { class: 'btn btn-primary', type: 'submit' }, '추가');
    const form = h('form', { class: 'qk-add', on: { submit: async (e) => {
      e.preventDefault();
      if (!answer.value.trim()) { Kit.toast('정답을 입력하세요.', 'error'); return; }
      addBtn.disabled = true;
      try {
        let image = null;
        if (pendingImage) image = await api.upload(pendingImage);
        if (await api.act('addQuestion', { ...extra, answer: answer.value, image })) {
          Kit.toast('문제를 추가했어요.');
        }
      } catch (err) { Kit.toast(err.message, 'error'); }
      addBtn.disabled = false;
    } } },
      preview, file,
      h('div', { class: 'grow stack-sm' }, answer, h('div', { class: 'faint link-sm' }, `이미지 ${imageHint} · 정사각형이 아니어도 괜찮아요`)),
      addBtn);

    const list = questions.length
      ? h('div', { class: 'qk-qlist' }, questions.map((q, i) => questionRow(q, i, api, extra)))
      : h('div', { class: 'empty' }, '등록된 문제가 없어요. 위에서 추가해 주세요.');
    return h('div', { class: 'stack' }, form, h('div', { class: 'row' }, h('span', { class: 'label', style: { margin: 0 } }, `문제 목록 ${questions.length}개`)), list);
  }

  function questionRow(q, i, api, extra) {
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
    file.addEventListener('change', async () => {
      try {
        const dataUrl = await Kit.resizeImage(file.files[0], { max: 800, quality: 0.8 });
        const url = await api.upload(dataUrl);
        await api.act('updateQuestion', { ...extra, questionId: q.id, image: url });
      } catch (e) { Kit.toast(e.message, 'error'); }
      file.value = '';
    });
    const thumb = q.image ? h('img', { class: 'thumb', src: q.image, alt: '' }) : h('div', { class: 'thumb thumb-empty' }, '—');
    return h('div', { class: 'qk-qrow' },
      h('span', { class: 'qk-qno' }, i + 1),
      h('button', { class: 'qk-thumb-btn', title: '이미지 변경', on: { click: () => file.click() } }, thumb), file,
      h('div', { class: 'grow ellipsis qk-qanswer' }, q.answer),
      h('button', { class: 'btn btn-sm btn-ghost', on: { click: async () => {
        const v = prompt('정답 수정', q.answer);
        if (v !== null && v.trim() && v !== q.answer) await api.act('updateQuestion', { ...extra, questionId: q.id, answer: v });
      } } }, '수정'),
      q.image ? h('button', { class: 'btn btn-sm btn-ghost', on: { click: () => api.act('updateQuestion', { ...extra, questionId: q.id, image: null }) } }, '이미지 삭제') : null,
      h('button', { class: 'btn btn-sm btn-danger', on: { click: async () => {
        if (await Kit.confirm(`"${q.answer}" 문제를 삭제할까요?`, { ok: '삭제', danger: true })) api.act('deleteQuestion', { ...extra, questionId: q.id });
      } } }, '삭제'));
  }

  window.QuizKit = { renderPlayer, renderAdminControl, durationForm, questionManager, historyList };
})();
