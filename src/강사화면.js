'use strict';
/**
 * 강사 골든 판정 화면 — M2 §7-1 (N10·N11 의 입구).
 *
 * ■ 이 화면이 만드는 것 = **파인튜닝 쌍의 사람 라벨**
 *   주 5건 무작위 AI 교정에 강사가 판정 하나를 붙이면, 그것이 그대로 N12 성적표(모델·프롬프트
 *   승률)와 과교정률 계기판이 된다. 🔴 **라벨은 소급이 비싸다** — 지난 주 표본은 주 시드가
 *   갈려 다음 주에 다시 안 뜬다. 그래서 이 화면의 값은 「예쁨」이 아니라 **주 5건이 실제로
 *   끝나는가** 하나다(인수 조건 ⓐ = 강사 1명이 폰에서 5건을 판정할 수 있다).
 *
 * ■ 🔴 화면이 일을 만들지 않는다 (P0 §2-4 의 강사판)
 *   큐가 준 5건이 전부고, 다 끝나면 **「이번 주 끝」으로 닫는다.** 더 달라는 버튼을 두지
 *   않는다 — 표본은 서버가 주 단위로 정하고(`teach:229`), 더 볼 수 있게 하는 순간 강사가
 *   판정할 것을 「고르」게 되어 무작위가 깨진다(설계 §4 의 심장).
 *
 * ■ 🔴 검증 규칙의 **사본이 0개**다
 *   저장을 막는 판단을 여기 다시 적지 않는다 — 서버가 쓰는 `골든판정요청`(`lib/검수확정.js`)을
 *   화면이 **그대로 부른다**(`검수화면.js` 가 같은 lib 에서 `청취문턱` 을 끌어 쓰는 선례).
 *   그래서 화면이 내는 거절 문구는 서버가 낼 문구와 **글자까지 같다**. 두 곳에 적으면 갈리고,
 *   갈린 날 강사는 화면이 통과시킨 것을 서버가 400 으로 되받는 것을 본다.
 *   🔑 화면이 먼저 말하는 것은 게이트가 아니라 **왕복을 아끼는 것**이다 — 서버 검사는 그대로
 *      살아 있다(화면만 막으면 직접 호출로 통과한다 · `teach:391` 이 같은 판정을 다시 잰다).
 *
 * ■ 🔴 ①② 도 「고름 → 저장」 **두 탭**이다 — 설계 §7 의 「원클릭」과 갈린 자리
 *   골든 행은 append-only 고 같은 AI 행의 재판정은 `ALREADY_JUDGED` 로 거절된다
 *   (`teach:387`). 즉 **오탭 하나가 라벨을 영구히 오염시킨다.** 설계 §3 이 「도장찍기(전건 ②
 *   원클릭)는 막지 않고 먼저 센다」로 둔 자리인데, 원클릭은 도장찍기를 «더 쉽게» 만든다.
 *   두 탭은 게이트가 아니다(횟수·시간 상수 0) — 되돌릴 수 없는 쓰기 앞의 확인 한 번이다.
 *
 * ■ 🚫 재제안 금지
 *   · 「이번 주 더 보기」·주 고르기 — 위 §4.
 *   · 막힌 카드를 숨기기 — 숨기면 「이번 주 끝」이 거짓이 된다(설계 §4). 내용만 안 싣는다.
 *   · ①② 에서 고친 문장·태그를 화면이 **조용히 버리고** 보내기 — 강사 입력이 말없이 사라지고
 *     「저장됐다」가 돌아온다(`검수확정:262` 의 처방 그대로 — 거절해야 화면이 말할 수 있다).
 *   · `rubric_scores` 를 지어 넣기 — 축 어휘 정본이 0이다(`강사API` 머리말).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { 색, 폰트, 모노트래킹, 몽골어 } from './테마';
import { 큐받기, 판정하기 } from './강사API.js';
import { 오류태그 } from './검수API.js';
import { VERDICT, 텍스트내는판정, 골든판정요청 } from '../lib/검수확정.js';
import { use등장 } from '../lib/모션.js';
import 마스코트 from './마스코트.js';
import { 강사순간고르기 } from '../lib/마스코트강사말.js';
import { 마스코트기록읽기, 마스코트기록쓰기, 화면설정읽기, 화면설정쓰기 } from './저장.js';

/**
 * 큐 항목 상태 — 정본은 `functions/teach:75` 의 `상태` 다.
 * 🔑 없앨 수 없는 사본(서버가 이 어휘를 내주는 경로가 없다)이라 **기계에 물린다** —
 *   `tests/강사화면.test.js` 가 그 파일의 리터럴과 대조한다.
 */
