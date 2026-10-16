# 🎮 GAME NIGHT — QR 입장 팀 파티 게임

참가자는 휴대폰으로 QR을 찍어 입장하고, 진행자는 관리자 페이지에서 대기실 → 게임 선택 → 게임 진행을 조종하는 실시간 웹 게임입니다.

- **화면(웹사이트)**: GitHub Pages — 무료, 주소 예: `https://아이디.github.io/game-night/`
- **실시간 데이터**: Firebase Realtime Database + Authentication — 무료(Spark) 플랜으로 충분
- 서버 PC를 켜둘 필요가 없습니다. 인터넷만 되면 어디서든 접속됩니다.
- 디자인: `design/DESIGN-discord.md` × `design/DESIGN-dji.md` (모던 테마 레이어: `css/theme.css`)

---

## 처음 한 번만 하는 설정 (약 15분)

### 1단계. Firebase 프로젝트 만들기

1. https://console.firebase.google.com 접속 → Google 계정으로 로그인
2. **프로젝트 만들기** → 이름 입력(예: `game-night`) → Google 애널리틱스는 **사용 안 함** → 만들기

> 💡 Firebase 콘솔 메뉴 구성은 자주 바뀝니다. 메뉴가 안 보이면 아래 **바로가기 주소**의 `프로젝트ID` 부분만 바꿔 주소창에 넣으세요.
> 프로젝트 ID는 콘솔 주소창 `console.firebase.google.com/project/프로젝트ID/...` 에서 확인할 수 있습니다.

### 2단계. 로그인 방식 켜기 (Authentication)

1. **Authentication** 화면 열기 → **시작하기**
   - 바로가기: `https://console.firebase.google.com/project/프로젝트ID/authentication`
   - 메뉴로 찾기: 왼쪽 메뉴의 **보안(Security)** 또는 **빌드(Build)** 아래, 또는 **모든 제품(All products)**에서 Authentication
2. **로그인 방법** 탭에서 두 가지를 켭니다.
   - **익명** → 사용 설정 → 저장 *(참가자용: 가입 없이 입장)*
   - **이메일/비밀번호** → 사용 설정 → 저장 *(관리자용)*
3. **사용자** 탭 → **사용자 추가** → 관리자 이메일과 비밀번호 입력
   *(이 이메일/비밀번호로 관리자 페이지에 로그인합니다)*

### 3단계. 데이터베이스 만들기 (Realtime Database)

1. **Realtime Database** 화면 열기 → **데이터베이스 만들기**
   - 바로가기: `https://console.firebase.google.com/project/프로젝트ID/database`
   - 메뉴로 찾기: 왼쪽 메뉴의 **데이터베이스 및 스토리지(Databases & Storage)** 또는 **빌드(Build)** 아래, 또는 **모든 제품**에서 Realtime Database (Firestore 아님!)
2. 위치: **싱가포르(asia-southeast1)** → **잠금 모드로 시작** → 사용 설정
3. **규칙** 탭을 열고, 이 폴더의 `database.rules.json` 내용을 통째로 붙여넣기
4. 붙여넣은 내용에서 `ADMIN_EMAIL`을 **2단계에서 만든 관리자 이메일**로 모두 바꾸기 (총 7곳, Ctrl+H 사용)
5. **게시** 클릭

### 4단계. 웹 앱 등록 → `config.js` 채우기

1. 왼쪽 위 ⚙️ **프로젝트 설정** → 아래쪽 **내 앱** → 웹 아이콘 **`</>`** 클릭
2. 앱 닉네임 입력(예: `web`) → **앱 등록** (Firebase 호스팅은 체크하지 않음)
3. 화면에 나오는 `firebaseConfig = { ... }` 값을 이 폴더의 **`config.js`** 해당 칸에 붙여넣기
   - `databaseURL`이 없으면: Realtime Database 화면 위쪽의 `https://...firebasedatabase.app` 주소를 복사해 넣기

> `apiKey` 등은 공개되어도 괜찮은 값입니다. 데이터 보호는 3단계의 보안 규칙이 담당합니다.

### 5단계. GitHub Pages에 올리기

1. https://github.com 로그인 → 오른쪽 위 **+ → New repository**
2. 이름(예: `game-night`) 입력, **Public** 선택 → **Create repository**
3. **uploading an existing file** 링크 클릭 → 이 폴더 안의 파일과 폴더를 **모두** 끌어다 놓기 → **Commit changes**
4. 저장소의 **Settings → Pages** → Source: **Deploy from a branch**, Branch: **main / (root)** → **Save**
5. 1~2분 뒤 위쪽에 사이트 주소가 표시됩니다: `https://아이디.github.io/game-night/`

---

## 행사 당일 사용법

| 누가 | 주소 |
|---|---|
| 진행자(관리자) | `https://아이디.github.io/game-night/admin.html` |
| 참가자 | `https://아이디.github.io/game-night/` ← 관리자 화면의 **QR 코드**로 안내 |

