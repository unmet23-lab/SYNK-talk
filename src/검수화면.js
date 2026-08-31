'use strict';
/**
 * 검수 콘솔 — **직원이 학생 발화를 확정·폐기하는 화면** (발주_수집파이프라인 §3 · 검수_내부계약).
 *
 * ■ 이 화면이 닫는 것 — 함수 셋이 다 섰는데 부르는 화면이 0이었다
 *   판 22열 · `review` 함수(§3 큐 · §4 서명 · §5 승인·폐기) · c11 물리 넷까지 서 있었고,
 *   그 경로를 부르는 코드는 저장소에 **한 줄도 없었다**. 검수 처리량이 0이면 파이프라인이
 *   통째로 0이다(발주 §3) — 학생 발화는 쌓이는데 라벨이 한 건도 안 생긴다.
 *
 * ■ UX 4칙을 어디에 세웠나 (발주 §3 · 2026-08-08 유호님 지시 「기능적·직관적·편하게」)
 *   ① **기준 카드 상시 접이식 3줄** — 화면 맨 위. 기준이 화면 밖 문서에 살면 안 읽힌다.
 *   ② **구간 단위 청취** — 세그먼트 칩을 누르면 그 구간만 재생하고 전사 커서가 따라 뛴다.
 *      🔴 오늘 `stt_segments` 생산자가 **0**이라 실데이터에서 칩이 안 뜬다. 그때는 전체
 *      재생 하나로 내려앉고, **그 사실을 화면이 말한다** — 안 말하면 「구간이 없는 발화」와
 *      「구간을 아무도 안 만든다」가 검수자 눈에 같은 모양이다.
 *   ③ **직전 확정 재열기(`Z`)** — 확정 직후 한 건을 손에 쥐고 있다가 `supersedes` 로 다시 낸다.
 *      실수 복구가 없으면 검수자는 확정을 미루고, 미룬 확정이 큐를 막는다.
 *      ⚠ 창은 **서명 수명 10분**이다(§5-1) — 확정분은 §4 가 `NOT_FOUND` 를 내므로 오디오를
 *      다시 받을 길이 없다. 그래서 이미 쥔 URL 을 버리지 않는다.
 *      🔴 **재검수는 다시 들어야 한다**(§2 개정) — 서버 게이트 ②가 「마지막 판정 **이후**의
 *      재생」을 요구하므로 `Z` 진입 때 `열어봄` 을 지운다. 계측은 반대로 **안 지운다**(같은
 *      오디오를 방금 들었다). 그 비대칭이 설계다: 청취량은 그대로 인정하되, 「이번 판정을
 *      위해 한 번 더 열었다」는 사실만 새로 요구한다.
 *   ④ **세션 종료 요약 1줄** — 오늘 확정 n·수정 m·승격 p. **수정 m 이 엔진에 가장 값진 신호**라
 *      (AI 가 틀린 자리의 사람 정답) 그 숫자를 검수자에게 되돌려 준다.
 *
 * ■ 🔴 청취 게이트를 화면이 **흉내내지 않는다** — 같은 판정을 나눠 쓴다
 *   문턱은 `lib/검수확정.청취문턱`(서버가 쓰는 그 함수)이 내고, 들은 양은
 *   `lib/청취계측`(오디오 위치의 합집합)이 잰다. 화면이 자기 규칙으로 잠그면 서버가 거절할 때
 *   **이유를 못 말하는 화면**이 된다. 여기서 잠그는 것은 편의이고 게이트는 서버가 진다.
 *
 * ■ 🔑 게이트 ②의 증거는 **서명이 아니라 재생 알림**이다 (§2 개정 · §4-2 · 2026-08-09)
 *   전에는 서명 발급이 곧 게이트를 열었고, 그래서 프리로드가 「열지도 않은 항목을 통과시키는」
 *   자리였다. 이 화면은 그것을 **순서로** 좁혀 놨었지만(통과한 뒤 다음 하나) 새는 것이 마지막
 *   한 건 남아 0이 아니었다 — 확정하고 앱을 닫으면 그 한 건에 열지 않은 기록이 남았다.
 *   👉 서버가 감사 종류를 갈라(`review.audio` 발급 ↔ `review.audio.played` 재생) 그 구멍이
 *      닫혔다. 이제 **몇 개를 미리 당겨도 게이트가 0개 열린다.**
 *   👉 그래도 프리로드 순서는 **그대로 둔다** — 남은 이유가 게이트가 아니라 **서명 누수**다.
 *      서명은 그 자체가 비공개 버킷의 열쇠라, 미리 받은 만큼 10분짜리 꼬리가 늘어난다.
 *   👉 대신 화면은 **재생이 시작될 때 `열어봤다알리기` 를 한 번 보낸다**(버튼이 아니라 재생
 *      상태에서 잡는다 — 전체·구간·되듣기가 각자 보내면 셋이 갈라진다).
 *
 * ■ 🚫 재제안 금지
 *   · `verdict` 를 화면이 미리 그리기 — 서버가 파생한다(§5-1). 짐작과 저장값이 갈리면
 *     검수자는 **저장된 라벨을 안 본 채** 넘어간다. 확정 **뒤에** 서버가 준 값만 보인다.
 *   · 태그 자유 입력 — 정본은 `계약/수집_교정_계약.json` 이고, 자유 입력은 그 목록을 우회한다.
 *   · 폐기에 청취 게이트 걸기 — 무음·손상은 첫 초에 판정된다. 걸면 처방이 「쓰레기를 끝까지
 *     들어라」가 된다(§5-2).
 *
 * ■ 디자인 (`테마.js` R1)
 *   신호 1점 = **확정 버튼**(코랄 면 위 Ink Deep 글자). 이 화면엔 녹음이 없어 성립한다.
 *   🚫 폐기를 코랄로 칠하지 않는다 — 신호가 둘이 되면 R1 이 깨지고, 무엇보다 이 화면에서
 *   가장 자주 눌러야 할 것은 폐기가 아니라 확정이다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { 색, 폰트, 모노트래킹, 몽골어, 눌림층 } from './테마';
import {
  큐받기, 반목록받기, 오디오서명받기, 열어봤다알리기, 승인하기, 폐기하기, 폐기사유, 오류태그,
  검수쪽크기, 반쪽크기,
} from './검수API.js';
import { 청취문턱, 세그먼트펴기 } from '../lib/검수확정.js';
import { 새계측, 재기, 들은ms } from '../lib/청취계측.js';
import { use등장 } from '../lib/모션.js';
import { 화면설정읽기, 화면설정쓰기 } from './저장.js';

/** 기준 3줄 — 원어민의 언어 감각은 있어도 **이 시스템의 라벨 규격**은 없다(발주 §3 UX ①). */
const 기준3줄 = [
  ['들린 대로', '학생이 말한 그대로 적는다 — 여기서 고치지 않는다.'],
  ['교정문', '자연스러운 한국어 한 문장. 두 문장으로 늘리지 않는다.'],
  ['태그', '고친 자리의 종류만 고른다. 안 고쳤으면 「오류없음」 하나다.'],
];

const 초 = (ms) => (Math.round(ms / 100) / 10).toFixed(1);

