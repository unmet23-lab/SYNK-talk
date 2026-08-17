#!/usr/bin/env node
'use strict';
/**
 * 독립 채점 — 픽스처 정답을 «보지 않은» 채점자로 재는 통로.
 * (evals/결과.md 「다음에 할 것」 3번 · ③A ⑨가 남긴 후보 · 2026-08-13)
 *
 * 왜 있나: eval-score.js 의 축은 「픽스처가 못박은 답과 같은가」다. 그런데 ⑤실측이 보인 것은
 *   갈리는 문항 대부분이 «답이 여럿 성립»하는 자리라는 것이다(잡음 바닥 13%의 상당 몫).
 *   픽스처 축 하나로는 「모델이 틀렸다」와 「픽스처가 하나만 정답으로 못박았다」가 같은 모양이다.
 *   독립 채점자는 정답지 없이 「그 자체로 성립하는가」를 판정한다 — 두 축이 갈리는 자리가
 *   곧 픽스처 수리 후보(픽스처✖·독립✔)이자, 픽스처가 못 보는 실패 후보(픽스처✔·독립✖)다.
 *   ⚠ 이 채점은 eval-score 를 «대체하지 않는다» — 엔진점수(계기판)는 픽스처 축 그대로다.
 *
 * 눈이 머는 자리 셋 — 설계가 막는다(회귀 tests/독립채점.test.js):
 *   ① id 접두가 답을 샌다: E=오류·C=정상·M=복합이라 id 를 그대로 주면 「오류가 있는가」의
 *      답이 이름에 실려 간다. → 블라인드 id(해시 정렬·결정적)로 바꾸고, 매핑은 채점자에게
 *      안 가는 별도 파일에 둔다.
 *   ② 픽스처 순서가 답을 샌다(C→E→M 묶음) → 해시 정렬이 순서도 같이 섞는다(재실행해도
 *      같은 순서 — 회차 간 대조는 입력이 얼어 있어야 한다 · F281).
 *   ③ 항목에 기대값이 스며든다 → 픽스처에서는 허용목록 {id, 입력}만, 출력에서는 모델 산출
 *      {고친문장, 오류태그}만 복사한다. 보통 가드는 「기본값=잼」이 안전하지만 여기는 반대다 —
 *      픽스처의 새 칸은 답일 공산이 커서 **기본값=안 실림**이 새는 방향을 막는다.
 *
 * 사용:
 *   node tools/독립채점.js 패킷 evals/출력_v7.json --조각 6 --자리 <디렉터리>
 *       → 조각N.md(채점자에게 통째로 주는 지시문) · 매핑.json(블라인드↔실제 — 채점자 금지)
 *   node tools/독립채점.js 수거 --매핑 <디렉터리>/매핑.json --응답 a.json,b.json --출력 evals/독립채점_v7.json
 *       → 블라인드 해제·검증(빠짐·중복은 조용히 못 지나간다) · 채점자 = 응답 파일 이름
 *   node tools/독립채점.js 대조 evals/출력_v7.json evals/독립채점_v7.json
 *       → 픽스처 채점(eval-score 채점하기 «재사용» — 채점 통로는 한 벌)과 독립 판정의 갈림표
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { 인자게이트 } = require('../lib/플래그.js');   // 모르는 낱말 거절(공용 판정 · F435)

/* 🎯 조준 축은 **없다** — 파일만 읽고 쓴다(자격증명·네트워크 0). `--운영` 을 안 받는다.
 * ⚠ 값을 받는 낱말들이다(`--조각 6`). 값 쪽은 `--` 로 안 시작하니 이 판정에 안 걸린다. */
const 아는플래그 = ['--조각', '--자리', '--매핑', '--응답', '--출력'];

const ROOT = path.resolve(__dirname, '..');
const FIXTURE = path.join(ROOT, 'evals', '픽스처.json');
const 계약경로 = path.join(ROOT, '계약', '수집_교정_계약.json');
const 프로토콜 = '독립채점 v1';