export const 큐상태 = Object.freeze({ 열림: 'open', 판정됨: 'judged', 막힘: 'blocked' });

/**
 * 판정 세 값의 뜻 — 버튼 라벨은 `VERDICT` 그 자체다(사본 0).
 * 🔑 설명을 붙이는 이유: 「원문이 이미 맞다」는 **AI 가 괜히 고쳤다**는 뜻인데, 그 함의가
 *   라벨 문자열에 안 적혀 있다. 이 한 줄이 없으면 과교정률 계기판의 분자가 조용히 오염된다.
 */
const 판정설명 = Object.freeze([
  [VERDICT.원문, '학생 문장에 고칠 곳이 없었어요 — AI 가 괜히 고쳤습니다.'],
  [VERDICT.AI, 'AI 가 고친 것이 교육적으로 맞습니다.'],
  [VERDICT.수정, 'AI 교정이 틀렸거나 부족해요 — 선생님이 직접 고칩니다.'],
]);

/** 편집 칸의 빈 상태. 항목을 넘길 때마다 여기로 되돌린다(앞 항목의 글이 따라가면 안 된다). */
export function 편집초기값() {
  return { verdict: '', 고침: '', 사유: '', 태그: [], 출처: '' };
}

/**
 * 편집 상태 → 서버 요청.
 *
 * 🔴 **버리지 않는다.** ①② 를 골랐는데 편집기에 글이 남아 있으면 그 글을 그대로 싣는다 —
 *   지워서 보내면 강사 입력이 말없이 사라지고 「저장됐다」가 돌아온다(머리말 🚫 셋째).
 *   실린 채로 가면 `골든판정요청` 이 그 자리에서 거절하고, 화면은 **무엇 때문에 못 가는지**
 *   말할 수 있다. 즉 이 함수의 정직함이 곧 오류 메시지의 재료다.
 * 🔑 빈 문자열은 `null` 로 접는다 — 서버 검증기가 「빈 사유」와 「사유 없음」을 같게 보므로
 *   (`검수확정:332`), 여기서 모양을 맞춰 두면 저장된 행에 빈 문자열이 안 남는다.
 */
export function 보낼것({ 항목, verdict, 고침, 사유, 태그, 출처 }) {
  const 다듬 = (v) => (typeof v === 'string' ? v.trim() : '');
  return {
    reviewed_correction_id: 항목 ? 항목.correction_id : '',
    verdict: 다듬(verdict),
    corrected_text: 다듬(고침) === '' ? null : 다듬(고침),
    error_tags: Array.isArray(태그) ? 태그 : [],
    verdict_reason: 다듬(사유) === '' ? null : 다듬(사유),
    l1_source_phrase: 다듬(출처) === '' ? null : 다듬(출처),
  };
}

/**
 * 저장을 막는 이유 — **서버 검증기 그 자체**가 답한다(사본 0 · 머리말 🔴 둘째).
 * @returns {string|null} 문구가 있으면 저장 잠금
 */
export function 막는이유(요청) {
  if (!요청 || !요청.verdict) return '판정을 하나 골라 주세요';
  return 골든판정요청(요청).이유 ?? null;
}

