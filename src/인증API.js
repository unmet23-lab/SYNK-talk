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
  return {
    access_token: 몸.access_token,
    refresh_token: 몸.refresh_token,
    user: 몸.user,
    학생번호: 학생번호표기(학생번호),
  };
}

/** 첫 등록 — 계정이 서는 유일한 통로. 성공해도 세션은 안 생기므로 곧바로 로그인한다. */
export async function 첫등록({ 학생번호, 뒷자리, 비밀번호, 복구이메일, 복구전화 }) {
  await 함수부르기('first-login', {
    student_code: 학생번호,
    phone_last4: 뒷자리,
    password: 비밀번호,
    recovery_email: 복구이메일 || null,
    recovery_phone: 복구전화 || null,
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

/** 원장 「비밀번호 초기화」 — director 토큰으로만 돈다. 임시번호는 **이 응답에서 한 번만** 나온다. */
export async function 초기화요청({ 학생번호, 토큰 }) {
  const 몸 = await 함수부르기('reset', { student_code: 학생번호 }, 토큰);
  return { 임시번호: 몸.temp_password, 유효분: 몸.expires_in_minutes, 학생번호: 몸.student_code };
}
