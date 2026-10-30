/* 초성 퀴즈 — 관리자 (진행 로직·테마 관리는 js/themed-quiz.js 공통 구현 사용)
   참가자 화면에는 정답의 초성만 보이고(예: 기생충 → ㄱㅅㅊ), 정답은 정답/패스 처리 후 공개된다.
   기본은 개인전 — 맞힌 사람을 누르면 개인 +1 (소속 팀이 있으면 팀도 +1)
*/
(function () {
  'use strict';
  window.AdminGames.chosung = ThemedQuiz.create({
    id: 'chosung',
    defaultMode: 'solo',
    revealImage: false,
    revealAnswer: false,
    hintOf: (q) => QuizEngine.chosung(q.answer),
    note: '참가자 화면에는 초성만 보이고, 정답은 맞힌 뒤 공개돼요.',
    imageHint: '선택 (정답 공개 때 진행자 화면에서 확인용)',
  });
})();
