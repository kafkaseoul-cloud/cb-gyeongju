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

  /** 이미지(위) + 정답(아래) 가운데 정렬 카드 */
  function revealCard({ image, word, meta }) {
    return h('div', { class: 'qk-reveal' },
      meta ? h('div', { class: 'qk-reveal-meta' }, meta) : null,
      image ? h('img', { class: 'qk-reveal-img', src: image, alt: '' }) : null,
      h('div', { class: 'qk-reveal-word' }, word));
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
      let center;
      if (opts.mode === 'reveal' && round.currentAnswer) {
        // 몸으로 말해요: 정답과 이미지를 모두에게 공개 (가운데 정렬)
        center = revealCard({ image: round.currentImage, word: round.currentAnswer, meta: opts.subtitle });
      } else if (opts.mode === 'image') {
        center = round.currentImage
          ? h('div', { class: 'qk-photo' }, h('img', { src: round.currentImage, alt: '문제 이미지' }))
          : h('div', { class: 'qk-photo qk-photo-empty' }, h('div', { class: 'display-md' }, '?'), h('div', { class: 'muted' }, '이미지 없는 문제 — 진행자의 설명을 들어보세요'));
      } else {
        center = h('div', { class: 'card-gradient qk-act' },
          h('div', { class: 'qk-act-emoji' }, '🙆'),
          h('div', { class: 'display-md' }, playingMine ? '맞혀라!' : '몸으로 말해요'),
          h('p', { class: 'body-lg', style: { margin: 0 } }, opts.actHint || '제시어는 진행자만 볼 수 있어요'));
      }

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
      ? revealCard({ image: round.current.image, word: round.current.answer, meta: `#${round.number} ${opts.showImageToAll ? '정답' : '제시어 (진행자만 보임)'}` })
      : h('div', { class: 'qk-reveal' },
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

        // 메인 액션: 상태마다 지금 눌러야 할 버튼 하나(또는 정답/패스 둘)만 크게
        round.status === 'playing'
          ? h('div', { class: 'qk-admin-judge' },
            h('button', { class: 'btn btn-primary btn-xl', on: { click: act('correct') } }, '정답'),
            h('button', { class: 'btn btn-ghost btn-xl', on: { click: act('pass') } }, '패스'))
          : h('div', { class: 'qk-admin-main' },
            round.status === 'paused'
              ? h('button', { class: 'btn btn-primary btn-xl', on: { click: act('resume') } }, '▶ 재개')
              : h('button', { class: 'btn btn-primary btn-xl', on: { click: round.status === 'ended' ? async () => { await api.act('newRound'); await api.act('start'); } : act('start') } },
                round.status === 'ended' ? '▶ 새 라운드 시작' : '▶ 라운드 시작')),

        // 보조 조작: 작게 한 줄
        h('div', { class: 'qk-admin-tools' },
          round.status === 'playing' ? h('button', { class: 'btn btn-sm btn-ghost', on: { click: act('pause') } }, '일시정지') : null,
          live ? h('button', { class: 'btn btn-sm btn-ghost', on: { click: act('adjustTime', { seconds: 10 }) } }, '+10초') : null,
          live ? h('button', { class: 'btn btn-sm btn-ghost', on: { click: act('adjustTime', { seconds: -10 }) } }, '−10초') : null,
          round.history.length ? h('button', { class: 'btn btn-sm btn-ghost', title: '마지막 정답/패스 기록을 취소합니다 (정답이었다면 1점 차감)', on: { click: act('undo') } }, '↶ 마지막 판정 취소') : null,
          h('div', { class: 'spacer' }),
          live ? h('button', { class: 'btn btn-sm btn-danger', on: { click: act('end') } }, '라운드 종료') : null,
          round.status === 'ended' ? h('button', { class: 'btn btn-sm btn-ghost', on: { click: act('newRound') } }, '대기 상태로') : null),

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


  // ─────────────────────────── 이미지 일괄 등록 ───────────────────────────

  /** 파일 이름과 정답을 비교하기 위한 정규화 (맥 한글 자모 분리, 공백·기호, "(1)" 사본 표시 제거) */
  function normName(s) {
    return String(s || '').normalize('NFC').toLowerCase()
      .replace(/\.[a-z0-9]{2,5}$/, '')
      .replace(/\s*\(\d+\)$/, '')
      .replace(/[\s\-_.·:,!?'"()\[\]~&]/g, '');
  }
  const baseName = (f) => f.name.normalize('NFC').replace(/\.[a-zA-Z0-9]{2,5}$/, '').replace(/\s*\(\d+\)$/, '').trim();

  /**
   * 일괄 등록 영역: 이미지 여러 장을 끌어다 놓으면 "파일 이름 = 정답"으로 문제에 자동 연결
   * @param {object} api       { act } — 게임 모듈의 'bulkImages' 명령을 사용
   * @param {object} o
   *   questions   : [{ id, answer, image, themeId?, themeName? }] 매칭 대상
   *   createIn    : 매칭 안 된 파일을 새 문제로 추가할 때 함께 보낼 값 (예: { themeId }) — null이면 추가 불가
   *   createLabel : 새 문제 추가 옵션 설명
   *   createDefault: 새 문제 추가 기본 체크 여부
   */
  function bulkImageZone(api, o) {
    const input = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    const zone = h('div', { class: 'qk-bulk-drop', tabindex: 0, role: 'button' },
      h('div', { class: 'qk-bulk-icon' }, '🖼️'),
      h('div', { class: 'qk-bulk-title' }, '이미지를 여기로 끌어다 놓거나 클릭해서 선택'),
      h('div', { class: 'faint link-sm' }, '파일 이름을 정답과 같게 맞춰 주세요 · 예) 기생충.jpg, 새우깡.png · 여러 장 한 번에'),
      input);
    const open = () => input.click();
    zone.addEventListener('click', (e) => { if (e.target !== input) open(); });
    zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('over'); }));
    zone.addEventListener('drop', (e) => review([...(e.dataTransfer.files || [])]));
    input.addEventListener('change', () => { review([...input.files]); input.value = ''; });

    function review(files) {
      files = files.filter((f) => /^image\//.test(f.type));
      if (!files.length) { Kit.toast('이미지 파일이 없어요.', 'error'); return; }
      const index = new Map();
      o.questions.forEach((q) => {
        const k = normName(q.answer);
        if (!index.has(k)) index.set(k, []);
        index.get(k).push(q);
      });
      const rows = files.map((file) => ({ file, url: URL.createObjectURL(file), targets: index.get(normName(file.name)) || [] }));
      const matched = rows.filter((r) => r.targets.length);
      const unmatched = rows.filter((r) => !r.targets.length);

      const replace = h('input', { type: 'checkbox', checked: true });
      const create = h('input', { type: 'checkbox', checked: !!o.createDefault });
      const go = h('button', { class: 'btn btn-primary' }, '등록');
      const close = () => { rows.forEach((r) => URL.revokeObjectURL(r.url)); bd.remove(); };

      const row = (r) => h('div', { class: `qk-bulk-row ${r.targets.length ? '' : 'miss'}` },
        h('img', { class: 'thumb', src: r.url, alt: '' }),
        h('div', { class: 'grow', style: { minWidth: 0 } },
          h('div', { class: 'ellipsis', style: { fontWeight: 600 } }, r.file.name),
          h('div', { class: 'faint link-sm ellipsis' }, r.targets.length
            ? `→ ${r.targets.map((t) => (t.themeName ? `${t.themeName} · ` : '') + t.answer + (t.image ? ' (이미지 교체)' : '')).join(', ')}`
            : '매칭되는 정답 없음')),
        h('span', { class: `badge ${r.targets.length ? 'badge-primary' : 'badge-ghost'}` }, r.targets.length ? '매칭' : '미매칭'));

      const bd = h('div', { class: 'modal-backdrop', on: { click: (e) => { if (e.target === bd && !go.disabled) close(); } } },
        h('div', { class: 'modal stack qk-bulk-modal' },
          h('h3', { class: 'heading-sm' }, '이미지 일괄 등록'),
          h('div', { class: 'row row-wrap' },
            h('span', { class: 'badge badge-ghost' }, `파일 ${rows.length}개`),
            h('span', { class: 'badge badge-primary' }, `매칭 ${matched.length}개`),
            h('span', { class: 'badge badge-ghost' }, `미매칭 ${unmatched.length}개`)),
          h('label', { class: 'row link-sm' }, replace, '이미 이미지가 있는 문제도 새 이미지로 교체'),
          o.createIn && unmatched.length ? h('label', { class: 'row link-sm' }, create, o.createLabel || '매칭 안 된 파일은 파일 이름을 정답으로 새 문제 추가') : null,
          h('div', { class: 'qk-bulk-list' }, [...matched, ...unmatched].map(row)),
          h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
            h('button', { class: 'btn btn-ghost', on: { click: () => { if (!go.disabled) close(); } } }, '취소'), go)));
      document.body.appendChild(bd);

      go.addEventListener('click', async () => {
        const jobs = [];
        matched.forEach((r) => {
          const targets = r.targets.filter((t) => replace.checked || !t.image);
          if (targets.length) jobs.push({ r, targets });
        });
        if (o.createIn && create.checked) unmatched.forEach((r) => jobs.push({ r, create: true }));
        if (!jobs.length) { Kit.toast('등록할 이미지가 없어요.', 'error'); return; }
        go.disabled = true;
        let done = 0, fail = 0;
        const BATCH = 6;
        for (let i = 0; i < jobs.length; i += BATCH) {
          const sets = [], creates = [];
          for (const job of jobs.slice(i, i + BATCH)) {
            try {
              const image = await Kit.resizeImage(job.r.file, { max: 800, quality: 0.8 });
              if (job.create) creates.push({ ...o.createIn, answer: baseName(job.r.file).slice(0, 60), image });
              else job.targets.forEach((t) => sets.push({ themeId: t.themeId || null, questionId: t.id, image }));
            } catch { fail++; }
            done++;
            go.textContent = `등록 중 ${done}/${jobs.length}`;
          }
          if ((sets.length || creates.length) && !(await api.act('bulkImages', { sets, creates }))) { fail += sets.length + creates.length; break; }
        }
        Kit.toast(fail ? `완료 (실패 ${fail}개)` : `이미지 ${jobs.length}개를 등록했어요.`, fail ? 'error' : '');
        close();
      });
    }
    return zone;
  }

  window.QuizKit = { renderPlayer, renderAdminControl, durationForm, questionManager, historyList, bulkImageZone };
})();