/**
 * 항목 하나를 열 때 편집 칸에 채울 값 — **화면 밖으로 내보내 회귀가 닿게 한다.**
 *
 * 🔴 여기가 이 화면에서 **틀려도 조용한** 유일한 자리다. 나머지(버튼 잠김·문턱 표시)는
 *   틀리면 검수자 눈앞에서 바로 드러나는데, 초기값은 **그럴듯하게 틀린다**:
 *   재검수(`Z`)에서 앞 검수자가 고쳐 둔 `transcript_verified` 를 기계 전사로 덮으면
 *   화면은 멀쩡하고, 확정하는 순간 **앞 판정이 소리 없이 되돌려진다**(UX ③ 🔴).
 * 🔑 교정문의 초기값이 AI 교정문인 것은 의도다 — 검수자가 대부분 「맞다」를 누르는 자리라
 *   빈 칸에서 시작하면 매번 다시 타이핑하게 되고 그 마찰이 처리량을 정한다. verdict 는
 *   서버가 세 텍스트를 견줘 파생하므로 초기값이 라벨을 왜곡하지 않는다.
 */
export function 편집초기값(항목) {
  const it = 항목 && typeof 항목 === 'object' ? 항목 : {};
  return {
    검증전사: String(it.transcript_verified ?? it.transcript ?? ''),
    교정문: String(it.ai_corrected_text ?? ''),
    해설: String(it.ai_explanation ?? ''),
    태그: Array.isArray(it.ai_error_tags) ? [...it.ai_error_tags] : [],
  };
}

/**
 * 항목을 **열 때** 편집 칸에 넣을 값 — 첫 검수인가 재검수(`Z`)인가로 갈린다.
 *
 * 🔴 `Z` 는 항목에서 파생하면 안 된다. 손에 든 항목 객체는 **큐를 읽던 시점의 사본**이라
 *   서버가 방금 갱신한 `transcript_verified` 를 모른다 — 파생하면 사람이 고쳐 둔 전사가
 *   기계 전사로 되돌아가고, 그 상태로 확정하면 **앞 판정이 소리 없이 뒤집힌다**(UX ③ 🔴).
 *   다시 조회해 채울 길도 없다: 확정분은 큐 밖이라 §3·§4 가 둘 다 `NOT_FOUND` 다.
 * 🔑 그래서 확정할 때 **보낸 값을 그대로 쥐고**(`직전.보낸값`) 여기서 되돌린다.
 */
export function 여는값(항목, 재검수) {
  const 보낸값 = 재검수 && 재검수.보낸값;
  if (보낸값) {
    return {
      검증전사: String(보낸값.검증전사 ?? ''),
      교정문: String(보낸값.교정문 ?? ''),
      해설: String(보낸값.해설 ?? ''),
      태그: Array.isArray(보낸값.태그) ? [...보낸값.태그] : [],
      승격: 보낸값.승격 === true,
    };
  }
  /* 🚫 승격은 **안 물려받는다**(재검수에 보낸값이 없는 자리 포함) — 기본값이 「승격 안 함」인
     이유와 같다: 빠뜨린 요청이 승격으로 접히면 「검수 완료 = 훈련 적격」이 이름만 바꿔 선다. */
  return { ...편집초기값(항목), 승격: false };
}

/**
 * 반 모드 행의 조 번호 — null·쓰레기는 **0(「조 없음」)** 으로 접는다(화면 밖으로 내 회귀가 닿게).
 * 편성 전 학생을 조용히 떨어뜨리면 그 발화는 아무 조에도 안 보인다 — 서버가 nulls last 로
 * 뒤로 미루되 빼지는 않는 것과 같은 판단이라, 화면도 「조 없음」 칸으로 모아 **보이게** 둔다.
 */
export function 조번호(항목) {
  const g = Number(항목 && 항목.group_no);
  return Number.isFinite(g) && g > 0 ? Math.floor(g) : 0;
}

/**
 * 조 칩의 재료 — 받아 온 목록을 조 번호로 센다(반 모드 전용).
 * 반환 = `[{ 조, 수 }]` · 조 오름차순 · 0(조 없음)은 **맨 뒤**.
 */
/**
 * 반 모드에서 한 번에 이어 받을 쪽의 **상한**(폭주 방지 · 반박 P1-②A).
 * 정원 16명 × 쪽 20 이라 한 반은 대개 1쪽이다 — 이 수에 닿는 것은 밀린 큐뿐이고, 닿아도
 * 커서가 살아남아 「더 받기」로 이어진다(자르는 것이 아니라 **멈추고 말하는 것**이다).
 */
export const 이어읽기상한 = 20;

/**
 * 지금 그릴 **빈 화면의 종류**. 반박 P1-②B 가 난 자리라 순수 함수로 꺼냈다 — 화면 안에 있으면
 * 회귀가 닿는 길이 없고, 「없어요」와 「아직 더 있어요」가 같은 분기에 눌려도 초록이다.
 *
 * 🔴 넷을 **한 곳에서** 가른다(같은 판정을 두 곳에 적으면 갈라진다):
 *   `읽는중` · `조끝`(조 필터가 비웠을 뿐 반의 큐는 남았다) · `쪽끝`(손에 든 쪽만 비었고
 *   커서가 살아 있다) · `없음`(정말 없다). `쪽끝`을 `없음`으로 접으면 교사가 다 봤다고 믿고
 *   일어선다 — 큐는 줄어드는 목록이라 **증상이 없다.**
 * @returns {'읽는중'|'조끝'|'쪽끝'|'없음'|null} null = 빈 화면이 아니다(항목이 있다)
 */
export function 빈화면꼴({ 불러오는중, 항목있음, 목록수, 다음커서 }) {
  if (불러오는중) return '읽는중';
  if (항목있음) return null;
  if (목록수 > 0) return '조끝';
  if (다음커서) return '쪽끝';
  return '없음';
}

/**
 * 「다음 쪽 더 받기」를 보이나. 🔴 **목록이 비었는지는 안 본다**(반박 P1-②B) — 손에 든 쪽을
 * 다 확정하면 목록이 비면서 버튼까지 사라져, 커서가 살아 있는데 이어받을 길이 0이 됐다.
 * `!불러오는중` 은 반대쪽 구멍(P1-①)이다: 반 전환이 도는 동안 누르면 **옛 모드 커서**가
 * 새 모드 요청에 실린다.
 */
export function 더받기보임({ 다음커서, 재검수있음, 불러오는중 }) {
  return Boolean(다음커서) && !재검수있음 && !불러오는중;
}

/**
 * 이 쪽을 받고 **한 쪽 더 이어받나**(반 모드 전용 · 반박 P1-②A).
 * 기본 큐는 한 쪽씩 손으로 받는다(감사 표본 우선이라 앞쪽이 곧 우선순위다) — 반 모드만
 * 조 칩·수가 반 전체를 봐야 해서 이어 받는다.
 */
export function 이어받을까({ 반모드, 다음커서, 쪽수, 상한 = 이어읽기상한 }) {
  return Boolean(반모드) && Boolean(다음커서) && 쪽수 < 상한;
}

export function 조묶기(목록) {
  const 셈 = new Map();
  for (const it of Array.isArray(목록) ? 목록 : []) {
    const g = 조번호(it);
    셈.set(g, (셈.get(g) ?? 0) + 1);
  }
  return [...셈.entries()]
    .sort((a, b) => (a[0] || Infinity) - (b[0] || Infinity) || 0)
    .map(([조, 수]) => ({ 조, 수 }));
}

/** 서명이 아직 사나 — 만료 30초 전이면 죽은 것으로 본다(기기 시계 여유). 만료 null은 산 것(재검수 갈래·API가 expires_at을 못 받은 날) */
const 서명살았나 = (s) => Boolean(s && (!s.만료 || Date.parse(s.만료) - Date.now() > 30000));

