# SYNK-talk

몽골어 화자를 위한 한국어 회화·교정 앱이자 SYNK의 학생 접점. Expo(앱)와 Supabase(DB·인증·서버 함수)를 사용한다.

작업 지침: [Codex](AGENTS.md) · [Claude](CLAUDE.md) · [Gemini/Antigravity](GEMINI.md) → [공통 원칙 연결](docs/공용지침.md)과 [저장소 규약](docs/이_저장소_규약.md). 공통 원문을 실제로 열고 현재 작업 사본의 변경을 확인한 뒤 이어간다.

## 현재 코드를 찾는 곳

아래는 코드 위치 안내다. 운영 배포·실기기·실학생 사용 완료 여부는 관련 결과와 배포 증거를 별도로 확인한다.

| 범위 | 진입로 |
|---|---|
| 앱·로그인·역할 화면 | `App.js`, `src/인증화면.js`, `src/인증API.js` |
| 과제 → 녹음 제출 → 교정 답장 | `src/말하기화면.js`, `src/사건통로.js`, `lib/제출로그.js`, `src/답장화면.js`, `lib/답장갱신.js` |
| 서버·검증·교정 | `supabase/functions/`, `lib/`, `prompts/교정.md` |
| 제품·API·저장 계약 | `docs/P0_제품계약.md`, `docs/C0_API계약.md`, `docs/L0_데이터계약.md`, `계약/수집_교정_계약.json` |
| 물리 스키마 | `supabase/migrations/` → `supabase/L0_스키마.sql` 합본 |
| 배포·실기기 확인 | `docs/배포_경로.md`, `docs/_ops/배포장부.jsonl`, `docs/실기기_검수목록.md` |

`App.js`의 기본 학생 화면은 말하기이며 저장된 인증 세션을 복원한다. 도착 확인은 시스템 확인 화면이다. 날짜가 붙은 예전 기능 수·완료 표시는 당시 기록이므로 현재 상태를 대신하지 않는다. 회사의 다음 작업은 SYNK-appsscript `docs/_ops/결정.md`·`docs/_ops/트랙.md`와 현재 작업·PR에서 확인한다.

## 실행과 확인

```powershell
npm start
npm run web
node --test tests/<관련 파일>
```

전체 시험은 `npm test`다. 현재 구현·기기 지원과 실행 옵션은 `package.json`·`tools/앱시작.js`를 확인한다. 첫 학생 흐름의 로컬 미리보기는 `node tools/첫흐름미리보기.js --빌드`로 생성한 뒤 로컬 서버를 실행한다. 미리보기를 실제 녹음·서버·기기 검증으로 보고하지 않는다.

기존 Git 훅 설정은 `git config --get core.hooksPath`로 조회한다. 커밋의 자격증명·비밀 검사와 배포 알림 도구는 보존한다. 새 작업을 열었다는 이유만으로 훅 설치를 반복하거나 빈 설정을 복원하지 않는다. `npm run setup`은 기존 구성을 명시적으로 연결하는 선택 명령이다.

## 교정 품질

교정 프롬프트는 `prompts/교정.md`, 합성 평가 자료와 결과는 `evals/`에 있다. `npm run eval`은 지정된 로컬 출력 파일의 채점이며 새 모델 호출이나 실학생 검증이 아니다. 수치가 필요하면 [평가 결과](evals/결과.md)의 입력·평가일·모델·반복 변동과 현재 코드를 먼저 대조한다.

## 브랜드 자산

SYNK-appsscript의 현재 `DESIGN.md`·`docs/디자인_토큰.json`·폰트·마스코트 정본과 승인 실물을 먼저 읽는다. 앱 소비 위치는 `src/테마.js`·`src/기호.js`·`src/소리.js`·`assets/`다. 새 색·서체를 이 안내에 복사하지 않는다.

아이콘은 `node tools/make-icons.js`로 생성한다. 원본 변경 시 생성 코드와 `tests/아이콘.test.js`를 확인해 필요한 소비물을 갱신하고 실제 결과를 검증한다. 원본·앱 파일·배포된 빌드의 반영 상태를 구분한다.
