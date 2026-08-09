'use strict';
/**
 * 인증 API — 앱이 서버와 주고받는 자리 하나 (C0 §2 · §4-4~4-6).
 *
 * 🔑 **합성 이메일·학생번호 규칙은 여기서 만들지 않는다.** `lib/학생계정.js` 를 그대로 부른다 —
 *   Edge Function 도 같은 파일을 동봉으로 싣는다(L0 §4-2). 두 곳에 적으면 갈라지고,
 *   갈라졌을 때 증상은 「어떤 학생만 로그인이 안 된다」뿐이라 원인을 찾는 데 가장 오래 걸린다.
 *
 * 🔴 **`signUp` 을 부르지 않는다**(C0 §2-3 · 영원히). 계정 생성은 `/auth/first-login` 뿐이다.
 * 🔴 **비밀번호는 손대지 않는다** — 트림·대문자화하면 학생이 정한 값과 달라진다.
 *   아이디만 정규화한다(그 규칙도 `lib/학생계정.js`).
 * 🔴 앱은 자기가 누구인지 본문에 안 적는다 — `learner_id` 를 실으면 서버가 400 을 준다.
 *
 * ⚠ `EXPO_PUBLIC_*` 는 **번들에 인라인**된다. 그래서 여기 있어도 되는 것은 **anon 키뿐**이고,
 *   `service_role` 은 어떤 경우에도 앱에 두지 않는다(`tools/guard.js` 가 기계로 막는다).
 */
import { 이메일, 학생번호표기 } from '../lib/학생계정.js';

const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

/** 설정이 비면 화면이 「왜 안 되는지 모르는 상태」가 된다 — 부르기 전에 물어볼 수 있게 낸다. */
export function 설정됐나() {
  return Boolean(URL_ && ANON);
}

/** 앱이 분기하는 것은 `message` 가 아니라 **`code`** 다(C0 §5 — 문구는 몽골어 번역으로 계속 바뀐다). */
export class 인증오류 extends Error {
  constructor(code, message, retryable) {
    super(message || '잠시 뒤 다시 시도해 주세요');
    this.code = code || 'SERVER_ERROR';
    this.retryable = Boolean(retryable);
  }
}

/* ── 세션 기억 · 만료 갱신 (C0 §7 왕복 6-⑥) ──────────────────────────────────
 * 🔴 `access_token` 은 **한 시간이면 죽는데** 갱신은 앱 시작 때 한 번뿐이었다. 수업 중 그 시간을
 *   넘긴 학생은 이후 모든 요청이 401 이고, 화면에 뜨는 것은 「잠시 뒤 다시 시도해 주세요」뿐이다.
 * 🔴 방아쇠는 **HTTP 401 이지 `AUTH_EXPIRED` 가 아니다.** `verify_jwt=true` 라 만료 토큰은
 *   게이트웨이가 우리 함수 앞에서 자르고, 그 응답은 우리 봉투가 아니다 — `error.code` 가 비어 온다.
 *   (§5 표가 `AUTH_EXPIRED` 를 적어 뒀지만 그 코드를 내는 서버 코드는 저장소에 0줄이다.)
 * 🔑 기억을 **여기** 두는 이유: 세션이 발급되는 자리가 이 파일 넷뿐이라(로그인·갱신·첫등록·임시번호)
 *   호출부가 등록을 잊을 자리가 없다. 등록층은 새면 언제나 「통과」 방향이라 잊을 자리를 안 만든다.
 * ⚠ 키체인은 여기서 안 만진다 — `src/저장.js` 가 react-native 를 끌고 오고, 그 모듈이 이 사슬에
 *   들어오면 통로 회귀(`tests/사건통로.test.js`)가 원리상 못 돈다. 남기는 손만 받아 둔다. */
let 최근세션 = null;
let 갱신중 = null; // refresh_token 은 **회전한다** — 동시에 두 번 부르면 뒤엣것이 이미 쓴 토큰을 쓴다
let 남기기 = null; // 기기에 남기는 함수. `src/저장.js` 가 자기를 세운다(그 파일만 키체인을 안다)

/** 갱신한 세션을 기기에 남기는 손을 건다 — `src/저장.js` 가 자기를 세운다. */
export function 세션남기기세움(fn) {
  남기기 = typeof fn === 'function' ? fn : null;
}

/** 로그아웃 — 기억을 비운다. 🔴 안 비우면 다음 학생의 401 이 **앞 학생 계정으로** 되살아난다. */
export function 세션잊기() {
  최근세션 = null;
  갱신중 = null;
}

function 기억(세션) {
  최근세션 = 세션;
  return 세션;
}

