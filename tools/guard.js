'use strict';
/**
 * 커밋 가드 — 순수 검사부.
 *
 * git을 호출하지 않는다. 파일 목록과 내용을 받아 위반만 돌려준다.
 * 이유: 탐지 능력을 **픽스처로 못박기** 위해서다. 실저장소의 상태를 세는 검사는
 * 그 상태가 고쳐지는 순간 빨간불이 되고, 다음 사람은 테스트를 고치는 게 아니라 끈다.
 * (SYNK 공용 지침 「신뢰성」 — 가드가 눈머는 두 가지)
 *
 * 호출부는 tools/precommit.js.
 */

/** 파일명 자체가 자격증명인 것들. `.example` 접미가 붙으면 통과시킨다. */
const SECRET_NAMES = [
  { re: /(^|[\\/])\.env(\.[\w-]+)?$/i, why: '환경변수 파일은 git 밖에 둔다' },
  { re: /\.(pem|key|p8|p12|pfx|keystore|jks)$/i, why: '개인키·서명키' },
  { re: /(^|[\\/])(credentials|service-account)[\w.-]*\.json$/i, why: '서비스 계정 자격증명' },
  { re: /(^|[\\/])\.clasprc\.json$/i, why: 'clasp 로그인 토큰' },
  /* ⚠ 이 규칙만 확장자를 안 본다 — 그래서 **소스까지 잡았다**(2026-08-06: `lib/로그인코드.js`·
   *   `tools/로그인코드발급.js`·`tests/로그인코드.test.js` 3건이 커밋을 못 했다).
   *   위 네 규칙은 전부 자격증명 **데이터 파일 모양**을 본다. 이것만 이름 조각을 봤다.
   *   막으려던 것은 「발급된 코드 목록」이고 그건 .csv·.txt·.json 이지 .js 가 아니다.
   *   → 소스 확장자는 이 규칙에서 뺀다(`.gitignore` 도 같은 이유로 같은 날 좁혔다). */
  { re: /(로그인|비밀번호|passwd|password)/i, why: '자격증명으로 보이는 파일명', 소스제외: true },
];

/** 소스 파일인가 — 자격증명 **목록**은 데이터 파일이지 소스가 아니다. */
const isSource = (p) => /\.(js|jsx|ts|tsx|mjs|cjs)$/i.test(p);

/**
 * 빌드가 앱 번들에 실어 보내는 파일인가.
 * 문서가 위험한 이름을 **설명**하는 것은 막지 않는다 — 설명을 막으면 그 이름을 못 쓰게 되고,
 * 그러면 위험이 문서에서 사라질 뿐 코드에서 사라지지 않는다.
 */
const isBundled = (p) =>
  isSource(p)
  || /(^|\/)app\.(json|config\.[jt]s)$/i.test(p)
  || /(^|\/)\.env(\.|$)/i.test(p);

/**
 * 내용에 박힌 비밀. 이름은 「무엇이 걸렸는지」를 사람이 읽을 수 있게 짓는다.
 * 주의: 이 목록의 픽스처는 테스트 코드에서 **조립**한다(리터럴 실토큰을 소스에 두지 않는다).
 */
