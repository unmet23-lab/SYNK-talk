'use strict';
/**
 * 몽골어 감수 **1차 목록** — 감수자에게 실제로 넘어가는 문장의 정본.
 *
 * ■ 1차의 정의 = 「확정됐고 · 안 바뀌고 · 없으면 학생이 **막힌다**」
 *   그래서 **넣지 않은 것**부터 적는다(빠뜨린 게 아니라 판정이다):
 *   🚫 **광고·사전등록 문구** — 대외 발표가 잠겨 있다(형제 저장소 SYNK-appsscript `docs/추천_사전등록_정본_v1.md` 머리말 ·
 *      해제 2026-12, 얼리버드 가격 미정). **문장이 아직 없다.** 몽골어법 6.1.10(광고는 몽골어)은
 *      그 문장이 생기는 날 걸린다.
 *   🚫 **앱 본문 문구 대부분**(말하기·반피드백·회고 등 ≈300) — 「정본·발표물 전량 리라이팅」이
 *      진행 중이다(형제 저장소 SYNK-appsscript `docs/_ops/결정.md`). 지금 감수시키면 리라이팅 뒤 **두 번** 본다.
 *   👉 여기 든 넷은 전부 **기능이 막히는 자리**라 브랜드 톤이 바뀌어도 문장이 안 흔들린다.
 *
 * ■ 🔴 이 파일이 **아직 못 하는 것 둘** — 번역이 와도 화면에 안 뜬다. 미루는 것이지 없는 게 아니다.
 *   ① ✅ **닫혔다(08-26)** — code→문구 표가 섰다: `contents/문구_오류.js`.
 *      전에는 서버가 한국어 `message` 를 만들어 보내고 앱이 그대로 띄워, 번역이 와도 붙일 자리가
 *      없었다. 이제 문장은 앱이 쥐고 서버는 코드만 보낸다(C0 §5 「앱이 분기하는 것은 code」).
 *      그래서 `err.*` 전량의 `source_file` 이 그 표를 가리킨다 — **다섯**만 서버에 남아 있다
 *      (`CONTRACT_VIOLATION` 처럼 코드 하나가 여러 말을 하는 갈래라 코드로 못 고른다).
 *      ⇒ 감수가 끝나면 그 파일의 `mn` 만 채운다. 화면 코드는 한 줄도 안 바뀐다.
 *   ② **키릴 글리프를 가진 폰트가 없다.** `assets/fonts` = SUIT 4종 + DM Mono, 넷 다 키릴이 없다.
 *      정본은 Inter Tight cyrillic-ext 이고 미탑재다(`src/테마.js` `몽골어` 상수).
 *      지금은 `fontFamily` 를 **일부러 비워** 시스템 폰트가 그린다 — 뜨긴 뜨되 **브랜드 밖 글자**다.
 *      ⇒ 감수는 지금 돌려도 된다(문장은 안 변한다). 화면에 «제대로» 서는 날은 그 한 줄이 오는 날이다.
 *
 * ■ 칸 이름을 **DB 열 이름 그대로** 쓴 까닭
 *   이 파일은 `engine.l10n_strings` 의 입력이다. 이름이 1:1 이면 반입 도구에 **대응표가 없고**,
 *   대응표가 없으면 갈라질 것도 없다(`tests/문구감수.test.js` 머리말과 같은 규율).
 *   `source_file` 만 DB 열이 아니다 — **반입 때 버려진다.** 그 칸이 있는 이유는 아래 ■ 하나뿐이다.
 *
 * ■ 🔑 `source_file` = 이 목록이 **썩지 않게** 하는 유일한 장치
 *   누가 `인증화면.js` 의 버튼 글자를 다듬으면 이 파일은 조용히 **옛 문장**을 감수자에게 보낸다.
 *   증상은 없다(감수는 잘 끝난다). 그래서 `tests/문구_1차.test.js` 가 매 커밋에
 *   **원문이 그 파일에 실제로 있는지** 대조한다. 문장을 고치면 그 검사가 빨개진다.
 *
 * ■ `max_len` = 자리의 **폭 예산**이지 문장 길이 취향이 아니다
 *   기준 = 360dp 폭(우리가 바닥으로 잡는 기기) · 좌우 여백 24 ⇒ 쓸 수 있는 폭 312dp.
 *   키릴 평균 자폭 ≈ 0.55 × fontSize 로 잡고 한 줄에 들어가는 글자수를 낸 뒤 여유를 뺐다.
 *   **`null` = 마음껏 줄바꿈해도 되는 자리**(카드 본문·오류 줄·캡션). 숫자는 한 줄짜리 자리다.
 *
 * ■ `{n}` 은 숫자가 들어가는 칸이다 — 옮길 때 그대로 둔다(예: `비밀번호는 {n}자 이상`).
 */