/**
 * 다음에 판정할 항목 — **열린 것만** 고른다.
 * 🔑 막힘·판정됨을 건너뛰되 목록에서 지우지는 않는다(진행 줄이 그대로 센다).
 */
export function 다음열림(목록, 건너뛸id) {
  const 것들 = Array.isArray(목록) ? 목록 : [];
  return 것들.find((it) => it && it.status === 큐상태.열림
    && String(it.correction_id) !== String(건너뛸id ?? '')) ?? null;
}

/**
 * 진행 셈 — 「이번 주 끝」이 언제 참인지는 이 함수 하나가 정한다.
 * 🔴 막힘을 **분모에서 빼지 않는다** — 빼면 「5건 중 4건」이 「4건 중 4건」이 되어 강사는
 *   막힌 한 건이 있었다는 사실 자체를 모른 채 주를 닫는다(설계 §4 「숨기면 거짓이 된다」).
 */
export function 진행(목록) {
  const 것들 = Array.isArray(목록) ? 목록 : [];
  const 셈 = (s) => 것들.filter((it) => it && it.status === s).length;
  return {
    전체: 것들.length,
    남음: 셈(큐상태.열림),
    판정됨: 셈(큐상태.판정됨),
    막힘: 셈(큐상태.막힘),
  };
}