const SECRET_CONTENT = [
  { name: 'Anthropic API 키', re: /sk-ant-[A-Za-z0-9_-]{16,}/ },
  { name: 'OpenAI API 키', re: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}/ },
  { name: 'GitHub 토큰', re: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
  { name: 'Google API 키', re: /\bAIza[A-Za-z0-9_-]{30,}/ },
  { name: 'Supabase service_role 키', re: /service_role[^\n]{0,40}eyJ[A-Za-z0-9_-]{20,}/ },
  { name: 'JWT(서비스 키로 보임)', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: '개인키 블록', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'Expo 토큰', re: /EXPO_TOKEN\s*[:=]\s*['"]?[A-Za-z0-9_-]{16,}/ },
  /* L0 §4-5 수용기준 ⑤. `EXPO_PUBLIC_` 은 값이 **번들에 인라인**되므로 그 접두사를 단 비밀은
   * 앱과 함께 사용자 기기로 나가고 **회수할 수 없다**. 값이 리터럴로 없어도 새기 때문에
   * 위의 「service_role + JWT」 규칙이 이것을 못 잡는다 — 이름 하나로 이미 결정된다. */
  {
    name: 'EXPO_PUBLIC_ 접두사를 단 비밀 — 번들에 인라인된다. '
      + '접두사를 떼고 서버(Edge Function) 환경변수로 옮긴다',
    re: /EXPO_PUBLIC_[A-Z0-9_]*(SERVICE_ROLE|SERVICE_KEY|SECRET)/,
    번들파일만: true,
  },
];

/**
 * 크기 상한. 겨누는 것은 **셋**이다 — ①실수로 딸려 들어온 미디어·덤프 ②git 이력을 영구히
 * 무겁게 만드는 이진물 ③리뷰가 원리상 불가능한 덩어리. 「1MB」 자체에 성스러운 근거는 없다.
 * ⚠ 그래서 상한을 **통째로 올리는 것은 답이 아니다** — 셋 다 같이 느슨해진다.
 *   한 파일이 정당하게 넘으면 아래 `큰파일예외` 에 **이름으로** 적는다.
 */
const MAX_BYTES = 1024 * 1024; // 1MB

/**
 * 크기 규칙을 이름으로 비켜 가는 자리 — **여기 적힌 것만**, 다른 무엇도 예외가 없다.
 *
 * 🔑 왜 상한을 올리지 않고 이름으로 뚫나
 *   상한을 2MB 로 올리면 「새로 생기는 대용량」까지 같이 통과한다 — 가드가 겨눈 셋이 전부
 *   느슨해진다. 이름으로 뚫으면 **이 파일만** 지나가고 나머지는 어제와 똑같이 막힌다.
 * 🔑 왜 매번 `SYNK_SKIP_GUARD=1` 로 넘기지 않나
 *   그 우회는 **가드 전체**를 끄므로, 그날 같은 커밋에 자격증명이 섞여도 조용히 나간다.
 *   게다가 08-26 에 두 번 썼다 — 예외가 습관이 되면 진짜 사고를 못 막는다.
 * ⚠ 여기 줄을 더할 때 물을 것: 「이건 **사람이 만든 파일**인가, 기계가 이은 산출물인가?」
 *   사람이 만든 것이 1MB 를 넘으면 그건 예외가 아니라 **쪼갤 신호**다.
 */
const 큰파일예외 = [
  {
    re: /^supabase\/L0_스키마\.sql$/,
    why: '마이그레이션 조각들을 tools/마이그레이션_합본.js 가 이어 만든 산출물이다. '
      + '조각이 붙을 때마다 선형으로 커지고, 빈 DB 에 한 번에 붓는 것이 존재 이유라 쪼갤 수 없다 '
      + '(테스트 6·lib 2·supabase/DB착지판.json 이 이 파일 하나를 본다).',
  },
];

/** 크기 예외인가 — 경로가 **정확히** 맞아야 한다(접두사 일치는 사본까지 뚫어 준다). */
const 크기예외인가 = (p) => 큰파일예외.some((x) => x.re.test(p));

/** `.env.example` 처럼 「예시」임이 파일명에 드러나면 이름 규칙에서 뺀다. */
function isExample(p) {
  return /\.(example|sample|template)$/i.test(p) || /(^|[\\/])\.env\.example$/i.test(p);
}

/**
 * @param {{path:string, text?:string, bytes?:number}[]} files 스테이징된 파일들
 * @returns {{path:string, rule:string, why:string}[]} 위반(빈 배열이면 통과)
 */
function inspect(files) {
  const out = [];
  for (const f of files) {
    const p = String(f.path || '').replace(/\\/g, '/');
    if (!p) continue;

    if (!isExample(p)) {
      for (const rule of SECRET_NAMES) {
        if (rule.소스제외 && isSource(p)) continue;
        if (rule.re.test(p)) out.push({ path: p, rule: '자격증명 파일명', why: rule.why });
      }
    }

    if (typeof f.bytes === 'number' && f.bytes > MAX_BYTES && !크기예외인가(p)) {
      out.push({
        path: p,
        rule: '대용량 파일',
        why: `${(f.bytes / 1024 / 1024).toFixed(1)}MB — 1MB 넘는 파일은 git에 넣지 않는다`
          + '(정당한 산출물이면 tools/guard.js 의 큰파일예외에 이름으로 적는다 — SKIP_GUARD 로 넘기지 않는다)',
      });
    }

    if (typeof f.text === 'string') {
      for (const rule of SECRET_CONTENT) {
        if (rule.번들파일만 && !isBundled(p)) continue;
        if (rule.re.test(f.text)) {
          out.push({ path: p, rule: '내용에 박힌 비밀', why: rule.name });
        }
      }
    }
  }
  return out;
}

module.exports = { inspect, SECRET_NAMES, SECRET_CONTENT, MAX_BYTES, isExample, 큰파일예외 };