/** 반입 때 DB 로 가는 칸. 여기 없는 칸(`source_file`)은 버린다 — 도구가 이 배열 하나만 본다. */
const 반입칸 = Object.freeze(['string_id', 'source_ko', 'draft_mn', 'context', 'max_len']);

/* 아이막 22 — 유일하게 **초벌을 채워 보내는** 묶음이다.
 * 까닭: 고유명사 음역이라 감수자가 「맞다/틀리다」만 보면 되고, 빈칸으로 보내면 22줄을 손으로
 * 치게 만든다. 나머지 전부는 `draft_mn: null` — 지어낸 번역을 감수 큐에 섞지 않는다
 * (`contents/문구_동의.js` 머리말: 틀린 몽골어는 없는 것보다 나쁘다).
 * ⚠ 값(`값`)은 그대로 ASCII 다 — 바뀌는 것은 **보이는 라벨**뿐이다. */
const 아이막초벌 = Object.freeze({
  ulaanbaatar: 'Улаанбаатар', arkhangai: 'Архангай', 'bayan-olgii': 'Баян-Өлгий',
  bayankhongor: 'Баянхонгор', bulgan: 'Булган', 'darkhan-uul': 'Дархан-Уул',
  dornod: 'Дорнод', dornogovi: 'Дорноговь', dundgovi: 'Дундговь',
  'govi-altai': 'Говь-Алтай', govisumber: 'Говьсүмбэр', khentii: 'Хэнтий',
  khovd: 'Ховд', khovsgol: 'Хөвсгөл', omnogovi: 'Өмнөговь',
  orkhon: 'Орхон', ovorkhangai: 'Өвөрхангай', selenge: 'Сэлэнгэ',
  sukhbaatar: 'Сүхбаатар', tov: 'Төв', uvs: 'Увс', zavkhan: 'Завхан',
});

