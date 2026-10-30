/* 몸으로 말해요 — 관리자 (진행 로직·테마 관리는 js/themed-quiz.js 공통 구현 사용)
   제시어와 이미지는 참가자 화면에도 공개된다. 기본은 팀전 (진행 패널에서 개인전으로 전환 가능)
*/
(function () {
  'use strict';
  window.AdminGames['body-talk'] = ThemedQuiz.create({
    id: 'body-talk',
    defaultMode: 'team',
    revealImage: true,
    revealAnswer: true,
    note: '제시어와 이미지가 참가자 화면에도 함께 표시됩니다.',
    imageHint: '선택 (참가자 화면에도 정답과 함께 표시)',
  });
})();