function load(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/* ── 패킷 — 채점자에게 가는 것 전부가 여기서 난다 ─────────────────────────────── */

/** 블라인드 id 부여 — sha1(id|입력) 정렬이라 결정적이고(재실행 동일 · F281),
 *  id 접두·픽스처 묶음 순서가 함께 사라진다. */
function 블라인드질서(항목들) {
  return 항목들
    .map((x) => ({ x, 해시: crypto.createHash('sha1').update(`${x.id}|${x.입력}`).digest('hex') }))
    .sort((a, b) => (a.해시 < b.해시 ? -1 : 1))
    .map(({ x }, i) => ({ 실제: x, 블라인드id: `B${String(i + 1).padStart(3, '0')}` }));
}

/** 패킷 조립. 반환 { 패킷항목, 매핑, 제외 } — 제외(채점할 답이 없는 행)는 숨기지 않고
 *  목록으로 낸다: 분모 없는 채점은 「몇 건을 쟀는가」부터 거짓이 된다(F207). */
function 패킷만들기(fixture, outputs) {
  const byId = new Map(outputs.항목.map((o) => [o.id, o]));
  const 패킷항목 = [];
  const 매핑 = [];
  const 제외 = [];
  for (const { 실제, 블라인드id } of 블라인드질서(fixture.항목)) {
    const out = byId.get(실제.id);
    // eval-score scoreOne 과 같은 술어: 채점할 답이 있는가 = `고친문장` 칸이 파싱돼 있는가.
    if (!out || out.고친문장 === undefined) {
      제외.push({ id: 실제.id, 사유: out ? `무응답(${out.검증사유 || out.사유 || '?'})` : '출력없음' });
      continue;
    }
    패킷항목.push({
      id: 블라인드id,
      학생문장: 실제.입력, // 픽스처에서 실리는 칸은 이 하나뿐(허용목록) — 종류·기대*·비고는 답이다.
      고친문장: out.고친문장,
      오류태그: Array.isArray(out.오류태그) ? out.오류태그 : [],
    });
    매핑.push({ 블라인드id, id: 실제.id });
  }
  return { 패킷항목, 매핑, 제외 };
}

/** 채점자 지시문 — 여기 박아 두는 이유: 회차마다 문구가 갈리면 회차 간 대조가 무효다(F281).
 *  «다르다 ≠ 실패»가 이 지시문의 급소다 — 픽스처가 하나로 못박은 자리를 재러 가면서
 *  채점자에게 또 하나의 정답을 상상하게 하면 같은 못박기를 반복한다. */
function 지시문조립(항목들, 태그목록, 조각번호, 조각수) {
  return [
    `# 한국어 교정 독립 판정 — 조각 ${조각번호}/${조각수} (${프로토콜})`,
    '',
    '너는 한국어 교육 전문가다. 몽골인 학습자(초·중급)가 쓴 한국어 문장과, 자동 교정 시스템이 낸',
    '산출(고친 문장 + 오류 태그)이 아래에 있다. **정답지는 일부러 주지 않는다** — 이 판정의 목적이',
    '「정답지 없이 그 자체로 성립하는가」를 재는 것이다. 항목마다 독립적으로 판정하라.',
    '',
    '판정 칸 (항목마다 넷, 교정 실패면 다섯):',
    '1. `원문오류` — 학생 문장에 교정해야 할 오류(문법·조사·어미·높임·어휘·맞춤법·어순·화용)가',
    '   있는가. `"있다"` | `"없다"` | `"애매"`(고칠지 말지가 교육 방침에 달린 경계면일 때만).',
    '2. `교정` — 시스템의 고친 문장이 **그 자체로** 성립하는가: 오류를 전부 고쳤고, 학생이 말하려던',
    '   뜻을 지켰고, 맞는 부분을 불필요하게 바꾸지 않았고, 자연스러운 한국어인가. 원문에 오류가',
    '   없다면 「그대로 두었는가」가 기준이다. `"통과"` | `"실패"`.',
    '   ⚠ 네가 골랐을 교정과 «다르다»는 실패 근거가 아니다 — 다르지만 그 자체로 옳으면 통과다.',
    '3. `태그` — 아래 24개 어휘 안에서, 학생 문장의 실제 오류를 정확히 이름했는가. 원문에 오류가',
    '   없으면 `["오류없음"]` 하나여야 통과다. 복수 오류면 전부 이름해야 한다.',
    '   `"통과"` | `"실패"` | `"판단불가"`. 둘 이상이 다 성립하는 이름이면 그것도 **통과**다',
    '   (사유에 둘 다 성립함을 적는다) — 판단불가는 이 어휘 체계로는 가를 수 없는 자리에만 쓴다.',
    '4. `사유` — 한 줄. 실패·애매·판단불가면 무엇이 왜 그런지.',
    '5. `제안교정` — `교정`이 `"실패"`일 때만, 네가 옳다고 보는 문장 하나.',
    '',
    `태그 어휘(${태그목록.length}): ${태그목록.join(' · ')}`,
    '',
    '항목(JSON):',
    '```json',
    JSON.stringify(항목들, null, 1),
    '```',
    '',
    '출력 — 아래 모양의 JSON 배열 **만**, 다른 글 없이. 항목 수와 id 는 위와 정확히 같아야 한다:',
    '```json',
    '[{"id":"B001","원문오류":"있다","교정":"통과","태그":"실패","사유":"…","제안교정":"…"}]',
    '```',
  ].join('\n');
}

function 조각내기(arr, n) {
  const 크기 = Math.ceil(arr.length / n);
  const out = [];
  for (let i = 0; i < arr.length; i += 크기) out.push(arr.slice(i, i + 크기));
  return out;
}

/* ── 수거 — 블라인드 해제. 빠짐·중복·모르는 id 는 조용히 못 지나간다 ─────────────── */

const 원문오류값 = new Set(['있다', '없다', '애매']);
const 교정값 = new Set(['통과', '실패']);
const 태그값 = new Set(['통과', '실패', '판단불가']);

/** 응답들( [{채점자, 판정들:[...]}] )을 실제 id 로 되돌린다. 같은 채점자 안의 중복은 오류,
 *  채점자 «간» 중복은 표(복수 표결)다. 완결 불변식은 **합집합**이다 — 조각을 나눠 맡는
 *  프로토콜이라 채점자마다 전량을 요구하면 정상 수거가 전부 죽고(첫 실행이 그랬다),
 *  합집합에 빠진 id 는 목록으로 던진다: 빠짐이 조용하면 「채점 안 된 항목」이 분모에서
 *  사라져 점수가 부푼다(F207). */
function 수거하기(매핑, 응답들) {
  const 실제로 = new Map(매핑.map((m) => [m.블라인드id, m.id]));
  const 행들 = [];
  const 합집합 = new Set();
  for (const { 채점자, 판정들 } of 응답들) {
    if (!Array.isArray(판정들)) throw new Error(`응답이 배열이 아니다: ${채점자}`);
    const 본것 = new Set();
    for (const 판 of 판정들) {
      const 실제id = 실제로.get(판.id);
      if (!실제id) throw new Error(`모르는 블라인드 id: ${판.id} (${채점자}) — 매핑이 다른 판 것 아닌가`);
      if (본것.has(판.id)) throw new Error(`한 채점자 안에서 중복: ${판.id} (${채점자})`);
      본것.add(판.id);
      합집합.add(판.id);
      for (const [칸, 값들] of [['원문오류', 원문오류값], ['교정', 교정값], ['태그', 태그값]]) {
        if (!값들.has(판[칸])) {
          throw new Error(`값이 규격 밖: ${판.id}.${칸}="${판[칸]}" (${채점자}) — 허용: ${[...값들].join('|')}`);
        }
      }
      행들.push({
        id: 실제id, 블라인드id: 판.id, 채점자,
        원문오류: 판.원문오류, 교정: 판.교정, 태그: 판.태그,
        사유: String(판.사유 || ''), ...(판.제안교정 ? { 제안교정: String(판.제안교정) } : {}),
      });
    }
  }
  const 빠짐 = [...실제로.keys()].filter((b) => !합집합.has(b));
  if (빠짐.length) {
    throw new Error(`합집합에서 ${빠짐.length}건이 채점 안 됐다: ${빠짐.slice(0, 8).join(', ')}${빠짐.length > 8 ? ' …' : ''}`);
  }
  return 행들;
}

/* ── 대조 — 픽스처 축(eval-score 채점하기 재사용)과 독립 축의 갈림을 가른다 ────────── */

/** 한 항목의 픽스처 축 판정 셋. null = 그 축을 픽스처가 못 쟀다(판정불가·무응답). */
function 픽스처축(r) {
  if (r.판정불가 || r.무응답) return { 원문: r.종류, 교정: null, 태그: null };
  return {
    원문: r.종류,
    교정: r.종류 === '정상' ? r.판정.불변 : r.판정.교정,
    태그: r.판정.태그,
  };
}

/** 한 항목의 독립 축 판정 셋 — 표가 여럿이면 만장일치만 값이고, 갈리면 '표결갈림'.
 *  (갈린 표를 다수결로 접으면 「채점자도 못 가르는 자리」라는 신호가 사라진다.) */
function 독립축(표들) {
  const 값 = (칸) => {
    const 셋 = [...new Set(표들.map((v) => v[칸]))];
    return 셋.length === 1 ? 셋[0] : '표결갈림';
  };
  return { 원문: 값('원문오류'), 교정: 값('교정'), 태그: 값('태그') };
}

/** 축 하나의 갈림 분류. 반환 키가 곧 요약표의 행이다. */
function 축분류(픽스처판정, 독립판정) {
  if (픽스처판정 === null) return '픽스처못잼';
  if (독립판정 === '표결갈림') return '표결갈림';
  if (독립판정 === '판단불가') return '독립못잼';
  const 독립통과 = 독립판정 === '통과';
  if (픽스처판정 && 독립통과) return '둘다통과';
  if (!픽스처판정 && !독립통과) return '둘다실패';
  return 픽스처판정 ? '픽스처만통과' : '독립만통과';
}

function 대조하기(픽스처rows, 독립행들) {
  const 표별 = new Map();
  for (const 행 of 독립행들) {
    if (!표별.has(행.id)) 표별.set(행.id, []);
    표별.get(행.id).push(행);
  }
  const 축들 = ['교정', '태그'];
  const 요약 = { 교정: {}, 태그: {}, 원문갈림: [], 채점안됨: [] };
  const 갈림 = [];
  for (const r of 픽스처rows) {
    const 표들 = 표별.get(r.id);
    if (!표들) { 요약.채점안됨.push(r.id); continue; }
    const fx = 픽스처축(r);
    const 독 = 독립축(표들);
    // 원문 축 — 픽스처 종류는 구성상 참(사람이 만든 문장)이라, 갈림은 곧 «픽스처 품질» 신호다.
    const 원문갈림 = (fx.원문 === '정상' && 독.원문 === '있다') || (fx.원문 === '오류' && 독.원문 === '없다');
    if (원문갈림) 요약.원문갈림.push({ id: r.id, 종류: fx.원문, 독립: 독.원문, 사유: 표들[0].사유 });
    for (const 축 of 축들) {
      const 칸 = 축분류(fx[축], 독[축]);
      요약[축][칸] = (요약[축][칸] || 0) + 1;
      if (칸 === '픽스처만통과' || 칸 === '독립만통과') {
        갈림.push({
          id: r.id, 축, 칸,
          픽스처메모: (r.메모 || []).join(' / ') || '(통과)',
          독립사유: 표들.map((v) => `${v.채점자}: ${v.사유}${v.제안교정 ? ` → ${v.제안교정}` : ''}`).join(' | '),
        });
      }
    }
  }
  return { 요약, 갈림, 분모: { 픽스처: 픽스처rows.length, 독립채점: 표별.size } };
}

/* ── CLI ───────────────────────────────────────────────────────────────────── */

function 인자값(argv, 이름) {
  const i = argv.indexOf(이름);
  return i === -1 ? null : argv[i + 1] || null;
}

function main(argv) {
  /* 🔴 명령(`패킷`·`수거`·`대조`)보다 앞이다 — 뒤에 두면 갈래마다 같은 판정을 세 벌 적게 되고,
   *   세 벌은 갈라진다. 위치 인자(명령·경로)는 `--` 로 안 시작하니 여기 안 걸린다. */
  const 플래그오류 = 인자게이트('독립채점', argv, 아는플래그);   // 모르는 낱말은 여기서 죽는다(F435)
  if (플래그오류) { console.error(플래그오류); return 2; }
  const 명령 = argv[0];
  if (명령 === '패킷') {
    const 출력경로 = argv[1];
    const 조각수 = Number(인자값(argv, '--조각') || 6);
    const 자리 = 인자값(argv, '--자리');
    if (!출력경로 || !자리) {
      console.error('사용: node tools/독립채점.js 패킷 evals/출력_v7.json --조각 6 --자리 <디렉터리>');
      return 2;
    }
    const fixture = load(FIXTURE);
    const outputs = load(path.resolve(ROOT, 출력경로));
    const 태그목록 = load(계약경로).오류태그;
    const { 패킷항목, 매핑, 제외 } = 패킷만들기(fixture, outputs);
    fs.mkdirSync(자리, { recursive: true });
    const 조각들 = 조각내기(패킷항목, 조각수);
    조각들.forEach((항목들, i) => {
      fs.writeFileSync(path.join(자리, `조각${i + 1}.md`), 지시문조립(항목들, 태그목록, i + 1, 조각들.length), 'utf8');
    });
    fs.writeFileSync(path.join(자리, '매핑.json'), JSON.stringify({ 프로토콜, 출력파일: 출력경로, 매핑, 제외 }, null, 1), 'utf8');
    console.log(`패킷 ${패킷항목.length}건 → 조각 ${조각들.length}개 · 제외 ${제외.length}건${제외.length ? ` (${제외.map((x) => `${x.id}:${x.사유}`).join(', ')})` : ''}`);
    console.log(`⚠ 매핑.json 은 채점자에게 주지 않는다 — 조각*.md 만 준다.`);
    return 0;
  }
  if (명령 === '수거') {
    const 매핑경로 = 인자값(argv, '--매핑');
    const 응답경로들 = (인자값(argv, '--응답') || '').split(',').filter(Boolean);
    const 출력 = 인자값(argv, '--출력');
    if (!매핑경로 || !응답경로들.length || !출력) {
      console.error('사용: node tools/독립채점.js 수거 --매핑 <매핑.json> --응답 a.json,b.json --출력 evals/독립채점_v7.json');
      return 2;
    }
    const { 매핑, 제외, 출력파일 } = load(매핑경로);
    const 응답들 = 응답경로들.map((p) => ({ 채점자: path.basename(p, '.json'), 판정들: load(p) }));
    const 행들 = 수거하기(매핑, 응답들);
    const 몸 = {
      프로토콜, 판: 출력파일, 돌린날: new Date().toISOString().slice(0, 10),
      채점자들: 응답들.map((r) => r.채점자), 제외,
      항목: 행들,
    };
    fs.writeFileSync(path.resolve(ROOT, 출력), JSON.stringify(몸, null, 1), 'utf8');
    console.log(`수거 ${행들.length}표 (${응답들.length}명 × ${매핑.length}건) → ${출력}`);
    return 0;
  }
  if (명령 === '대조') {
    const 출력경로 = argv[1];
    const 독립경로 = argv[2];
    if (!출력경로 || !독립경로) {
      console.error('사용: node tools/독립채점.js 대조 evals/출력_v7.json evals/독립채점_v7.json');
      return 2;
    }
    const { 채점하기 } = require('./eval-score.js'); // 채점 통로는 한 벌 — 베끼면 갈라진다.
    const fixture = load(FIXTURE);
    const outputs = load(path.resolve(ROOT, 출력경로));
    const 독립 = load(path.resolve(ROOT, 독립경로));
    const { 요약, 갈림, 분모 } = 대조하기(채점하기(fixture, outputs), 독립.항목);
    console.log(`# 독립 채점 대조 — ${출력경로} × ${독립경로} (채점자: ${(독립.채점자들 || []).join(', ')})`);
    console.log(`분모: 픽스처 ${분모.픽스처} · 독립채점 ${분모.독립채점} · 채점안됨 ${요약.채점안됨.length}${요약.채점안됨.length ? ` (${요약.채점안됨.join(', ')})` : ''}`);
    for (const 축 of ['교정', '태그']) {
      const 칸들 = Object.entries(요약[축]).map(([k, v]) => `${k} ${v}`).join(' · ');
      console.log(`- ${축} 축: ${칸들}`);
    }
    console.log(`- 원문 축 갈림 ${요약.원문갈림.length}건${요약.원문갈림.length ? ':' : ''}`);
    for (const g of 요약.원문갈림) console.log(`  · ${g.id} 픽스처=${g.종류} vs 독립=${g.독립} — ${g.사유}`);
    console.log('');
    console.log('| id | 축 | 갈림 | 픽스처 쪽 | 독립 쪽 |');
    console.log('|---|---|---|---|---|');
    for (const g of 갈림) {
      const 셀 = (s) => String(s).replace(/\|/g, '¦').replace(/\n/g, ' ');
      console.log(`| ${g.id} | ${g.축} | ${g.칸} | ${셀(g.픽스처메모)} | ${셀(g.독립사유)} |`);
    }
    return 0;
  }
  console.error('사용: node tools/독립채점.js 패킷|수거|대조 …  (머리 주석 참고)');
  return 2;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { 블라인드질서, 패킷만들기, 지시문조립, 조각내기, 수거하기, 픽스처축, 독립축, 축분류, 대조하기, 프로토콜 };