const 목록 = [
  /* ── ① 막힘·동의 안내 ─────────────────────────────────────────────────────
   * 법적 자리다. 이해 못 한 동의는 동의가 아니다. 리라이팅 대상도 아니다(기능 문구).
   * ⚠ 이 넷은 화면이 **한국어 위에 몽골어를 한 줄 더** 얹는 구조다(`src/막힘카드.js` 병기).
   *   즉 대체가 아니라 병기 — 감수자는 「한국어를 지우는 번역」이 아니라 짝을 만든다. */
  {
    string_id: 'block.consent_missing.title',
    source_ko: '아직 시작 준비가 하나 남았어요',
    draft_mn: null,
    context: '학생이 앱을 열었는데 개인정보 동의가 아직 안 옮겨 적혀 막힌 화면의 제목. 학생을 탓하지 않는다 — 「너의 잘못」이 아니라 「하나 남았다」.',
    max_len: 48,
    source_file: 'contents/문구_동의.js',
  },
  {
    string_id: 'block.consent_missing.body',
    source_ko: '개인정보 동의 확인 한 걸음만 남았어요!\n선생님께 학생번호를 보여 주시면 바로 열려요.',
    draft_mn: null,
    context: '위 제목의 본문. 🔑 줄바꿈(\\n)을 그대로 둔다 — 두 줄이 각각 다른 말이다(①남은 것 ②학생이 할 일). 아래에 학생번호가 크게 뜬다.',
    max_len: null,
    source_file: 'contents/문구_동의.js',
  },
  {
    string_id: 'block.unknown.title',
    source_ko: '시작 준비를 하고 있어요!',
    draft_mn: null,
    context: '서버가 우리가 모르는 막힘 코드를 냈을 때의 제목. 학생은 이유를 알 수 없으므로 「선생님께 보여 달라」로만 이끈다.',
    max_len: 48,
    source_file: 'contents/문구_동의.js',
  },
  {
    string_id: 'block.unknown.body',
    source_ko: '선생님께 이 화면을 보여 주세요.',
    draft_mn: null,
    context: '위 제목의 본문. 학생이 스스로 풀 수 없는 상황이라 다음 걸음이 하나뿐이다.',
    max_len: null,
    source_file: 'contents/문구_동의.js',
  },

  /* ── ② OS 권한 문구 ───────────────────────────────────────────────────────
   * 🔑 우리 화면이 아니라 **iOS/안드로이드가 띄우는 창**이다. 브랜드 톤이 안 닿는 자리라
   *   리라이팅과 무관하고, 이미 초벌 몽골어가 붙어 있다 — 이 줄은 **감수만** 하면 끝난다. */
  {
    string_id: 'app.permission.microphone',
    source_ko: '말하기 연습을 녹음할 때만 마이크를 사용해요.',
    draft_mn: 'Зөвхөн ярианы дасгал бичих үед микрофон ашиглана.',
    context: 'iOS 마이크 권한 요청 창에 뜨는 한 줄. 앱 안이 아니라 OS 창이라 한국어·몽골어를 「 · 」로 이어 한 줄에 넣는다. 이미 초벌이 있으니 맞는지만 봐 주면 된다.',
    max_len: 120,
    source_file: 'app.json',
  },

  /* ── ③ 오류·막힘 메시지 ───────────────────────────────────────────────────
   * 🔴 «막혔을 때 읽는 글»이다 — 몽골어가 없으면 학생이 스스로 못 푼다. 기능 문구라 리라이팅 대상 아님.
   * 🔑 키를 **오류 코드**로 잡았다(머리말 ①). 문장은 지금 서버에 있지만, 번역이 설 자리는 앱이다.
   * ⚠ 「선생님과 함께 챙길게요」 셋(answer/record/speech)은 형제다 — 명사만 다르다.
   *   감수자가 셋을 **같은 리듬**으로 옮겨야 학생이 같은 종류의 일로 읽는다. */
  {
    string_id: 'err.network',
    source_ko: '인터넷 연결을 확인해 주세요',
    draft_mn: null,
    context: '전화가 서버에 아예 못 닿았을 때. 다시 시도하면 되는 종류다.',
    max_len: null,
    source_file: 'contents/문구_오류.js',
  },
  {
    string_id: 'err.config',
    source_ko: '서버 설정이 없어요',
    draft_mn: null,
    context: '앱이 서버 주소를 못 들고 있는 상태(우리 잘못). 학생이 할 수 있는 일이 없어 학원에 알려야 한다.',
    max_len: null,
    source_file: 'contents/문구_오류.js',
  },
  {
    string_id: 'err.auth_expired',
    source_ko: '로그인이 풀렸어요 — 다시 로그인해 주세요',
    draft_mn: null,
    context: '한 시간 넘게 쓴 뒤 토큰이 만료됐을 때. 다시 로그인하면 바로 이어진다 — 「잃어버렸다」로 읽히면 안 된다.',
    max_len: null,
    source_file: 'contents/문구_오류.js',
  },
  {
    string_id: 'err.no_token',
    source_ko: '로그인이 풀렸어요',
    draft_mn: null,
    context: '위와 같은 상황인데 화면이 다음 걸음을 따로 그려 주는 자리라 문장이 짧다.',
    max_len: null,
    source_file: 'contents/문구_오류.js',
  },
  {
    string_id: 'err.kept.answer',
    source_ko: '이 답은 선생님과 함께 챙길게요 — 이 화면을 보여 주세요!',
    draft_mn: null,
    context: '학생의 «답»이 서버에 못 갔을 때. 🔑 「실패」가 아니라 「선생님과 같이 챙긴다」로 말한다(유호 확정 08-22 시스템 말투). 아래 둘과 한 벌.',
    max_len: null,
    source_file: 'contents/문구_오류.js',
  },
  {
    string_id: 'err.kept.record',
    source_ko: '이 기록은 선생님과 함께 챙길게요 — 이 화면을 보여 주세요!',
    draft_mn: null,
    context: '위와 같은 말인데 대상이 «기록»이다. 괄호 안에 개발용 원인이 덧붙는데 그건 옮기지 않는다.',
    max_len: null,
    source_file: 'contents/문구_오류.js',
  },
  {
    string_id: 'err.kept.speech',
    source_ko: '이 발화는 선생님과 함께 챙길게요 — 이 화면을 보여 주세요!',
    draft_mn: null,
    context: '위와 같은 말인데 대상이 «발화(말한 것)»다.',
    max_len: null,
    source_file: 'contents/문구_오류.js',
  },
  {
    string_id: 'err.kept.no_task',
    source_ko: '그날 서버 과제를 못 받아 기기에만 남겼어요',
    draft_mn: null,
    context: '그날 서버가 과제를 못 줘 발화가 기기에만 남았을 때. 위 셋과 달리 다시 보내도 안 풀리는 갈래라 사실만 말한다 — 「기다리면 간다」로 읽히면 안 된다.',
    max_len: null,
    source_file: 'contents/문구_오류.js',
  },
  {
    string_id: 'err.upload.bad_format',
    source_ko: '올릴 수 없는 형식이에요: .{ext}',
    draft_mn: null,
    context: '녹음 파일의 형식을 서버가 받지 못할 때. {ext} 자리에 파일 확장자가 들어간다(예: m4a) — {ext} 는 그대로 둔다.',
    max_len: null,
    source_file: 'contents/문구_오류.js',
  },
  {
    string_id: 'err.upload.file_missing',
    source_ko: '녹음 파일을 찾지 못했어요',
    draft_mn: null,
    context: '올리려는 녹음 파일이 기기에서 사라졌을 때. 다시 녹음하면 풀리는 종류다.',
    max_len: null,
    source_file: 'contents/문구_오류.js',
  },
  {
    string_id: 'err.upload.no_url',
    source_ko: '업로드 주소를 받지 못했어요',
    draft_mn: null,
    context: '서버가 녹음 올릴 주소를 안 줬을 때(우리 쪽 문제). 잠시 뒤 다시 하면 되는 종류다.',
    max_len: null,
    source_file: 'contents/문구_오류.js',
  },
  {
    string_id: 'err.upload.failed',
    source_ko: '녹음을 올리지 못했어요: {원인}',
    draft_mn: null,
    context: '녹음 업로드가 실패했을 때. {원인} 자리에 실패 원인 문구가 들어간다 — {원인} 은 옮기지 말고 그대로 둔다.',
    max_len: null,
    source_file: 'contents/문구_오류.js',
  },
  {
    string_id: 'err.delivery_slow',
    source_ko: '전달이 조금 늦어지고 있어요',
    draft_mn: null,
    context: '서버가 이유를 안 알려줬을 때의 기본 문장. 잃어버린 게 아니라 늦는 것이라는 뜻이 살아야 한다.',
    max_len: null,
    source_file: 'contents/문구_오류.js',
  },
  {
    string_id: 'err.retry_later',
    source_ko: '잠시 뒤 다시 시도해 주세요',
    draft_mn: null,
    context: '서버가 잠깐 흔들렸을 때. 앱과 서버 양쪽이 같은 문장을 쓴다.',
    max_len: null,
    source_file: 'contents/문구_오류.js',
  },
  {
    string_id: 'err.login_failed',
    source_ko: '학생번호 또는 비밀번호가 맞지 않습니다',
    draft_mn: null,
    context: '🔑 어느 쪽이 틀렸는지 **일부러 안 알려준다**(남의 번호를 떠보지 못하게). 번역도 둘을 가르면 안 된다.',
    max_len: null,
    source_file: 'contents/문구_오류.js',
  },
  {
    string_id: 'err.refresh_failed',
    source_ko: '다시 로그인해 주세요',
    draft_mn: null,
    context: '자동 갱신이 실패했을 때. 학생이 할 일은 하나뿐이다.',
    max_len: null,
    source_file: 'contents/문구_오류.js',
  },
  {
    string_id: 'err.signup_gate_failed',
    source_ko: '학생번호 또는 전화번호 뒤 4자리가 맞지 않습니다. 계속 안 되면 학원에 문의해 주세요.',
    draft_mn: null,
    context: '첫 등록에서 본인 확인이 안 됐을 때. 🔑 여기도 어느 칸이 틀렸는지 안 가른다. 뒷문장(학원 문의)이 막다른 길을 막는 자리라 꼭 살려야 한다.',
    max_len: null,
    source_file: 'supabase/functions/auth/index.ts',
  },
  {
    string_id: 'err.auth_required',
    source_ko: '로그인이 필요합니다',
    draft_mn: null,
    context: '토큰 없이 요청이 왔을 때 서버가 내는 말.',
    max_len: null,
    source_file: 'supabase/functions/auth/index.ts',
  },
  {
    string_id: 'err.id_format',
    source_ko: '학생번호 형식이 아닙니다',
    draft_mn: null,
    context: '학생번호가 SYNK-042 꼴이 아닐 때. 예시(SYNK-042)는 화면 입력칸이 이미 보여 준다.',
    max_len: null,
    source_file: 'supabase/functions/auth/index.ts',
  },
  {
    string_id: 'err.password_too_short',
    source_ko: '비밀번호는 {n}자 이상으로 정해 주세요',
    draft_mn: null,
    context: '{n} 자리에 숫자가 들어간다(지금 6). 🔑 숫자를 문장에 박지 말고 {n} 을 그대로 둔다 — 기준이 바뀌면 문장이 아니라 숫자만 바꾼다.',
    max_len: null,
    source_file: 'supabase/functions/auth/index.ts',
  },
  {
    string_id: 'err.password_too_long',
    source_ko: '비밀번호가 너무 깁니다 — 짧게 정해 주세요',
    draft_mn: null,
    context: '비밀번호가 바이트 상한을 넘었을 때.',
    max_len: null,
    source_file: 'supabase/functions/auth/index.ts',
  },
  {
    string_id: 'err.not_configured',
    source_ko: '앱 설정이 아직 연결되지 않았어요. 학원에 알려 주세요.',
    draft_mn: null,
    context: '🔑 값이 비어 있는데 「맞지 않습니다」라고 하면 학생이 **자기 번호를 의심한다**. 그래서 우리 잘못임을 밝히는 문장이다.',
    max_len: null,
    source_file: 'contents/문구_오류.js',
  },
  {
    string_id: 'err.try_again',
    source_ko: '잠시 뒤 다시 해주세요',
    draft_mn: null,
    context: '화면이 이유를 못 받았을 때의 마지막 기본값.',
    max_len: null,
    source_file: 'contents/문구_오류.js',
  },

  /* ── ④ 로그인·첫등록 화면 ─────────────────────────────────────────────────
   * 모든 학생의 **첫 화면**이다. 여기서 못 들어오면 나머지 300줄은 의미가 없다.
   * 말투: 「이미 온 사람이 읽는 안내물」 — 설득 0, 결론 먼저(`src/인증화면.js` 머리말). */
  {
    string_id: 'auth.title.login',
    source_ko: '들어가기',
    draft_mn: null,
    context: '로그인 화면의 큰 제목(26px, 한 줄). 아래 버튼과 같은 낱말이다 — 같게 옮겨도 된다.',
    max_len: 18,
    source_file: 'src/인증화면.js',
  },
  {
    string_id: 'auth.title.first',
    source_ko: '처음 오셨네요',
    draft_mn: null,
    context: '첫 등록 화면 제목. 반기는 말이지 안내가 아니다.',
    max_len: 18,
    source_file: 'src/인증화면.js',
  },
  {
    string_id: 'auth.title.temp',
    source_ko: '임시번호로 들어가기',
    draft_mn: null,
    context: '비밀번호를 잊어 학원에서 6자리를 받아 온 학생의 화면 제목.',
    max_len: 18,
    source_file: 'src/인증화면.js',
  },
  {
    string_id: 'auth.title.change',
    source_ko: '비밀번호 바꾸기',
    draft_mn: null,
    context: '비밀번호 변경 화면 제목.',
    max_len: 18,
    source_file: 'src/인증화면.js',
  },
  {
    string_id: 'auth.button.login',
    source_ko: '들어가기',
    draft_mn: null,
    context: '로그인 버튼(16px, 한 줄). 짧을수록 좋다.',
    max_len: 30,
    source_file: 'src/인증화면.js',
  },
  {
    string_id: 'auth.button.first',
    source_ko: '시작하기',
    draft_mn: null,
    context: '첫 등록을 마치는 버튼. 「가입」이 아니라 「시작」이다 — 학생은 이미 학원에 등록돼 있다.',
    max_len: 30,
    source_file: 'src/인증화면.js',
  },
  {
    string_id: 'auth.button.temp',
    source_ko: '새 비밀번호로 시작하기',
    draft_mn: null,
    context: '임시번호를 새 비밀번호로 바꾸며 들어가는 버튼. 넷 중 가장 길다 — 폭 예산이 여기서 걸린다.',
    max_len: 30,
    source_file: 'src/인증화면.js',
  },
  {
    string_id: 'auth.button.change',
    source_ko: '바꾸기',
    draft_mn: null,
    context: '비밀번호 변경 버튼.',
    max_len: 30,
    source_file: 'src/인증화면.js',
  },
  {
    string_id: 'auth.field.student_id',
    source_ko: '학생번호',
    draft_mn: null,
    context: '입력칸 라벨. 학원이 준 SYNK-042 꼴 번호. 이 낱말은 막힘 카드에도 나온다 — 같은 말로 옮겨야 학생이 같은 것으로 안다.',
    max_len: 22,
    source_file: 'src/인증화면.js',
  },
  {
    string_id: 'auth.field.phone_last4',
    source_ko: '전화번호 뒤 4자리',
    draft_mn: null,
    context: '첫 등록에서 본인 확인에 쓰는 입력칸 라벨.',
    max_len: 22,
    source_file: 'src/인증화면.js',
  },
  {
    string_id: 'auth.field.temp_code',
    source_ko: '학원에서 받은 6자리',
    draft_mn: null,
    context: '임시번호 입력칸 라벨. 「어디서 받는지」가 라벨 안에 들어 있다 — 그 정보를 잃으면 안 된다.',
    max_len: 22,
    source_file: 'src/인증화면.js',
  },
  {
    string_id: 'auth.field.password',
    source_ko: '비밀번호',
    draft_mn: null,
    context: '로그인 화면의 비밀번호 입력칸 라벨.',
    max_len: 22,
    source_file: 'src/인증화면.js',
  },
  {
    string_id: 'auth.field.password_now',
    source_ko: '지금 비밀번호',
    draft_mn: null,
    context: '변경 화면에서 «현재» 비밀번호를 넣는 칸. 아래 「새 비밀번호」와 **한눈에 갈려야** 한다.',
    max_len: 22,
    source_file: 'src/인증화면.js',
  },
  {
    string_id: 'auth.field.password_new',
    source_ko: '새 비밀번호',
    draft_mn: null,
    context: '변경 화면에서 새로 정하는 칸. 위 「지금 비밀번호」와 짝이다.',
    max_len: 22,
    source_file: 'src/인증화면.js',
  },
  {
    string_id: 'auth.field.password_set',
    source_ko: '쓸 비밀번호',
    draft_mn: null,
    context: '첫 등록·임시번호 화면에서 처음 정하는 칸(바꾸는 게 아니라 «정하는» 것이다).',
    max_len: 22,
    source_file: 'src/인증화면.js',
  },
  {
    string_id: 'auth.field.email',
    source_ko: '이메일',
    draft_mn: null,
    context: '첫 등록의 선택 입력칸.',
    max_len: 22,
    source_file: 'src/인증화면.js',
  },
  {
    string_id: 'auth.field.phone_alt',
    source_ko: '다른 전화번호',
    draft_mn: null,
    context: '첫 등록의 선택 입력칸(가족 번호 등). 위 「전화번호 뒤 4자리」와 다른 것임이 드러나야 한다.',
    max_len: 22,
    source_file: 'src/인증화면.js',
  },
  {
    string_id: 'auth.hint.password_min',
    source_ko: '{n}자 이상',
    draft_mn: null,
    context: '비밀번호 칸 오른쪽에 작게 붙는 도움말(12px). 라벨과 같은 줄을 나눠 쓰므로 **매우 짧아야** 한다. {n} 자리에 숫자가 들어간다(지금 6) — 그대로 둔다.',
    max_len: 12,
    source_file: 'src/인증화면.js',
  },
  {
    string_id: 'auth.contact.head',
    source_ko: '연락처 (넣지 않아도 시작할 수 있어요)',
    draft_mn: null,
    context: '첫 등록의 선택 묶음 머리말. 🔑 괄호 안이 핵심이다 — 이게 없으면 학생이 필수인 줄 알고 멈춘다.',
    max_len: 34,
    source_file: 'src/인증화면.js',
  },
  {
    string_id: 'auth.contact.tail',
    source_ko: '비밀번호를 잊었을 때 학원이 본인인지 확인하는 데만 써요. 여기로 연락은 가지 않아요.',
    draft_mn: null,
    context: '위 묶음의 꼬리말(12px, 줄바꿈 자유). 개인정보를 왜 받는지·어디에 안 쓰는지 둘 다 말한다 — 뒷문장을 빼면 안 된다.',
    max_len: null,
    source_file: 'src/인증화면.js',
  },
  {
    string_id: 'auth.link.first',
    source_ko: '처음 오셨나요',
    draft_mn: null,
    context: '로그인 화면 아래 작은 링크 → 첫 등록으로. 물음표 없는 물음이다.',
    max_len: 34,
    source_file: 'src/인증화면.js',
  },
  {
    string_id: 'auth.link.forgot',
    source_ko: '비밀번호를 잊었어요',
    draft_mn: null,
    context: '로그인 화면 아래 작은 링크 → 임시번호 화면으로.',
    max_len: 34,
    source_file: 'src/인증화면.js',
  },
  {
    string_id: 'auth.link.back',
    source_ko: '← 돌아가기',
    draft_mn: null,
    context: '로그인 화면으로 되돌아가는 링크. 화살표(←)는 그대로 두고 글자만 옮긴다.',
    max_len: 34,
    source_file: 'src/인증화면.js',
  },

  /* ── ④-2 첫 등록 1회 문항 ─────────────────────────────────────────────────
   * 🔴 **딱 한 번 묻고 다시는 안 묻는다**(L0 §850 — 유일한 완전 소급 불가).
   *   못 알아들으면 그 학생의 세 칸이 영영 틀린 값이다. 1차에 드는 이유가 이것이다. */
  {
    string_id: 'signup.q.home_aimag',
    source_ko: '자란 곳',
    draft_mn: null,
    context: '첫 등록 문항 라벨. 「지금 사는 곳」이 아니라 «자란» 곳이다 — 그 차이가 살아야 한다.',
    max_len: 22,
    source_file: 'lib/가입문항.js',
  },
  {
    string_id: 'signup.q.gender',
    source_ko: '성별',
    draft_mn: null,
    context: '첫 등록 문항 라벨. 아래 보기 셋(여·남·밝히지 않음)의 머리다.',
    max_len: 22,
    source_file: 'lib/가입문항.js',
  },
  {
    string_id: 'signup.q.goal',
    source_ko: '한국어를 배우는 목적',
    draft_mn: null,
    context: '첫 등록 문항 라벨. 아래 보기 셋(유학·취업·K컬처)의 머리다.',
    max_len: 22,
    source_file: 'lib/가입문항.js',
  },
  {
    string_id: 'signup.gender.female',
    source_ko: '여',
    draft_mn: null,
    context: '성별 보기 칩. 셋이 한 줄에 나란히 서므로(여·남·밝히지 않음) 길이가 비슷해야 줄이 안 무너진다. 한국어는 한 글자다.',
    max_len: 14,
    source_file: 'lib/가입문항.js',
  },
  {
    string_id: 'signup.gender.male',
    source_ko: '남',
    draft_mn: null,
    context: '성별 보기 칩. 위 「여」와 짝이라 같은 만큼 짧아야 한다 — 한쪽만 길면 칩 두 개의 크기가 눈에 띄게 갈린다.',
    max_len: 14,
    source_file: 'lib/가입문항.js',
  },
  {
    string_id: 'signup.gender.undisclosed',
    source_ko: '밝히지 않음',
    draft_mn: null,
    context: '🔑 건너뛰기가 아니라 **보기 안에 있는 선택**이다(기록된 비공개 ≠ 빈 칸). 「모름」이나 「기타」로 옮기면 뜻이 죽는다.',
    max_len: 14,
    source_file: 'lib/가입문항.js',
  },
  {
    string_id: 'signup.goal.study',
    source_ko: '유학',
    draft_mn: null,
    context: '목적 보기 칩 — 한국 대학·어학당으로 가려는 학생. 아래 두 칩과 한 줄에 선다.',
    max_len: 14,
    source_file: 'lib/가입문항.js',
  },
  {
    string_id: 'signup.goal.work',
    source_ko: '취업 (EPS)',
    draft_mn: null,
    context: '목적 보기 칩 — 고용허가제(EPS) 한국어능력시험을 보는 학생. **EPS 는 그대로 둔다**(몽골에서 통용되는 이름).',
    max_len: 14,
    source_file: 'lib/가입문항.js',
  },
  {
    string_id: 'signup.goal.culture',
    source_ko: 'K컬처',
    draft_mn: null,
    context: '목적 보기 칩 — 드라마·음악으로 배우러 온 학생. 몽골에서 쓰는 표기가 따로 있으면 그것으로.',
    max_len: 14,
    source_file: 'lib/가입문항.js',
  },
];

/* 아이막 22 — 위 목록 뒤에 붙인다. 지금 화면은 로마자를 그린다(`lib/가입문항.js` 가 값에서
 * 만든다). 몽골 학생이 **자기 고향 이름을 로마자로** 보는 화면이라, 이 22줄이 서면 그 자리가
 * 제 글자를 되찾는다.
 * ⚠ 이건 문장 번역이 아니라 **코드 변경도 함께** 필요하다 — 지금은 라벨을 값에서 만들어 내므로
 *   표가 설 자리가 없다. 그 조각은 번역이 확정된 뒤에 붙인다(없는 표를 미리 만들지 않는다). */
for (const [값, 초벌] of Object.entries(아이막초벌)) {
  목록.push({
    string_id: `signup.aimag.${값}`,
    source_ko: 값,
    draft_mn: 초벌,
    context: '첫 등록 「자란 곳」 보기 칩. 몽골 아이막 이름이라 번역이 아니라 **표기 확인**이다 — 초벌이 맞으면 그대로 두면 된다.',
    max_len: 14,
    source_file: 'lib/가입문항.js',
  });
}

const 문구_1차 = Object.freeze(목록.map((x) => Object.freeze(x)));

module.exports = { 문구_1차, 반입칸, 아이막초벌 };
