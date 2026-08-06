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
];

const MAX_BYTES = 1024 * 1024; // 1MB

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

    if (typeof f.bytes === 'number' && f.bytes > MAX_BYTES) {
      out.push({
        path: p,
        rule: '대용량 파일',
        why: `${(f.bytes / 1024 / 1024).toFixed(1)}MB — 1MB 넘는 파일은 git에 넣지 않는다`,
      });
    }

    if (typeof f.text === 'string') {
      for (const rule of SECRET_CONTENT) {
        if (rule.re.test(f.text)) {
          out.push({ path: p, rule: '내용에 박힌 비밀', why: rule.name });
        }
      }
    }
  }
  return out;
}

module.exports = { inspect, SECRET_NAMES, SECRET_CONTENT, MAX_BYTES, isExample };