/**
 * 만료된 토큰을 **한 번** 되살린다 — 401 을 만난 통로가 부른다(`src/사건통로.js`).
 *
 * @param {string} 쓴토큰  방금 401 을 맞은 access_token
 * @returns {Promise<string|null>} 새 access_token. 재료가 없거나 갱신이 거절되면 `null`.
 *
 * 🔑 **왕복 없이 끝나는 갈래가 먼저다.** 화면이 쥔 토큰은 props 로 내려온 것이라 갱신 뒤에도
 *   낡은 채 남는다 — 기억이 이미 더 새것이면 그걸 그대로 준다(안 그러면 호출마다 401 을 한 번씩 산다).
 * 🔑 **단일 비행** — 화면 셋이 동시에 401 을 맞아도 갱신은 한 번만 난다.
 * 🔴 여기서 재시도하지 않는다 — 재시도는 부른 쪽이 **1회만** 한다(§7-6 「무한 루프 없음」).
 */
export async function 토큰되살리기(쓴토큰) {
  if (최근세션 && 최근세션.access_token && 최근세션.access_token !== 쓴토큰) {
    return 최근세션.access_token;
  }
  if (!최근세션 || !최근세션.refresh_token) return null;
  if (!갱신중) {
    갱신중 = 갱신(최근세션.refresh_token, 최근세션.학생번호)
      .then(async (새것) => {
        /* 🔴 회전한 refresh_token 을 **기기에 남긴다.** 안 남기면 다음 실행이 이미 쓴 토큰으로
           갱신을 시도해 실패한다 — 증상은 「가끔 로그인이 풀린다」다(App.js 50행과 같은 사연). */
        if (남기기) await Promise.resolve(남기기(새것)).catch(() => {});
        return 새것.access_token;
      })
      .catch((e) => {
        /* 만료면 기억을 버리고, 네트워크면 남긴다 — App.js 복원과 같은 규칙. 버리지 않으면
           죽은 refresh_token 으로 호출마다 갱신을 한 번씩 더 사게 된다. */
        if (!e || e.code !== 'NETWORK') 최근세션 = null;
        return null;
      })
      .finally(() => { 갱신중 = null; });
  }
  return 갱신중;
}

async function 함수부르기(갈래, 본문, 토큰) {
  let r;
  try {
    r = await fetch(`${URL_}/functions/v1/auth/${갈래}`, {
      method: 'POST',
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${토큰 || ANON}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(본문),
    });
  } catch {
    // 네트워크가 없다 — 서버 오류와 **다른 사건**이라 다르게 말해야 다시 시도할 수 있다.
    throw new 인증오류('NETWORK', '인터넷 연결을 확인해 주세요', true);
  }
  const 몸 = await r.json().catch(() => ({}));
  if (!r.ok || 몸.ok === false) {
    const e = 몸.error || {};
    throw new 인증오류(e.code, e.message, e.retryable);
  }
  return 몸;
}

/** 로그인 — Supabase Auth 를 직접 부른다(우리 API 가 아니다 · C0 §2-1). */
export async function 로그인(학생번호, 비밀번호) {
  let r;
  try {
    r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 이메일(학생번호), password: 비밀번호 }),
    });
  } catch {
    throw new 인증오류('NETWORK', '인터넷 연결을 확인해 주세요', true);
  }
  const 몸 = await r.json().catch(() => ({}));
  if (!r.ok) {
    // 🔴 GoTrue 의 원문을 그대로 보여주지 않는다 — 영어이고, 「없는 계정」과 「틀린 비밀번호」를
    //   가르는 문구라 학생번호의 존재가 샌다. 서버 게이트와 **같은 한 문장**으로 접는다.
    throw new 인증오류('LOGIN_FAILED', '학생번호 또는 비밀번호가 맞지 않습니다', false);
  }
  /* 🔑 학생번호를 세션에 실어 보낸다 — 막힘 안내가 「선생님께 이 번호를 보여 주세요」로 끝나는데
   *   토큰에 실려 오는 것은 **합성 이메일**뿐이라, 안 실으면 화면이 그 번호를 모른다.
   *   여기서 **표기형으로 접는다**: 세 통로(로그인·첫등록·임시번호)가 전부 이 한 줄을 지나므로
   *   화면마다 다시 다듬을 일이 없다. */
  return 기억({
    access_token: 몸.access_token,
    refresh_token: 몸.refresh_token,
    user: 몸.user,
    학생번호: 학생번호표기(학생번호),
  });
}