/** 기기 시계의 오늘 — UTC 가 아니라 현지 날짜다(몽골 UTC+8 · toISOString 은 하루가 밀린다). */
function 날짜줄(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function 강사화면({ 토큰, 돌아가기 }) {
  const [주, set주] = useState('');
  const [표본크기, set표본크기] = useState(0);
  const [풀크기, set풀크기] = useState(0);
  const [목록, set목록] = useState([]);
  const [불러오는중, set불러오는중] = useState(true);
  const [오류, set오류] = useState('');
  const [재조회, set재조회] = useState(0);

  const [지금id, set지금id] = useState(null);
  const [편집, set편집] = useState(편집초기값);
  const [기준펼침, set기준펼침] = useState(true);
  const [태그펼침, set태그펼침] = useState(false);
  const [출처펼침, set출처펼침] = useState(false);
  const [보내는중, set보내는중] = useState(false);
  const [끝낸수, set끝낸수] = useState(0);
  const [캐릭터말, set캐릭터말] = useState(null);
  const 말림참조 = useRef(null);

  /* 접힘 취향은 기기에 남는다 — 처음 온 사람에겐 펼침(기본), 접은 사람에겐 접힘(감사 D8-13). */
  useEffect(() => {
    let 살아있음 = true;
    화면설정읽기().then((p) => { if (살아있음 && p && p.강사기준접힘) set기준펼침(false); });
    return () => { 살아있음 = false; };
  }, []);

  /* 마스코트 발화 시도 — 판정(어느 줄·상한)은 lib 이 전부 지고, 여기는 신호 조립과 표시뿐이다
     (말할순간 §1-1 「표 밖 발화 금지」의 기계 자리 — 이 화면에는 문구가 한 글자도 없다).
     실패는 조용히 접는다: 마스코트 때문에 판정 화면이 죽는 것이 최악이다(보조 원칙 ③). */
  const 말시도 = useCallback(async (계기, 셈값, 목록값, 주값) => {
    try {
      const 기록 = await 마스코트기록읽기();
      const 지금 = new Date();
      const 고른 = 강사순간고르기(계기, {
        셈: 셈값,
        주: 주값,
        요일: ((지금.getDay() + 6) % 7) + 1,
        오늘: 날짜줄(지금),
        막힌카드: (목록값 || [])
          .filter((it) => it && it.status === 큐상태.막힘)
          .map((it) => String(it.correction_id)),
      }, 기록);
      if (!고른) return;
      await 마스코트기록쓰기({ ...기록, [고른.키]: 날짜줄(지금) });
      set캐릭터말({ 글: 고른.풀[Math.floor(Math.random() * 고른.풀.length)], 때: Date.now() });
    } catch { /* 침묵 — 틀린 말도 오류 화면도 아니고 그날 말이 없는 것이다 */ }
  }, []);

  /* 🔑 **한 번만 읽는다.** 조회 한 번이 감사 1행이고(`teach:241`) 그 장부는 조회 횟수의
     분모다 — 화면이 되풀이하면 분모가 조용히 달라진다(`검수API` 머리말과 같은 규칙).
     표본은 주 단위로 불변이라 다시 읽을 이유도 없다. */
  useEffect(() => {
    let 살아있음 = true;
    (async () => {
      try {
        const r = await 큐받기(토큰);
        if (!살아있음) return;
        set주(r.주); set표본크기(r.표본크기); set풀크기(r.풀크기); set목록(r.목록);
        const 첫 = 다음열림(r.목록, null);
        set지금id(첫 ? 첫.correction_id : null);
        await 말시도('열림', 진행(r.목록), r.목록, r.주);
      } catch (e) {
        if (살아있음) set오류(문구(e));
      } finally {
        if (살아있음) set불러오는중(false);
      }
    })();
    return () => { 살아있음 = false; };
  }, [토큰, 재조회]);

  /* 다음 항목은 화면 꼭대기에서 시작한다 — 앞 카드의 스크롤 위치를 안 물려받는다. */
  useEffect(() => {
    if (말림참조.current) 말림참조.current.scrollTo({ y: 0, animated: true });
  }, [지금id]);

  const 항목 = useMemo(
    () => 목록.find((it) => String(it.correction_id) === String(지금id)) ?? null,
    [목록, 지금id],
  );
  const 셈 = useMemo(() => 진행(목록), [목록]);

  const 요청 = useMemo(() => 보낼것({ 항목, ...편집 }), [항목, 편집]);
  const 막힘문구 = useMemo(() => (항목 ? 막는이유(요청) : null), [항목, 요청]);
  const 고침갈래 = 편집.verdict === 텍스트내는판정;

  const 태그토글 = useCallback((t) => {
    set편집((v) => ({
      ...v,
      태그: v.태그.includes(t) ? v.태그.filter((x) => x !== t) : [...v.태그, t],
    }));
  }, []);

  const 저장 = useCallback(async () => {
    if (!항목 || 보내는중 || 막힘문구) return;
    set보내는중(true); set오류('');
    try {
      await 판정하기(토큰, 요청);
      /* 🔑 서버가 200 을 준 **뒤에만** 상태를 바꾼다 — 낙관적 반영은 되돌릴 수 없는 쓰기에
         대한 거짓말이 된다(`ALREADY_JUDGED` 로 재판정도 안 된다). */
      const 갱신목록 = 목록.map((it) => (String(it.correction_id) === String(항목.correction_id)
        ? { ...it, status: 큐상태.판정됨 } : it));
      set목록(갱신목록);
      set끝낸수((n) => n + 1);
      const 다음 = 다음열림(목록, 항목.correction_id);
      set지금id(다음 ? 다음.correction_id : null);
      set편집(편집초기값()); set태그펼침(false); set출처펼침(false);
      // T3 — 「전부 완료한 순간」은 여기뿐이다(다시 연 화면은 「이번 주 끝」 카드가 말한다).
      const 셈뒤 = 진행(갱신목록);
      if (셈뒤.남음 === 0) await 말시도('완료', 셈뒤, 갱신목록, 주);
    } catch (e) {
      set오류(문구(e));
    } finally {
      set보내는중(false);
    }
  }, [항목, 보내는중, 막힘문구, 토큰, 요청, 목록]);

  return (
    <View style={s.wrap}>
    <ScrollView ref={말림참조} style={s.말림} contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
      <Text style={s.label}>TEACH</Text>
      <Text style={s.머리}>이번 주 AI 교정 채점</Text>

      {/* 진행 1줄 — 「소모」가 아니라 「기여」로 보이는 자리(검수 화면 ④ 선례).
          🔑 남은 건수를 **상시** 표시한다(설계 §7) · 분모는 서버 상수라 손으로 안 적는다. */}
      <Text style={s.요약}>
        {주 ? `${주} · ` : ''}남은 {셈.남음} / 표본 {표본크기 || 셈.전체}
        {끝낸수 > 0 ? ` · 오늘 판정 ${끝낸수}` : ''}
      </Text>

      {/* ① 기준 카드 — 세 값의 «뜻». 접이식(검수 화면과 같은 자리) */}
      <Pressable
        onPress={() => set기준펼침((v) => {
          const 다음 = !v;
          화면설정읽기().then((p) => 화면설정쓰기({ ...(p || {}), 강사기준접힘: !다음 })).catch(() => {});
          return 다음;
        })}
        hitSlop={{ top: 10, bottom: 10 }}
        style={{ alignSelf: 'stretch' }}
      >
        <Text style={s.접이머리}>{기준펼침 ? '▾' : '▸'} 판정 기준</Text>
      </Pressable>
      {기준펼침 && (
        <View style={s.카드}>
          {판정설명.map(([이름, 설명]) => (
            <View key={이름} style={s.기준줄}>
              <Text style={s.기준이름}>{이름}</Text>
              <Text style={s.기준글}>{설명}</Text>
            </View>
          ))}
          <Text style={s.기준글}>
            무작위로 뽑힌 5건이에요 — 「틀린 것만」 모으면 채점표가 반쪽이 됩니다.
            {'\n'}동의도 답이고 수정도 답이에요.
          </Text>
        </View>
      )}

      {불러오는중 && <Text style={s.메모}>이번 주 표본을 읽는 중이에요…</Text>}

      {/* 🔴 「표본이 0」과 「풀이 0」을 가른다 — 안 가르면 강사는 시스템 고장으로 읽는다.
          조회가 죽은 날(오류)은 이 카드를 안 세운다 — 「판정할 것이 없어요」가 거짓이 된다(감사 D7-9). */}
      {!불러오는중 && !오류 && 셈.전체 === 0 && (
        <View style={s.카드}>
          <Text style={s.빈머리}>이번 주는 판정할 것이 없어요</Text>
          <Text style={s.메모}>
            {풀크기 === 0
              ? '지난 주에 만들어진 AI 교정이 아직 없어요. AI 교정이 도는 날부터 표본이 생깁니다.'
              : `지난 주 교정 ${풀크기}건 중에서 뽑지 못했어요 — 잠시 뒤 다시 열어 주세요.`}
          </Text>
        </View>
      )}

      {/* 다 끝난 주 — 화면이 일을 만들지 않는다(더 달라는 버튼 없음) */}
      {!불러오는중 && 셈.전체 > 0 && !항목 && (
        <View style={s.카드}>
          <Text style={s.빈머리}>이번 주 끝</Text>
          <Text style={s.메모}>
            판정 {셈.판정됨}건{셈.막힘 > 0 ? ` · 막힘 ${셈.막힘}건` : ''} / 표본 {셈.전체}건
            {셈.막힘 > 0
              ? '\n막힌 건은 학생이 동의를 거둬 판정할 수 없어요 — 그대로 두는 것이 맞습니다.'
              : ''}
            {'\n'}다음 표본은 다음 주에 열려요.
          </Text>
        </View>
      )}

      {항목 && (
        <등장카드 key={String(지금id)} style={s.카드}>
          {/* 🔑 무엇을 보고 판정했는지가 라벨의 값이라, 전사가 «확정»인지 «기계»인지 먼저 말한다.
              기계 전사는 Whisper 가 오발음을 정타로 고쳐 들었을 수 있다(설계 §5). */}
          <Text style={s.메타}>
            {항목.transcript_confirmed ? '검수로 확정한 「들린 대로」' : '기계가 받아 적은 것 — 검수 전이에요'}
          </Text>

          <View style={s.칸}>
            <Text style={s.칸이름}>학생이 말한 문장</Text>
            <Text style={s.문장}>{항목.transcript || '(전사가 비어 있어요)'}</Text>
          </View>

          <View style={s.칸}>
            <Text style={s.칸이름}>AI 교정</Text>
            <Text style={s.문장}>{항목.ai_corrected_text || '(교정문이 비어 있어요)'}</Text>
          </View>

          {Array.isArray(항목.ai_error_tags) && 항목.ai_error_tags.length > 0 && (
            <View style={s.칩줄}>
              {항목.ai_error_tags.map((t) => (
                <View key={t} style={s.칩}><Text style={s.칩글}>{t}</Text></View>
              ))}
            </View>
          )}

          {/* 몽골어 해설 — 킷 폰트에 키릴 자형이 없어 별개 스타일이다(`검수화면:691` 머리말). */}
          {항목.ai_explanation ? (
            <View style={s.칸}>
              <Text style={s.칸이름}>AI 해설 (학생이 보는 말)</Text>
              <Text style={s.해설}>{항목.ai_explanation}</Text>
            </View>
          ) : null}

          {/* ② 판정 — 고르면 «고른 상태»가 되고, 저장은 아래 버튼이 진다(머리말 🔴 셋째) */}
          <View style={s.칩줄}>
            {판정설명.map(([이름]) => {
              const 고름 = 편집.verdict === 이름;
              return (
                <Pressable
                  key={이름}
                  onPress={() => set편집((v) => ({ ...v, verdict: 고름 ? '' : 이름 }))}
                  hitSlop={{ top: 4, bottom: 4 }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: 고름 }}
                  style={({ pressed }) => [s.판정칩, 고름 && s.판정칩_고름, pressed && s.눌림]}
                >
                  <Text style={[s.판정칩글, 고름 && s.판정칩글_고름]}>{이름}</Text>
                </Pressable>
              );
            })}
          </View>

          {고침갈래 && (
            <>
              <View style={s.칸}>
                <Text style={s.칸이름}>고친 문장</Text>
                <TextInput
                  style={s.입력}
                  value={편집.고침}
                  onChangeText={(t) => set편집((v) => ({ ...v, 고침: t }))}
                  multiline
                  placeholder="선생님이 고친 문장"
                  placeholderTextColor={색.잉크_메타}
                />
              </View>

              {/* 🔴 ③ 의 사유만 필수다 — 「왜 틀렸나」가 곧 라벨의 값이라, 빈 채로 받으면
                  라벨이 반쪽이다(`검수확정:305`). 서버가 같은 자리에서 거절한다. */}
              <View style={s.칸}>
                <Text style={s.칸이름}>왜 고쳤나요 (필수)</Text>
                <TextInput
                  style={s.입력}
                  value={편집.사유}
                  onChangeText={(t) => set편집((v) => ({ ...v, 사유: t }))}
                  multiline
                  placeholder="AI 교정의 무엇이 틀렸는지"
                  placeholderTextColor={색.잉크_메타}
                />
              </View>

              <Pressable
                onPress={() => set태그펼침((v) => !v)}
                hitSlop={{ top: 10, bottom: 10 }}
                style={{ alignSelf: 'stretch' }}
              >
                <Text style={s.접이머리}>
                  {태그펼침 ? '▾' : '▸'} 오류 태그
                  {편집.태그.length > 0 ? ` (${편집.태그.length})` : ''}
                </Text>
              </Pressable>
              {태그펼침 && (
                <View style={s.칩줄}>
                  {오류태그.map((t) => {
                    const 고름 = 편집.태그.includes(t);
                    return (
                      <Pressable
                        key={t}
                        onPress={() => 태그토글(t)}
                        style={({ pressed }) => [s.칩, 고름 && s.칩_고름, pressed && s.눌림]}
                      >
                        <Text style={s.칩글}>{t}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {/* 모국어 출처 — 선택. 기본은 접는다: 주 5건이 끝나는 것이 이 화면의 값이라
                  필수가 아닌 칸이 흐름 위에 서면 안 된다. */}
              <Pressable
                onPress={() => set출처펼침((v) => !v)}
                hitSlop={{ top: 10, bottom: 10 }}
                style={{ alignSelf: 'stretch' }}
              >
                <Text style={s.접이머리}>{출처펼침 ? '▾' : '▸'} 몽골어에서 온 표현 (선택)</Text>
              </Pressable>
              {출처펼침 && (
                <TextInput
                  style={s.해설입력}
                  value={편집.출처}
                  onChangeText={(t) => set편집((v) => ({ ...v, 출처: t }))}
                  multiline
                  placeholder="학생이 옮기려 한 몽골어 표현"
                  placeholderTextColor={색.잉크_메타}
                />
              )}
            </>
          )}

          {/* 🔑 막는 문구는 **서버 검증기가 낸 그 문장**이다(사본 0). */}
          {막힘문구 && <Text style={s.막힘글}>{막힘문구}</Text>}

          <Pressable
            onPress={저장}
            disabled={!!막힘문구 || 보내는중}
            style={({ pressed }) => [
              s.저장, !!막힘문구 && s.잠김, pressed && s.눌림,
            ]}
          >
            <Text style={s.저장글}>{보내는중 ? '저장하는 중…' : '판정 저장'}</Text>
          </Pressable>

          {오류 ? <Text style={s.오류글}>{오류}</Text> : null}
        </등장카드>
      )}

      {!항목 && 오류 ? <Text style={s.오류글}>{오류}</Text> : null}

      {/* 첫 조회가 죽은 날의 손잡이 — NETWORK 실패는 서버에 안 닿은 갈래라 「조회 한 번 =
          감사 1행」(첫 조회 효과 머리말)의 분모를 안 흐린다(감사 D7-9). */}
      {오류 && 목록.length === 0 && !불러오는중 ? (
        <Pressable
          onPress={() => { set오류(''); set불러오는중(true); set재조회((n) => n + 1); }}
          hitSlop={6}
          style={({ pressed }) => [s.back, pressed && { opacity: 0.7 }]}
        >
          <Text style={s.backText}>다시 불러오기</Text>
        </Pressable>
      ) : null}

      <Pressable onPress={돌아가기} style={({ pressed }) => [s.back, pressed && { opacity: 0.7 }]}>
        <Text style={s.backText}>← 돌아가기</Text>
      </Pressable>
    </ScrollView>
    {/* 마스코트 — 스크롤 밖 고정(비서는 화면에 산다). 잡담 잠금: 강사판 표에 idle 줄이 없다.
        발화는 전부 말시도(lib 판정)를 지난 것뿐 — 여기는 자리만 정한다(머리 위 빈 띠). */}
    <마스코트 잡담={false} 말건네기={캐릭터말} 자리={s.마스코트자리} />
    </View>
  );
}

/** 항목 카드의 등장 한 박자 — key 재마운트와 맞물려 항목마다 새로 선다(`lib/모션.js`). */
function 등장카드({ style, children }) {
  const 등장 = use등장();
  return <Animated.View style={[style, 등장]}>{children}</Animated.View>;
}

/** 오류를 강사 말로. 코드가 없으면 메시지를 그대로 낸다(지어내지 않는다). */
function 문구(e) {
  const 코드 = e && e.code;
  if (코드 === 'NOT_STAFF') return '이 계정에는 강사 권한이 없어요.';
  if (코드 === 'ALREADY_JUDGED') return '이미 판정한 항목이에요.';
  if (코드 === 'NOT_IN_SAMPLE') return '이번 주 표본에 없는 항목이에요 — 화면을 다시 열어 주세요.';
  if (코드 === 'NOT_FOUND') return '평가할 AI 교정을 찾을 수 없어요.';
  if (코드 === 'CONSENT_MISSING') return '이 학생의 동의가 유효하지 않아 판정할 수 없어요.';
  return String((e && e.message) || e || '잠시 뒤 다시 해주세요');
}

/** 입력 칸의 공통 면 — 글꼴만 다르다(한국어는 킷, 몽골어는 시스템 · `검수화면:651` 과 같다). */
const 입력바탕 = {
  color: 색.잉크, backgroundColor: 색.바탕, borderRadius: 12, padding: 12, minHeight: 56,
};

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: 색.바탕 },
  말림: { flex: 1 },
  /* 머리글 위 빈 띠(paddingTop 76) 안 — 내용과 안 겹치고, 스크롤해도 제자리다. */
  마스코트자리: { top: 10, right: 16 },
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
  메모: { fontFamily: 폰트.캡션, fontSize: 13, lineHeight: 20, color: 색.잉크_서브 },
  메타: { fontFamily: 폰트.캡션, fontSize: 12, lineHeight: 19, color: 색.잉크_메타 },

  칸: { gap: 6 },
  칸이름: { fontFamily: 폰트.강조, fontSize: 12, lineHeight: 20, color: 색.잉크_메타 },
  문장: { fontFamily: 폰트.본문, fontSize: 16, lineHeight: 25, color: 색.잉크 },
  해설: { ...몽골어, color: 색.잉크_서브 },

  칩줄: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  칩: {
    borderWidth: 1, borderColor: 색.잉크_희미, borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  칩_고름: { backgroundColor: 색.바탕, borderColor: 색.잉크_서브 },
  칩글: { fontFamily: 폰트.캡션, fontSize: 12, lineHeight: 18, color: 색.잉크_태그 },

  /* 판정 칩은 오류 태그 칩보다 한 층 크다 — 이 화면에서 손이 가장 자주 닿는 자리다. */
  판정칩: {
    borderWidth: 1, borderColor: 색.잉크_희미, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  판정칩_고름: { backgroundColor: 색.바탕, borderColor: 색.잉크 },
  판정칩글: { fontFamily: 폰트.본문, fontSize: 14, lineHeight: 20, color: 색.잉크_서브 },
  판정칩글_고름: { fontFamily: 폰트.강조, color: 색.잉크 },

  입력: { ...입력바탕, fontFamily: 폰트.본문, fontSize: 16, lineHeight: 24 },
  /* 🔴 `입력` 과 합치지 않는다 — 킷 폰트를 지우는 방식이 판마다 다르게 접혀, 한 판에서라도
     안 지워지면 키릴이 두부(□□□)가 된다(`검수화면:691` 과 같은 이유). */
  해설입력: { ...입력바탕, ...몽골어 },

  막힘글: { fontFamily: 폰트.캡션, fontSize: 13, lineHeight: 20, color: 색.잉크_메타 },
  /* 코랄 금지(이 화면 신호 1점 = 저장 버튼) — 자리와 밀도로만 세운다. */
  오류글: { fontFamily: 폰트.강조, fontSize: 14, lineHeight: 22, color: 색.잉크 },

  /* 이 화면의 신호 1점 = 저장 버튼(`테마.신호자리` 규칙). 잠기면 색을 빼고 밝기로 낮춘다. */
  저장: {
    backgroundColor: 색.신호, borderRadius: 14, paddingVertical: 14, alignItems: 'center',
  },
  저장글: { fontFamily: 폰트.강조, fontSize: 15, color: 색.바탕 },
  /* 잠김 = 미충족 전용. 진행 중(…는 중)은 disabled 만 걸고 면은 산 채로 둔다 —
     잠김꼴 위 글자는 2.3:1 이라 진행 문구가 안 읽힌다(감사 D6-3). */
  잠김: { backgroundColor: 색.잉크_희미 },
  눌림: { opacity: 0.7 },

  back: { marginTop: 8, alignSelf: 'flex-start' },
  backText: { fontFamily: 폰트.강조, fontSize: 13, color: 색.잉크_서브 },
});