1. 관리자 페이지에 로그인 → **진행** 화면의 QR을 **QR 크게 보기**로 띄우기
2. 참가자가 QR로 입장 → 닉네임·사진 설정 → 대기실에서 채팅
3. **참가자 · 팀**에서 A/B팀 배정 (🎲 랜덤 배정 가능)
4. **입장 마감 → 게임 선택 화면** → 게임 고르기 → 진행 패널에서 시작/정답/패스

> 타이머 종료는 **관리자 페이지가 열려 있을 때** 처리됩니다. 게임 중에는 관리자 페이지를 닫지 마세요.
> 처음 로그인하면 몸으로 말해요 기본 문제(테마 4개 × 20문제)가 자동으로 들어갑니다.
> 다음 행사 때는 **QR · 설정 → 행사 초기화**로 참가자·점수를 비우세요 (문제는 유지).

### 설정 없이 미리 둘러보기 (테스트 모드)

주소 뒤에 `?mock=1`을 붙이면 Firebase 없이 **같은 브라우저 안에서만** 동작하는 테스트 모드가 열립니다.
예: `admin.html?mock=1` (비밀번호 `admin1234`) 와 `index.html?mock=1` 을 같은 브라우저의 다른 탭에서 열기.

---

## 게임

| 게임 | 참가자 화면 | 관리자 |
|---|---|---|
| 🙆 몸으로 말해요 | 테마 · 도전 팀 · 큰 타이머 · **제시어+이미지(가운데 정렬)** | 테마 선택, 정답(+1점)/패스 → 바로 다음 문제 |
| 🕵️ 인물 퀴즈 | 인물 사진 + 타이머, 정답/패스 후 이름 공개 | 정답(+1점)/패스 → 바로 다음 문제 |
| 🧟 좀비 게임 | 큰 타이머 | 게임 시간 설정, 시작/일시정지/시간 추가 |

- 문제는 랜덤 출제되며, 한 번 나온 문제는 문제를 다 쓸 때까지 다시 나오지 않습니다.
- 실수로 누른 판정은 **↶ 마지막 판정 취소**로 되돌립니다(정답이었다면 1점 차감).
- 관리자 **콘텐츠 관리**에서 정답 · 이미지 · 게임 시간을 추가/수정/삭제합니다.
- **이미지 일괄 등록**: 콘텐츠 관리의 🖼️ 영역에 이미지 여러 장을 끌어다 놓으면 **파일 이름 = 정답**으로 자동 연결됩니다.
  예) `기생충.jpg`, `새우깡.png` · 띄어쓰기/기호/`(1)` 같은 사본 표시는 무시하고 비교합니다.
  인물 퀴즈는 `홍길동.jpg`처럼 올리면 정답 "홍길동"인 새 문제가 바로 만들어집니다.

---

## 폴더 구조

```
경주/
├─ index.html              참가자 화면
├─ admin.html              관리자 화면
├─ config.js               ★ Firebase 설정 (4단계에서 채우기)
├─ database.rules.json     ★ Firebase 보안 규칙 (3단계에서 붙여넣기)
├─ css/                    공통 스타일 (디자인 토큰 · 참가자 · 관리자 · 퀴즈)
├─ js/
│  ├─ backend.js           Firebase 연결 (+ 테스트 모드)
│  ├─ common.js            공통: 게임 목록, 데이터 → 화면 상태
│  ├─ player.js            참가자: 입장 · 대기실 · 채팅 · 게임 화면
│  ├─ admin.js             관리자: 진행 · 팀 · 채팅 · QR · 설정
│  ├─ quiz-engine.js       랜덤 출제/정답/패스/타이머 로직
│  ├─ quiz-kit.js          퀴즈형 게임 공통 화면
│  ├─ kit.js               공통 UI 유틸
│  └─ qr.js                QR 코드 생성기
├─ games/
│  ├─ games.json           게임 목록 (새 게임은 여기에 한 줄 추가)
│  ├─ body-talk/           몸으로 말해요 (admin.js · player.js · style.css · seed.json=기본 문제)
│  ├─ person-quiz/         인물 퀴즈
│  └─ zombie/              좀비 게임
└─ design/DESIGN-discord.md
```

## 새 게임 추가하기

1. `games/<게임id>/` 폴더에 `admin.js`, `player.js`, `style.css` 만들기 (기존 게임 복사 추천)
2. `games/games.json`에 `{ "id": "<게임id>", "name": "...", "icon": "🎲", "color": "primary", "description": "..." }` 추가
   - `admin.js` → `AdminGames['<id>'] = { action, control, content, tick?, seed?, publicSync?, onExit? }`
   - `player.js` → `GameViews['<id>'] = { render(root, game, ctx) }`
   - 공개 데이터는 `public/games/<id>`, 관리자 전용은 `admin/...` 경로에 저장 (참가자는 `admin`을 읽을 수 없음)

## 무료 플랜 참고

- Firebase 무료(Spark) 플랜의 Realtime Database는 **동시 접속 100명**까지입니다. 그 이상이면 유료(Blaze) 전환이 필요합니다.
- 이미지는 데이터베이스에 압축 저장됩니다(장당 약 100KB). 인물 사진 수십 장 정도는 무료 용량으로 충분합니다.