/**
 * 세션 갱신 — 저장된 refresh_token 으로 새 access_token 을 받는다.
 *
 * 🔑 로그인과 **같은 모양**을 돌려준다 — 호출부가 「처음 로그인」과 「복원」을 안 가르게.
 * 🔴 학생번호는 토큰에서 못 꺼낸다(합성 이메일뿐 — 위 78행과 같은 사연). 저장해 둔 값을 그대로 싣는다.
 * ⚠ **네트워크 실패와 만료를 가른다.** 둘 다 「로그인 화면」으로 보내면 같아 보이지만, 지운 뒤
 *   비행기 모드였던 것으로 밝혀지면 학생은 이유 없이 다시 로그인해야 한다 — 호출부가 code 로 가른다.
 */
export async function 갱신(refresh_token, 학생번호) {
  let r;
  try {
    r = await fetch(`${URL_}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token }),
    });
  } catch {
    throw new 인증오류('NETWORK', '인터넷 연결을 확인해 주세요', true);
  }
  const 몸 = await r.json().catch(() => ({}));
  if (!r.ok || !몸.access_token) {
    throw new 인증오류('REFRESH_FAILED', '다시 로그인해 주세요', false);
  }
  return 기억({
    access_token: 몸.access_token,
    refresh_token: 몸.refresh_token,
    user: 몸.user,
    학생번호,
  });
}

/** 첫 등록 — 계정이 서는 유일한 통로. 성공해도 세션은 안 생기므로 곧바로 로그인한다. */
export async function 첫등록({ 학생번호, 뒷자리, 비밀번호, 복구이메일, 복구전화, 가입답 }) {
  await 함수부르기('first-login', {
    student_code: 학생번호,
    phone_last4: 뒷자리,
    password: 비밀번호,
    recovery_email: 복구이메일 || null,
    recovery_phone: 복구전화 || null,
    /* 가입 1회 문항 셋 — **이 요청에만 실린다**(`lib/가입문항.js`). 서버가 계정을 만들기 전에
     * 값목록을 대조하고, 등록을 잇는 그 UPDATE 에 같이 적는다. 🔴 「나중에 설정 화면에서」로
     * 미루지 못하는 값이다: 목적은 덮어써지는 칸이라 나중에 물으면 그때 목적이 아니라 **오늘
     * 목적**이 나온다(L0 §850 `goal_snapshot` = 유일한 완전 소급 불가). */
    ...(가입답 || {}),
  });
  return 로그인(학생번호, 비밀번호);
}

/** 임시번호로 들어와 새 비밀번호를 정한다. 여기도 끝나면 그 비밀번호로 로그인한다. */
export async function 임시번호로그인({ 학생번호, 임시번호, 새비밀번호 }) {
  await 함수부르기('temp-login', {
    student_code: 학생번호,
    temp_password: 임시번호,
    new_password: 새비밀번호,
  });
  return 로그인(학생번호, 새비밀번호);
}

/**
 * 비밀번호 변경 — **현재 비밀번호를 확인한 뒤** 바꾼다(L0 §4-2-3).
 * 🔴 확인 없이 `updateUser` 만 부르면, 잠깐 자리를 비운 사이 남이 비밀번호를 갈아버릴 수 있다.
 *   토큰이 살아 있다는 것은 「그때 로그인했다」이지 「지금 이 사람이 본인이다」가 아니다.
 */
export async function 비밀번호변경({ 학생번호, 현재비밀번호, 새비밀번호, 토큰 }) {
  await 로그인(학생번호, 현재비밀번호);
  let r;
  try {
    r = await fetch(`${URL_}/auth/v1/user`, {
      method: 'PUT',
      headers: { apikey: ANON, Authorization: `Bearer ${토큰}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 새비밀번호 }),
    });
  } catch {
    throw new 인증오류('NETWORK', '인터넷 연결을 확인해 주세요', true);
  }
  if (!r.ok) throw new 인증오류('SERVER_ERROR', '잠시 뒤 다시 시도해 주세요', true);
  return true;
}

/** 원장 「비밀번호 초기화」 — director 토큰으로만 돈다. 임시번호는 **이 응답에서 한 번만** 나온다.
 *
 * 🔑 결과가 **두 갈래**다. 아직 앱 계정이 없는 학생이면 줄 임시번호가 없고(비밀번호가 없다),
 *   대신 **첫 등록 잠금이 풀려** 돌아온다(`잠금해제`). 한 갈래로 읽으면 번호 자리가 빈 채로 떠서
 *   원장이 「없는 번호」를 학생에게 불러 준다 — 화면이 두 결과를 갈라 읽어야 하는 이유다. */
export async function 초기화요청({ 학생번호, 토큰 }) {
  const 몸 = await 함수부르기('reset', { student_code: 학생번호 }, 토큰);
  return {
    임시번호: 몸.temp_password ?? null,
    유효분: 몸.expires_in_minutes ?? null,
    학생번호: 몸.student_code,
    잠금해제: 몸.unlocked === true,
  };
}