/** 직전 확정을 다시 열 수 있는 남은 분 — 못 읽는 만료는 null(「몇 분」을 지어내지 않는다). */
export function 재열기남은분(만료, 지금ms) {
  const t = Date.parse(만료);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.ceil((t - 지금ms) / 60000));
}

export default function 검수화면({ 토큰, 돌아가기 }) {
  const [목록, set목록] = useState([]);
  const [다음커서, set다음커서] = useState(null);
  const [불러오는중, set불러오는중] = useState(true);
  const [오류, set오류] = useState('');

  const [기준펼침, set기준펼침] = useState(true);
  const [태그펼침, set태그펼침] = useState(false);
  const [폐기열림, set폐기열림] = useState(false);
  const [보내는중, set보내는중] = useState(false);

  /* 접힘 취향은 기기에 남는다 — 처음 온 사람에겐 펼침(기본), 접은 사람에겐 접힘(감사 D8-13). */
  useEffect(() => {
    let 살아있음 = true;
    화면설정읽기().then((p) => { if (살아있음 && p && p.검수기준접힘) set기준펼침(false); });
    return () => { 살아있음 = false; };
  }, []);

  /* §3-2 반 모드 — 「오늘 수업 반」(숙제서클 §10-3). `반 === null` = 기본 큐 그대로. */
  const [반목록, set반목록] = useState(null);   // null = 아직 못 읽음 · [] = 반 0개(다리 전)
  const [반목록오류, set반목록오류] = useState('');
  const [반, set반] = useState(null);           // { id, 이름 } — 고른 반
  const [조필터, set조필터] = useState(null);   // null = 전체 · 숫자 = 그 조만(0 = 조 없음)

  /* 편집 칸 — 항목이 바뀔 때 그 항목에서 새로 채운다. */
  const [검증전사, set검증전사] = useState('');
  const [교정문, set교정문] = useState('');
  const [해설, set해설] = useState('');
  const [태그, set태그] = useState([]);
  const [승격, set승격] = useState(false);

  const [계측, set계측] = useState(새계측);
  const [멈출ms, set멈출ms] = useState(null); // 구간 재생의 끝(UX ②) · null 이면 전체 재생
  const [현재ms, set현재ms] = useState(0);

  /* ④ 세션 요약 — 이 앉음 동안의 누적. 서버에 묻지 않는다(확정한 것은 이미 큐 밖이라
     다시 세려면 별도 조회가 필요하고, 그 조회는 이 계약 밖이다). */
  const [요약, set요약] = useState({ 확정: 0, 수정: 0, 승격: 0 });
  /* ③ 직전 확정 한 건 — `Z` 가 쓸 재료. 서명 URL 을 **같이 쥔다**(확정분은 §4 가 안 준다). */
  const [직전, set직전] = useState(null);
  const [재검수, set재검수] = useState(null); // { 항목, correction_id, url } · Z 로 연 상태
  const [지금분, set지금분] = useState(Date.now()); // 재열기 창의 분침 — 직전 카드가 있을 때만 돈다

  /* 서명은 제출물마다 하나. Map 을 ref 로 두는 것은 프리로드가 리렌더를 안 부르게 하려는 것이다. */
  const 서명맵 = useRef(new Map()).current;
  const 말림참조 = useRef(null);
  const [서명, set서명] = useState(null);

  /* §4-2 — **이 항목을 열었다고 서버에 알렸나.** 게이트 ②의 증거는 서명이 아니라 이것이다.
     🔑 화면이 서버 규칙을 흉내내는 것이 아니다 — 여기 담기는 것은 「내가 보냈나」라는
     화면 자신의 사실뿐이고, 판정은 서버가 자기 장부로 다시 한다. */
  const [열어봄, set열어봄] = useState(false);
  const 알리는중 = useRef(false);

  const 재생기 = useAudioPlayer();
  const 상태 = useAudioPlayerStatus(재생기);

  /* 조 칩이 켜져 있으면 그 조의 항목만 흐른다 — 서버 순서(조 → 좌석)는 그대로 두고
     화면이 자기 손의 목록을 거를 뿐이다(같은 판정을 두 곳에 적지 않는다). */
  const 보이는목록 = useMemo(
    () => (반 && 조필터 !== null ? 목록.filter((x) => 조번호(x) === 조필터) : 목록),
    [반, 조필터, 목록],
  );
  /* 조 칩의 재료는 **한 번만** 센다 — 칩 줄과 「조 정보 없음」 문구가 같은 배열을 봐야
     둘이 갈리지 않는다(같은 판정을 두 곳에 적지 않는다). */
  const 조들 = useMemo(() => 조묶기(목록), [목록]);
  const 항목 = 재검수 ? 재검수.항목 : (보이는목록[0] ?? null);
  const sid = 항목 ? 항목.submission_id : null;
  /* ⚠ `목록수` 는 **거르기 전** 수다 — 조 필터가 보이는목록을 비웠을 뿐 반의 큐는 남아 있는
     자리(`조끝`)를 그것으로 가른다. 보이는목록을 넣으면 그 자리가 통째로 「없음」이 된다. */
  const 빈꼴 = 빈화면꼴({
    불러오는중, 항목있음: Boolean(항목), 목록수: 목록.length, 다음커서,
  });

  const 세그먼트 = useMemo(() => 세그먼트펴기(항목 && 항목.stt_segments), [항목]);
  const 문턱 = useMemo(() => 청취문턱(항목 && 항목.stt_segments), [항목]);
  const 들은 = 들은ms(계측);
  const 게이트통과 = 들은 >= 문턱.ms;

  /* ── 큐 ─────────────────────────────────────────────────────────── */

  /* 🔴 **늦게 온 응답은 버린다**(반박 P2-⑤). 반A→반B 를 빠르게 누르면 A 의 응답이 B 것보다
     늦게 도착해 B 의 머리 아래에 A 의 초안이 실린다 — 교사는 눈앞의 학생과 **다른 반의 발화**를
     반 모드 얼굴(이름·조·좌석까지)로 보게 되고, 그 상태로 확정하면 남의 판정이 된다.
     요청마다 번호를 매기고 **마지막 번호만 화면에 닿게** 한다. */
  const 요청번호 = useRef(0);

  const 큐읽기 = useCallback(async (커서) => {
    set오류('');
    요청번호.current += 1;
    const 내번호 = 요청번호.current;
    try {
      let 이번커서 = 커서;
      let 쪽수 = 0;
      for (;;) {
        const { 목록: 온것, 다음커서: 다음 } = await 큐받기(토큰, {
          개수: 반 ? 반쪽크기 : 검수쪽크기, 커서: 이번커서, 반: 반 ? 반.id : null,
        });
        if (요청번호.current !== 내번호) return;   // 그 사이 반이 바뀌었다 — 이 응답은 남의 화면이다
        set목록((앞) => (이번커서 || 쪽수 ? [...앞, ...온것] : 온것));
        set다음커서(다음);
        쪽수 += 1;
        /* 🔴 **반 모드는 쪽을 이어서 다 받는다**(반박 P1-②A). 정원 16명이라 반의 큐는 한 쪽을
           구조적으로 넘고, 한 쪽만 쥐고 그리면 조 칩이 「이 쪽에 실린 조」만 된다 — 교사가 조3
           옆에 앉았는데 화면이 **그 조는 없다고 말한다**. 「더 받기」로 미루는 것은 20분 순회에
           사람 손을 하나 더 얹는 해법이라(철학 ㉡) 답이 아니다.
           상한은 폭주 방지일 뿐이고, 걸리면 `다음커서`가 살아남아 「더 받기」가 그대로 보인다
           — 조용히 자르지 않는다(잘린 것과 없는 것이 같은 모양이면 안 된다). */
        if (!이어받을까({ 반모드: 반, 다음커서: 다음, 쪽수 })) break;
        이번커서 = 다음;
      }
    } catch (e) {
      /* 🔴 빈 큐와 조회 실패를 **같은 모양으로 두지 않는다** — 오늘 큐는 구조적으로 0행이라
         (AI 교정 생산자가 운영에 없다) 실패를 조용히 삼키면 「원래 없는 것」으로 보인다. */
      if (요청번호.current === 내번호) set오류(문구(e));
    } finally {
      if (요청번호.current === 내번호) set불러오는중(false);
    }
  }, [토큰, 반]);

  /* 반을 바꾸면 커서·목록·조 필터를 **그 자리에서** 버리고 처음부터 읽는다 — 두 모드의 커서는
     꼴이 달라 섞으면 400 이고(§3-2), 남의 조 필터가 새 반에 붙으면 첫 화면이 이유 없이 빈다.
     🔴 **커서를 응답이 온 뒤에 갈면 늦다**(반박 P1-①): 그 사이 「다음 쪽 더 받기」가 옛 모드
     커서를 새 모드 요청에 실어 보내고, 서버는 그것을 **400 이 아니라 200 으로** 읽어(꼴이
     서로를 통과했다) 한 조를 통째로 건너뛴 목록을 준다. 목록도 같이 버린다 — 안 버리면 새 반
     머리 아래 옛 반 초안이 남는다. */
  useEffect(() => {
    set불러오는중(true); set조필터(null); set다음커서(null); set목록([]);
    큐읽기(null);
  }, [큐읽기]);

  /* 반 카드 목록 — 앉을 때 한 번. 실패해도 기본 큐는 그대로 돈다(반 모드만 잠긴다). */
  useEffect(() => {
    let 살아있음 = true;
    반목록받기(토큰)
      .then((온것) => { if (살아있음) { set반목록(온것); set반목록오류(''); } })
      .catch((e) => { if (살아있음) set반목록오류(문구(e)); });
    return () => { 살아있음 = false; };
  }, [토큰]);

  /* ── 항목이 바뀌면 편집 칸을 그 항목에서 새로 채운다 ─────────────── */
  useEffect(() => {
    if (!항목) return;
    /* 🔴 재검수(`Z`)는 **방금 확정한 값에서 이어야** 한다. 손에 든 항목 객체는 큐를 읽을 때의
       사본이라 서버가 방금 갱신한 `transcript_verified` 를 모른다 — 여기서 다시 파생하면
       사람이 고쳐 둔 전사가 기계 전사로 되돌아가고, 화면은 멀쩡한 채 확정만 뒤집힌다
       (UX ③ 🔴 · `tests/검수화면.test.js` 가 지키는 그 문장의 **런타임 짝**이다). */
    const 처음 = 여는값(항목, 재검수);
    set검증전사(처음.검증전사);
    set교정문(처음.교정문);
    set해설(처음.해설);
    set태그(처음.태그);
    set승격(처음.승격);
    set멈출ms(null);
    set폐기열림(false);
    /* 🔑 청취 계측은 **재검수에서 안 지운다** — 같은 오디오를 방금 들었고, 지우면 10분짜리
       재검수 창 안에서 하한 3초를 또 들어야 한다. 그 마찰이 곧 「확정을 미룬다」이고,
       미룬 확정이 큐를 막는다(UX ③ 가 있는 이유 그 자체). */
    if (!재검수) { set계측(새계측()); set현재ms(0); }
    /* 🔴 **열어봄은 재검수에서도 지운다** — 계측과 반대다. 서버 게이트 ②가 재검수에
       「마지막 판정 **이후**의 재생」을 요구하므로(§5 게이트 ②), 방금 확정 전에 보낸
       `played` 는 그 판정보다 앞서서 증거가 안 된다. 여기서 안 지우면 화면만 「확정 가능」이고
       서버는 거절해, 검수자가 이유를 모른 채 막힌다. */
    set열어봄(false);
  }, [항목, 재검수]);

  /* ── §4 서명 — **여는 순간에만** 부른다(부를 때마다 감사 1행) ────── */
  useEffect(() => {
    if (!sid) { set서명(null); return undefined; }
    if (재검수) { set서명({ url: 재검수.url, 만료: null }); return undefined; }
    let 살아있음 = true;
    (async () => {
      try {
        const 이미 = 서명맵.get(sid);
        const 받은 = 서명살았나(이미) ? 이미 : await 오디오서명받기(토큰, sid);
        서명맵.set(sid, 받은);
        if (살아있음) set서명(받은);
      } catch (e) {
        /* 재생이 불가능하면 게이트 ②도 못 지나 확정이 원리상 안 된다 — 숨기지 않는다. */
        if (살아있음) { set서명(null); set오류(문구(e)); }
      }
    })();
    return () => { 살아있음 = false; };
  }, [sid, 재검수, 토큰, 서명맵]);

  useEffect(() => {
    if (서명 && 서명.url) 재생기.replace({ uri: 서명.url });
  }, [서명, 재생기]);

  /* ── 재생 상태 → 청취 계측 + 구간 자동 정지 ──────────────────────── */
  useEffect(() => {
    if (!상태) return;
    const 위치ms = Math.round(Number(상태.currentTime || 0) * 1000);
    set현재ms(위치ms);
    set계측((앞) => 재기(앞, {
      재생중: 상태.playing === true,
      위치ms,
      시각ms: Date.now(),
    }));
    /* UX ② — 구간만 듣게 한다. 끝을 지나면 세우고 다음 누름은 다시 그 구간 처음부터다. */
    if (멈출ms !== null && 상태.playing && 위치ms >= 멈출ms) {
      재생기.pause();
      set멈출ms(null);
    }
  }, [상태, 멈출ms, 재생기]);

  /* ── §4-2 재생이 시작되면 **한 번** 알린다 — 게이트 ②의 증거 ─────
     🔑 버튼이 아니라 **재생 상태**에서 잡는다. 전체 재생·구간 칩·되듣기가 각자 알리면 셋이
        갈라지고, 갈라진 쪽의 증상은 「확정이 안 되는데 화면은 멀쩡함」이다.
     🔑 항목당 한 번이면 족하다 — 게이트가 묻는 것은 횟수가 아니라 **마지막이 언제인가**이고,
        `Z` 진입 때 위 effect 가 이 플래그를 지우므로 그때 다시 보내진다. */
  useEffect(() => {
    if (!sid || 열어봄 || 알리는중.current) return;
    if (!상태 || 상태.playing !== true) return;
    알리는중.current = true;
    열어봤다알리기(토큰, sid)
      .then(() => set열어봄(true))
      /* 🔴 조용히 삼키지 않는다 — 이게 실패하면 확정이 `GATE_NOT_MET` 으로 거절되는데,
         그때 검수자가 보는 것은 「다 들었는데 왜 안 되지」뿐이다. */
      .catch((e) => set오류(문구(e)))
      .finally(() => { 알리는중.current = false; });
  }, [sid, 열어봄, 상태, 토큰, 알리는중]);

  /* ── 프리로드 — 게이트를 통과한 뒤 **다음 하나만** (머리말 🔑) ───── */
  useEffect(() => {
    if (!게이트통과 || 재검수) return;
    /* 조 필터가 켜져 있으면 「다음」도 그 조에서 온다 — 교사가 실제로 다음에 열 항목이다. */
    const 다음 = 보이는목록[1];
    if (!다음 || 서명살았나(서명맵.get(다음.submission_id))) return;
    오디오서명받기(토큰, 다음.submission_id)
      .then((받은) => 서명맵.set(다음.submission_id, 받은))
      .catch(() => { /* 프리로드 실패는 조용하다 — 열 때 다시 부른다 */ });
  }, [게이트통과, 재검수, 보이는목록, 토큰, 서명맵]);

  /* ③ 재열기 창의 분침 — 직전 카드가 서 있는 동안만 30초마다 다시 잰다. */
  useEffect(() => {
    if (!직전) return undefined;
    set지금분(Date.now());
    const t = setInterval(() => set지금분(Date.now()), 30000);
    return () => clearInterval(t);
  }, [직전]);

  /* 다음 항목·반 전환·조 칩 전환은 화면 꼭대기에서 시작한다 — 앞 카드의 스크롤 위치를 안 물려받는다. */
  useEffect(() => {
    if (말림참조.current) 말림참조.current.scrollTo({ y: 0, animated: true });
  }, [sid, 반 && 반.id, 조필터]);

  /* ── 조작 ───────────────────────────────────────────────────────── */

  const 전체재생 = () => {
    set멈출ms(null);
    if (상태 && 상태.playing) { 재생기.pause(); return; }
    재생기.play();
  };

  const 구간재생 = (구간) => {
    set멈출ms(구간.끝ms);
    Promise.resolve(재생기.seekTo(구간.시작ms / 1000)).then(() => 재생기.play()).catch(() => {});
  };

  const 태그토글 = (t) => {
    set태그((앞) => (앞.includes(t) ? 앞.filter((x) => x !== t) : [...앞, t]));
  };

  const 확정 = async () => {
    if (!항목 || 보내는중) return;
    set보내는중(true);
    set오류('');
    try {
      const 결과 = await 승인하기(토큰, {
        submission_id: 항목.submission_id,
        reviewed_correction_id: 항목.ai_correction_id,
        transcript_verified: 검증전사,
        corrected_text: 교정문,
        error_tags: 태그,
        explanation: 해설 || null,
        review_listened_ms: 들은,
        promote: 승격,
        ...(재검수 ? { supersedes: 재검수.correction_id } : {}),
      });
      set요약((앞) => ({
        확정: 앞.확정 + 1,
        /* 🔑 「수정」은 **서버가 낸 verdict** 로 센다 — 화면이 텍스트를 견줘 세면 NFC 정규화가
           빠져 같은 글자가 다르게 세이고, 그 숫자는 검수자에게 거짓을 말한다. */
        수정: 앞.수정 + (결과.verdict === '고칠 곳이 있다' ? 1 : 0),
        승격: 앞.승격 + (결과.promotion_intent ? 1 : 0),
      }));
      set직전({
        항목,
        correction_id: 결과.correction_id,
        verdict: 결과.verdict,
        url: 서명 && 서명.url,
        만료: (서명 && 서명.만료) || new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        게이트: 결과.listen_gate,
        /* 🔑 **보낸 값을 그대로 쥔다** — `Z` 가 이 자리에서 이어야 하고, 항목 객체는 그것을
           모른다(서버만 안다). 다시 조회해 채우는 길은 없다: 확정분은 큐 밖이라 §3·§4 가
           둘 다 `NOT_FOUND` 다. */
        보낸값: { 검증전사, 교정문, 해설, 태그: [...태그], 승격 },
      });
      if (재검수) set재검수(null);
      /* 🔑 자리(slice(1))가 아니라 **id 로** 뺀다 — 조 필터가 켜져 있으면 지금 항목이
         목록의 0번이 아닐 수 있고, 자리로 빼면 남의 항목이 조용히 사라진다. */
      else set목록((앞) => 앞.filter((x) => x.submission_id !== 항목.submission_id));
    } catch (e) {
      set오류(문구(e));
    } finally {
      set보내는중(false);
    }
  };

  const 폐기 = async (사유) => {
    if (!항목 || 보내는중) return;
    set보내는중(true);
    set오류('');
    try {
      await 폐기하기(토큰, 항목.submission_id, 사유);
      set폐기열림(false);
      /* 폐기는 재열기 대상이 아니다 — `Z` 는 확정만 되돌린다(§5-1 재검수는 `verified` 만). */
      set직전(null);
      if (재검수) set재검수(null);
      else set목록((앞) => 앞.filter((x) => x.submission_id !== 항목.submission_id));
    } catch (e) {
      set오류(문구(e));
    } finally {
      set보내는중(false);
    }
  };

  /* ③ `Z` — 직전 확정을 다시 연다. 큐에 되돌리지 않는다(그 항목은 이미 큐 밖이다). */
  const 재열기 = () => {
    if (!직전 || !직전.url || 재열기남은분(직전.만료, Date.now()) === 0) return;
    set재검수({
      항목: 직전.항목,
      correction_id: 직전.correction_id,
      url: 직전.url,
      보낸값: 직전.보낸값,
    });
    set직전(null);
    set오류('');
  };

  /* ── 그리기 ─────────────────────────────────────────────────────── */

  /* 🔑 `열어봄` 이 조건에 있는 이유 — 서버 게이트 ②의 증거가 서명이 아니라 **재생 알림**으로
     옮겨졌다(§2 개정). 여기서 잠그는 것은 여전히 **편의**이고 판정은 서버가 자기 장부로 한다. */
  const 확정가능 = !!항목 && !!항목.ai_correction_id && !!서명 && 열어봄 && 게이트통과 && !보내는중
    && 검증전사.trim() !== '' && 교정문.trim() !== '';

  const 남은분 = 직전 ? 재열기남은분(직전.만료, 지금분) : null;
  const 만료됨 = 남은분 === 0;

  return (
    <View style={s.wrap}>
    <ScrollView ref={말림참조} style={s.말림} contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
      <Text style={s.label}>REVIEW</Text>
      <Text style={s.머리}>검수</Text>

      {/* ④ 세션 요약 1줄 — 「소모」가 아니라 「기여」로 보이게 하는 유일한 자리 */}
      <Text style={s.요약}>
        오늘 확정 {요약.확정} · 수정 {요약.수정} · 승격 {요약.승격}
      </Text>

      {/* ① 기준 카드 — 상시 접이식 3줄 */}
      <Pressable
        onPress={() => set기준펼침((v) => {
          const 다음 = !v;
          화면설정읽기().then((p) => 화면설정쓰기({ ...(p || {}), 검수기준접힘: !다음 })).catch(() => {});
          return 다음;
        })}
        hitSlop={{ top: 10, bottom: 10 }}
        style={{ alignSelf: 'stretch' }}
      >
        <Text style={s.접이머리}>{기준펼침 ? '▾' : '▸'} 검수 기준</Text>
      </Pressable>
      {기준펼침 && (
        <View style={s.카드}>
          {기준3줄.map(([이름, 설명]) => (
            <View key={이름} style={s.기준줄}>
              <Text style={s.기준이름}>{이름}</Text>
              <Text style={s.기준글}>{설명}</Text>
            </View>
          ))}
        </View>
      )}

      {/* §3-2 오늘 수업 반 — 순회 검수의 입구(숙제서클 §10-3). 반을 고르면 큐가
          조 → 좌석 순으로 갈리고, 조 칩으로 지금 앉은 조만 남긴다. */}
      <View style={s.카드}>
        <Text style={s.접이머리}>오늘 수업 반</Text>
        {반목록오류 ? (
          <Text style={s.메모}>반 목록을 못 읽었어요 — {반목록오류}</Text>
        ) : null}
        {반목록 !== null && 반목록.length === 0 && (
          /* 🔴 「반이 0개」와 「전부 처리됨」을 같은 모양으로 두지 않는다(§3-2) */
          <Text style={s.메모}>반 정보가 아직 없어요 — 명부 다리가 서면 여기에 반이 떠요.</Text>
        )}
        {반목록 !== null && 반목록.length > 0 && (
          <View style={s.칩줄}>
            <Pressable
              onPress={() => set반(null)}
              style={({ pressed }) => [s.칩, !반 && s.칩_고름, pressed && s.눌림]}
            >
              <Text style={s.칩글}>전체 큐</Text>
            </Pressable>
            {반목록.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => set반({ id: c.id, 이름: c.이름 || c.열쇠 })}
                style={({ pressed }) => [s.칩, 반 && 반.id === c.id && s.칩_고름, pressed && s.눌림]}
              >
                <Text style={s.칩글}>{c.이름 || c.열쇠} · {c.대기}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {반 && !불러오는중 && 목록.length > 0 && (
          <View style={s.칩줄}>
            <Pressable
              onPress={() => set조필터(null)}
              style={({ pressed }) => [s.칩, 조필터 === null && s.칩_고름, pressed && s.눌림]}
            >
              <Text style={s.칩글}>전체</Text>
            </Pressable>
            {조들.map(({ 조, 수 }) => (
              <Pressable
                key={조}
                onPress={() => set조필터(조)}
                style={({ pressed }) => [s.칩, 조필터 === 조 && s.칩_고름, pressed && s.눌림]}
              >
                <Text style={s.칩글}>{조 === 0 ? '조 없음' : `${조}조`} {수}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {반 && !불러오는중 && 목록.length > 0 && 조들.every((g) => g.조 === 0) && (
          /* 「조 정보가 없다」와 「편성이 없다」를 검수자 눈에 보이게 — 조용히 평평하게 그리면
             다리가 안 선 것과 편성 전이 같은 모양이 된다. */
          <Text style={s.메모}>조 정보가 아직 없어요 — 편성 전이거나 명부 다리가 서기 전이에요.</Text>
        )}
      </View>

      {빈꼴 === '읽는중' && <Text style={s.메모}>검수할 목록을 읽는 중이에요…</Text>}

      {빈꼴 === '조끝' && (
        /* 조 필터가 그 조를 다 비웠을 뿐 반의 큐는 남아 있다 — 「없다」로 그리면 거짓이다. */
        <View style={s.카드}>
          <Text style={s.빈머리}>이 조는 다 봤어요</Text>
          <Text style={s.메모}>다른 조 칩을 누르면 남은 항목이 이어져요.</Text>
        </View>
      )}

      {빈꼴 === '쪽끝' && (
        /* 🔴 **`다음커서`가 살아 있으면 「없어요」가 아니다**(반박 P1-②B). 손에 든 쪽을 전부
           확정하면 목록은 비지만 뒤 쪽은 그대로 남아 있다 — 그때 「검수할 것이 없어요」를 그리면
           교사는 다 봤다고 믿고 일어선다. **조용한 미검수 경로**라 증상이 없다. */
        <View style={s.카드}>
          <Text style={s.빈머리}>이 쪽은 다 봤어요</Text>
          <Text style={s.메모}>아직 뒤에 더 남아 있어요 — 아래 「다음 쪽 더 받기」를 누르면 이어져요.</Text>
        </View>
      )}

      {빈꼴 === '없음' && (
        <View style={s.카드}>
          <Text style={s.빈머리}>{반 ? '이 반에는 지금 검수할 것이 없어요' : '검수할 것이 없어요'}</Text>
          <Text style={s.메모}>
            이 목록에는 「제출 + AI 교정」이 둘 다 있는 발화만 떠요.
            {'\n'}AI 교정이 아직 안 도는 동안에는 비어 있는 것이 정상이에요.
          </Text>
        </View>
      )}

      {항목 && (
        <등장카드 key={String(sid)} style={s.카드}>
          {재검수 && <Text style={s.재검수띠}>재검수 — 직전 확정을 대신합니다</Text>}

          {/* 반 모드의 매칭 키 — 순회 검수는 눈앞의 학생과 초안을 잇는 일이라 이름·조·좌석이
              머리에 선다(§3-2). 전체 큐에는 이 열이 아예 안 와서(판이 다르다) 줄 자체가 없다. */}
          {반 && 항목.display_name !== undefined && (
            <Text style={s.이름줄}>
              {항목.display_name || '이름 없음'}
              {조번호(항목) > 0
                ? ` · ${조번호(항목)}조${Number(항목.seat_no) > 0 ? ` ${Number(항목.seat_no)}번` : ''}`
                : ' · 조 미편성'}
            </Text>
          )}

          <Text style={s.메타}>
            {[항목.task_type, 항목.task_format].filter(Boolean).join(' · ')}
            {항목.is_audit_sample ? ' · 감사 표본' : ''}
            {Number.isFinite(Number(항목.stt_confidence))
              ? ` · 전사 신뢰도 ${항목.stt_confidence}`
              : ' · 전사 신뢰도 미측정'}
          </Text>
          {항목.task_instruction ? (
            <Text style={s.지시문}>{항목.task_instruction}</Text>
          ) : null}

          {/* ② 구간 단위 청취 — 전체 재생·청취 타이머는 스크롤 밖 재생띠에 산다 */}
          {세그먼트.length > 0 ? (
            <View style={s.칩줄}>
              {세그먼트.map((구간, i) => {
                const 여기 = 현재ms >= 구간.시작ms && 현재ms < 구간.끝ms;
                return (
                  <Pressable
                    key={`${구간.시작ms}-${i}`}
                    onPress={() => 구간재생(구간)}
                    disabled={!서명}
                    hitSlop={{ top: 8, bottom: 8, left: 2, right: 2 }}
                    style={({ pressed }) => [
                      s.칩, 구간.저신뢰 && s.칩_저신뢰, 여기 && s.칩_현재, pressed && s.눌림,
                    ]}
                  >
                    <Text style={s.칩글}>{구간.글 || `${초(구간.시작ms)}s`}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            /* 🔴 「없다」와 「아무도 안 만든다」를 가른다 — 안 가르면 검수자는 이 발화만
               구간이 없는 줄 안다. 오늘은 저장소 전체에 이 칸을 쓰는 코드가 0줄이다. */
            <Text style={s.메모}>
              구간 정보가 없어 전체 재생으로만 들어요 — 구간 나누기는 아직 준비 전이에요.
              {문턱.재료 ? '' : ' 그래서 최소 3초는 들어야 확정할 수 있어요.'}
            </Text>
          )}

          {/* 들린 대로 */}
          <Text style={s.칸이름}>들린 대로 (고치지 않는다)</Text>
          <TextInput
            style={s.입력}
            value={검증전사}
            onChangeText={set검증전사}
            multiline
            placeholder="학생이 말한 그대로"
            placeholderTextColor={색.잉크_메타}
          />

          {/* AI 교정문 — 원본을 보여 주고, 그대로 쓸 수 있게 한다 */}
          {항목.ai_corrected_text ? (
            <View style={s.가로}>
              <Text style={s.ai글} selectable>AI: {항목.ai_corrected_text}</Text>
              <Pressable
                onPress={() => set교정문(String(항목.ai_corrected_text))}
                hitSlop={{ top: 8, bottom: 8 }}
                style={({ pressed }) => [s.작은버튼, pressed && s.눌림]}
              >
                {/* ⚠ 문구 초안 — 확정은 유호님 몫 */}
                <Text style={s.작은버튼글}>AI 문장으로</Text>
              </Pressable>
            </View>
          ) : null}

          <Text style={s.칸이름}>교정문 (한국어 한 문장)</Text>
          <TextInput
            style={s.입력}
            value={교정문}
            onChangeText={set교정문}
            multiline
            placeholder="자연스러운 한국어 한 문장"
            placeholderTextColor={색.잉크_메타}
          />

          {/* 해설 — 몽골어 칸이라 킷 폰트를 안 쓴다(`테마.몽골어`). 확정 요건이 아니다. */}
          <Text style={s.칸이름}>해설 (몽골어 · 확정 요건 아님)</Text>
          <TextInput
            style={s.해설입력}
            value={해설}
            onChangeText={set해설}
            multiline
            placeholder="Тайлбар"
            placeholderTextColor={색.잉크_메타}
          />

          {/* 태그 — 고른 것은 늘 보이고, 목록은 접는다 */}
          <Pressable
            onPress={() => set태그펼침((v) => !v)}
            hitSlop={{ top: 10, bottom: 10 }}
            style={{ alignSelf: 'stretch' }}
          >
            <Text style={s.접이머리}>{태그펼침 ? '▾' : '▸'} 태그 {태그.length}개</Text>
          </Pressable>
          <View style={s.칩줄}>
            {(태그펼침 ? 오류태그 : 태그).map((t) => (
              <Pressable
                key={t}
                onPress={() => 태그토글(t)}
                hitSlop={{ top: 8, bottom: 8, left: 2, right: 2 }}
                style={({ pressed }) => [s.칩, 태그.includes(t) && s.칩_고름, pressed && s.눌림]}
              >
                <Text style={s.칩글}>{t}</Text>
              </Pressable>
            ))}
          </View>

          {/* 승격 의사 — 기본은 **안 함**이다(§5-1 🚫) */}
          <Pressable
            onPress={() => set승격((v) => !v)}
            hitSlop={{ top: 10, bottom: 10 }}
            style={[s.체크줄, { alignSelf: 'stretch' }]}
          >
            <Text style={s.체크}>{승격 ? '■' : '□'}</Text>
            <Text style={s.체크글}>학습 데이터로 승격</Text>
          </Pressable>

          <View style={s.가로}>
            <Pressable
              onPress={확정}
              disabled={!확정가능}
              style={({ pressed }) => [s.확정, !확정가능 && s.확정_잠김, pressed && s.눌림]}
            >
              <Text style={s.확정글}>{보내는중 ? '보내는 중…' : '확정'}</Text>
            </Pressable>
            <Pressable
              onPress={() => set폐기열림((v) => !v)}
              disabled={보내는중}
              hitSlop={{ top: 8, bottom: 8 }}
              style={({ pressed }) => [s.작은버튼, pressed && s.눌림]}
            >
              <Text style={s.작은버튼글}>폐기</Text>
            </Pressable>
          </View>

          {오류 ? <Text style={s.오류}>{오류}</Text> : null}

          {!게이트통과 && (
            <Text style={s.메모}>
              아직 {초(문턱.ms - 들은)}초 더 들어야 확정할 수 있어요.
            </Text>
          )}
          {/* §4-2 — 「왜 확정이 안 되나」를 화면이 말한다. 재검수는 이유가 달라서 문구도 다르다:
              계측은 남아 있어 「다 들었는데 왜」로 보이는데, 서버가 요구하는 것은 **이번 판정
              이후의 재생**이다. 안 말하면 검수자는 자백을 적어 보내는 쪽으로 움직인다. */}
          {!열어봄 && (
            <Text style={s.메모}>
              {재검수
                ? '한 번 더 재생해 주세요 — 마지막 판정 이후에 다시 들은 기록이 있어야 확정돼요.'
                : '재생을 시작해야 확정할 수 있어요.'}
            </Text>
          )}
          {!항목.ai_correction_id && (
            <Text style={s.메모}>이 항목에는 평가할 AI 교정이 없어 확정할 수 없어요.</Text>
          )}

          {폐기열림 && (
            <View style={s.폐기판}>
              <Text style={s.칸이름}>폐기 사유</Text>
              <View style={s.칩줄}>
                {폐기사유.map((사유) => (
                  <Pressable
                    key={사유}
                    onPress={() => 폐기(사유)}
                    disabled={보내는중}
                    style={({ pressed }) => [s.칩, pressed && s.눌림]}
                  >
                    <Text style={s.칩글}>{사유}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={s.메모}>파일은 남아요 — 노이즈도 학습 재료예요.</Text>
            </View>
          )}
        </등장카드>
      )}

      {/* ③ 직전 확정 재열기 */}
      {직전 && (
        <View style={s.카드}>
          <Text style={s.칸이름}>직전 확정 — {직전.verdict}</Text>
          {직전.게이트 && 직전.게이트.measured === false ? (
            <Text style={s.메모}>
              청취 문턱은 하한 {초(직전.게이트.required_ms)}초로 쟀어요(구간 미측정).
            </Text>
          ) : null}
          <Pressable
            onPress={재열기}
            disabled={!직전.url || 만료됨 || 보내는중}
            hitSlop={{ top: 8, bottom: 8 }}
            style={({ pressed }) => [s.작은버튼, (!직전.url || 만료됨) && s.잠김, pressed && s.눌림]}
          >
            <Text style={s.작은버튼글}>다시 열기 (Z)</Text>
          </Pressable>
          <Text style={s.메모}>
            {만료됨
              ? '링크가 만료돼 다시 열 수 없어요.'
              : (남은분 != null
                ? `${남은분}분 안에 다시 열 수 있어요.`
                : '오디오 링크가 살아 있는 10분 안에만 다시 열 수 있어요.')}
          </Text>
        </View>
      )}

      {!항목 && 오류 ? <Text style={s.오류}>{오류}</Text> : null}

      {더받기보임({ 다음커서, 재검수있음: Boolean(재검수), 불러오는중 }) ? (
        <Pressable
          onPress={() => 큐읽기(다음커서)}
          hitSlop={{ top: 8, bottom: 8 }}
          style={({ pressed }) => [s.작은버튼, pressed && s.눌림]}
        >
          <Text style={s.작은버튼글}>다음 쪽 더 받기</Text>
        </Pressable>
      ) : null}

      <Pressable onPress={돌아가기} style={({ pressed }) => [s.back, pressed && { opacity: 0.7 }]}>
        <Text style={s.backText}>← 돌아가기</Text>
      </Pressable>
    </ScrollView>
    {/* 재생띠 — 스크롤 밖 고정(강사화면 마스코트자리 무늬). 긴 카드를 내려도 게이트 진행이 보인다. */}
    {항목 ? (
      <View style={s.재생띠}>
        <Pressable
          onPress={전체재생}
          disabled={!서명}
          style={({ pressed }) => [s.작은버튼, !서명 && s.잠김, pressed && s.눌림]}
        >
          <Text style={s.작은버튼글}>
            {상태 && 상태.playing ? '멈춤' : (서명 ? '전체 재생' : '오디오 없음')}
          </Text>
        </Pressable>
        <Text style={s.타이머}>
          {초(현재ms)}s · 들은 {초(들은)}s / 필요 {초(문턱.ms)}s
        </Text>
      </View>
    ) : null}
    </View>
  );
}

/** 항목 카드의 등장 한 박자 — key 재마운트와 맞물려 항목마다 새로 선다(`lib/모션.js`). */
function 등장카드({ style, children }) {
  const 등장 = use등장();
  return <Animated.View style={[style, 등장]}>{children}</Animated.View>;
}

/** 오류를 검수자 말로. 코드가 없으면 메시지를 그대로 낸다(지어내지 않는다). */
function 문구(e) {
  const 코드 = e && e.code;
  if (코드 === 'NOT_STAFF') return '이 계정에는 검수 권한이 없어요.';
  if (코드 === 'NOT_FOUND') return '그 항목은 지금 큐에 없어요 — 다른 사람이 먼저 처리했을 수 있어요.';
  if (코드 === 'SUPERSEDE_CONFLICT') return '그 판정은 이미 다른 재검수가 대신했어요.';
  if (코드 === 'GATE_NOT_MET') return String((e && e.message) || '아직 확정 조건을 못 채웠어요.');
  return String((e && e.message) || e || '잠시 뒤 다시 해주세요');
}

/** 두 입력 칸의 공통 면 — 글꼴만 다르다(한국어는 킷, 몽골어는 시스템). */
const 입력바탕 = {
  color: 색.잉크, backgroundColor: 색.바탕, borderRadius: 12, padding: 12, minHeight: 56,
};

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: 색.바탕 },
  말림: { flex: 1 },
  /* 머리글 위 빈 띠(paddingTop 76) 안 — 첫 화면과 안 겹치고, 스크롤해도 제자리다. */
  재생띠: {
    position: 'absolute', top: 10, left: 20, right: 20,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 색.바탕띄움, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  inner: { padding: 20, paddingTop: 76, paddingBottom: 48, gap: 12 },

  label: { fontFamily: 폰트.모노, fontSize: 10, letterSpacing: 모노트래킹.라벨, color: 색.잉크_메타 },
  머리: { fontFamily: 폰트.헤드, fontSize: 26, lineHeight: 34, color: 색.잉크 },
  요약: { fontFamily: 폰트.강조, fontSize: 14, lineHeight: 22, color: 색.잉크_서브 },

  접이머리: { fontFamily: 폰트.강조, fontSize: 13, lineHeight: 22, color: 색.잉크_서브 },
  카드: { backgroundColor: 색.바탕띄움, borderRadius: 18, padding: 18, gap: 12 },

  기준줄: { gap: 2 },
  기준이름: { fontFamily: 폰트.강조, fontSize: 13, color: 색.잉크 },
  기준글: { fontFamily: 폰트.캡션, fontSize: 13, lineHeight: 20, color: 색.잉크_서브 },

  빈머리: { fontFamily: 폰트.강조, fontSize: 16, lineHeight: 24, color: 색.잉크 },
  재검수띠: { fontFamily: 폰트.강조, fontSize: 13, color: 색.잉크 },
  /* 반 모드의 매칭 키 — 이 화면에서 이름은 장식이 아니라 「누구 초안인가」의 판정 재료다. */
  이름줄: { fontFamily: 폰트.강조, fontSize: 16, lineHeight: 24, color: 색.잉크 },
  메타: { fontFamily: 폰트.캡션, fontSize: 12, lineHeight: 19, color: 색.잉크_메타 },
  지시문: { fontFamily: 폰트.본문, fontSize: 15, lineHeight: 24, color: 색.잉크_서브 },

  가로: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  타이머: { fontFamily: 폰트.모노, fontSize: 11, letterSpacing: 모노트래킹.타이머, color: 색.잉크_메타 },

  칩줄: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  칩: {
    borderWidth: 1, borderColor: 색.잉크_희미, borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  /* 저신뢰 = 「여기를 들어라」. 코랄을 안 쓴다 — 이 화면의 신호 1점은 확정 버튼이다. */
  칩_저신뢰: { borderColor: 색.잉크_서브 },
  칩_현재: { backgroundColor: 색.바탕 },
  칩_고름: { backgroundColor: 색.바탕, borderColor: 색.잉크_서브 },
  칩글: { fontFamily: 폰트.캡션, fontSize: 12, lineHeight: 18, color: 색.잉크_태그 },

  칸이름: { fontFamily: 폰트.강조, fontSize: 12, lineHeight: 20, color: 색.잉크_메타 },
  입력: { ...입력바탕, fontFamily: 폰트.본문, fontSize: 16, lineHeight: 24 },
  /* 🔴 `입력` 과 **합치지 않는다**(`[s.입력, s.해설입력]` 로 겹치지 않는다) — 킷 폰트를
     지우려면 `fontFamily: undefined` 를 얹어야 하는데 그 지우기는 판마다 다르게 접힌다.
     키릴 자형이 SUIT 에 없어서, 한 판에서라도 안 지워지면 그 화면은 **두부(□□□)** 가 된다
     (`테마.몽골어` 머리말). 그래서 처음부터 fontFamily 가 없는 별개 스타일이다. */
  해설입력: { ...입력바탕, ...몽골어 },
  ai글: { flex: 1, fontFamily: 폰트.캡션, fontSize: 13, lineHeight: 20, color: 색.잉크_서브 },

  체크줄: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  체크: { fontFamily: 폰트.모노, fontSize: 14, color: 색.잉크_서브 },
  체크글: { fontFamily: 폰트.캡션, fontSize: 14, color: 색.잉크_서브 },

  /* 신호 1점 — 코랄 면 위 글자는 Ink Deep(색.바탕)만 허용이다(`테마.js`). */
  확정: {
    flex: 1, backgroundColor: 색.신호, borderRadius: 14, height: 50,
    alignItems: 'center', justifyContent: 'center',
  },
  확정글: { fontFamily: 폰트.강조, fontSize: 16, color: 색.바탕 },
  작은버튼: {
    borderWidth: 1, borderColor: 색.잉크_희미, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  작은버튼글: { fontFamily: 폰트.강조, fontSize: 13, color: 색.잉크_서브 },
  잠김: { opacity: 눌림층.잠김 },
  /* 잠긴 확정은 색을 빼고 밝기로 낮춘다(강사화면 저장 버튼과 같은 실물). 테두리 작은버튼의
     잠김(opacity)은 그대로다 — 면을 깔면 투명 바탕 버튼이 채워진 버튼으로 변한다. */
  확정_잠김: { backgroundColor: 색.잉크_희미 },
  눌림: { opacity: 눌림층.버튼 },

  폐기판: { gap: 8, borderTopWidth: 1, borderTopColor: 색.잉크_희미, paddingTop: 12 },

  메모: { fontFamily: 폰트.캡션, fontSize: 13, lineHeight: 20, color: 색.잉크_보조 },
  /* 코랄 금지(이 화면 신호 1점 = 확정 버튼) — 자리와 밀도로만 세운다. */
  오류: { fontFamily: 폰트.강조, fontSize: 14, lineHeight: 22, color: 색.잉크 },

  back: { paddingTop: 8 },
  /* 08-31 감사 D6-7 — 한글 문장에 모노 폰트(한글 글리프 0) 지정이 걸려 있었다. 나침반 무늬로 통일. */
  backText: { fontFamily: 폰트.강조, fontSize: 13, color: 색.잉크_서브 },
});
