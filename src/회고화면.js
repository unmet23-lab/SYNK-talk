'use strict';
/**
 * 시즌 회고 화면 — 왼쪽(학생이 선언한 것)과 오른쪽(실기록)을 나란히 놓고, **사람이 부호를 찍는** 자리.
 * 정본 = appsscript `docs/시즌회고_설계.md` v3 §3-2·§4·§6·§7.
 *
 * ■ 이 화면의 값은 「보기 좋음」이 아니라 **라벨이 실제로 남는가** 하나다
 *   성향 8축은 「지금 어떤가」만 알고 **부호(sign)를 모른다** — 「그게 이 학생에게 좋은
 *   방향이었나」를 아는 것은 사람뿐이고, 사람이 그걸 말하는 자리는 여기 하나다(설계 §7).
 *   🔴 그래서 이 화면이 밀리면 그 시즌의 라벨은 **0**이고, 라벨 0인 시즌은 엔진에서
 *      존재하지 않는 것과 같다.
 *
 * ■ 🔴 순서가 규격이다 — **학생 먼저, 강사 다음** (설계 §7 도전안 · ✅유호님 채택 08-12)
 *   강사 판정을 보고 학생이 고르면 그 칸은 대조군이 아니라 **메아리**다. 그래서 이 화면은
 *   학생 칸이 «서버에 저장된 뒤»에만 강사 칸을 연다(낙관적으로 먼저 열지 않는다).
 *   🔑 학생이 안 눌러도 강사 판정은 진행된다 — 「학생 없이 진행」이 그 통로다. 그때
 *      `verdict_by_self` 는 `null` 로 남고, 그건 「눌렀는데 강사와 같다」와 **다른 값**이다.
 *
 * ■ 🔴 오른쪽은 **굳힌 것**이지 지금 조회한 것이 아니다 (설계 §4)
 *   화면은 숫자를 스스로 계산하지 않고, 서버가 회고를 연 순간 굳힌 `record_snapshot` 을
 *   그대로 그린다. 다시 열어도 같은 숫자가 뜨는 것이 이 화면의 계약이다 —
 *   판정과 근거가 갈리면 판정이 근거를 잃는다.
 *   🔑 전·후반을 나란히 놓는 이유: 강사가 「가까워졌다」를 고르는 근거는 「값이 높다」가 아니라
 *      **「올라갔다」**여야 하고, 한 숫자로는 그 문장을 만들 수 없다.
 *
 * ■ 🔴 어휘 사본이 **0개**다
 *   판정 3갈래·그 문구·사유 글자수 상한·나침반 문항 문구까지 전부 **서버가 준다**.
 *   화면이 손으로 적으면 몽골어 검수가 서는 날 화면만 낡는다(`나침반화면` 과 같은 규칙).
 *   🔑 몽골어가 비면 한국어를 그린다(지어 넣지 않는다).
 *
 * 🚫 재제안 금지
 *   · 8축을 화면에서 실시간 조회하기 — 창이 밀려 판정이 근거를 잃는다(설계 §10).
 *   · 판정 눈금 5단계·점수화 — 강사마다 다른 자를 쓰게 되고 라벨이 잡음이 된다.
 *   · 강사 화면에서 학생 칸을 대신 누르기 — 대조군이 그 자리에서 죽는다.
 *   · 앱이 시즌·회차 고르기 — 서버가 정한다(소급 판정이 열린다).
 */
import { useCallback, useMemo, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { 색, 폰트, 모노트래킹, 몽골어폰트, 눌림감 } from './테마';
import { 열기, 자기판정하기, 판정하기 } from './회고API.js';
import { use등장 } from '../lib/모션.js';

/** 굳힌 축 한 층에서 「축 이름 → 칸 → 값」을 뽑는다. **축 이름·칸 이름을 여기 안 적는다** —
 *  적는 순간 `학습자상태` 가 v7 로 오른 날 화면만 낡는다(굳힌 것을 그대로 훑는다). */
function 축칸들(전, 후) {
  const 축전 = (전 && 전.축) || {};
  const 축후 = (후 && 후.축) || {};
  const 이름들 = [...new Set([...Object.keys(축전), ...Object.keys(축후)])];
  return 이름들.map((축) => {
    const a = 축전[축] || {};
    const b = 축후[축] || {};
    const 칸들 = [...new Set([...Object.keys(a), ...Object.keys(b)])]
      /* 숫자·문자만 나란히 놓는다. 분포처럼 겹친 값은 한 줄로 못 그리고, 억지로 펴면
       * 화면이 그 구조를 «해석»하게 된다(그 해석이 곧 두 번째 정본이다). */
      .filter((칸) => ['number', 'string'].includes(typeof a[칸])
        || ['number', 'string'].includes(typeof b[칸]))
      .map((칸) => ({ 칸, 전: a[칸] ?? null, 후: b[칸] ?? null }));
    return { 축, 칸들 };
  }).filter((x) => x.칸들.length > 0);
}

const 값글 = (v) => (v == null ? '—' : String(v));

export default function 회고화면({ 토큰, 돌아가기 }) {
  const [학생번호입력, set학생번호입력] = useState('');
  const [세션, set세션] = useState(null);          // retro/open 이 준 것 한 벌
  const [자기고름, set자기고름] = useState(null);   // 학생이 화면에서 «고른» 값(아직 저장 전)
  const [자기저장됨, set자기저장됨] = useState(null); // 서버가 「적혔다」고 답한 값
  const [건너뜀, set건너뜀] = useState(false);
  const [강사고름, set강사고름] = useState(null);
  const [사유, set사유] = useState('');
  const [확정, set확정] = useState(null);
  const [오류, set오류] = useState(null);
  const [도는중, set도는중] = useState(false);

  const 여는중 = 도는중 && !세션;

  const 열기누름 = useCallback(async () => {
    const 번호 = 학생번호입력.trim();
    if (!번호) { set오류({ 말: '학생번호를 넣어 주세요', 운영: false }); return; }
    set도는중(true); set오류(null); set확정(null);
    try {
      const r = await 열기(토큰, 번호);
      set세션(r);
      /* 이어서 여는 자리 — 학생이 이미 눌렀으면 그 값을 서버에서 받아 강사 칸이 바로 열린다. */
      set자기고름(r.자기판정);
      set자기저장됨(r.자기판정);
      set건너뜀(false);
      set강사고름(null);
      set사유('');
    } catch (e) {
      set세션(null);
      /* 🔑 「회고할 시즌이 없다」는 **운영 안내**로 가른다 — 오류색으로 그리면 강사는 앱을
       *   의심하고, 그러면 그날의 회고가 통째로 밀린다(밀린 회고 = 라벨 0). */
      set오류({ 말: e?.message || '다시 여는 중이에요!', 운영: e?.code === 'RETRO_NOT_DUE' });
    } finally { set도는중(false); }
  }, [토큰, 학생번호입력]);

  const 자기제출 = useCallback(async () => {
    if (!세션 || !자기고름 || 도는중) return;
    set도는중(true); set오류(null);
    try {
      const r = await 자기판정하기(토큰, {
        학생id: 세션.학생id, 시즌id: 세션.시즌?.season_id, 판정: 자기고름,
      });
      /* 🔴 서버가 답한 값만 「적혔다」로 본다 — 낙관적으로 강사 칸을 열면 저장이 실패한 채
       *   강사가 판정해 버리고, 그 행의 대조군은 영영 null 이다. */
      set자기저장됨(r.자기판정);
    } catch (e) {
      set오류({ 말: e?.message || '판정을 다시 적어 볼게요!', 운영: e?.code === 'SELF_AFTER_JUDGE' });
    } finally { set도는중(false); }
  }, [토큰, 세션, 자기고름, 도는중]);

  const 확정누름 = useCallback(async () => {
    if (!세션 || !강사고름 || !사유.trim() || 도는중) return;
    set도는중(true); set오류(null);
    try {
      const r = await 판정하기(토큰, {
        학생id: 세션.학생id, 시즌id: 세션.시즌?.season_id, 판정: 강사고름, 사유: 사유.trim(),
      });
      set확정(r);
    } catch (e) {
      set오류({ 말: e?.message || '확정을 다시 해 볼게요!', 운영: e?.code === 'RETRO_NOT_OPENED' });
    } finally { set도는중(false); }
  }, [토큰, 세션, 강사고름, 사유, 도는중]);

  const 다음학생 = useCallback(() => {
    set세션(null); set자기고름(null); set자기저장됨(null); set건너뜀(false);
    set강사고름(null); set사유(''); set확정(null); set오류(null); set학생번호입력('');
  }, []);

  const 갈래 = 세션?.판정갈래 ?? [];
  const 강사칸열림 = Boolean(세션) && (자기저장됨 != null || 건너뜀);
  const 나침반 = 세션?.나침반 ?? null;
  const 굳힌것 = 세션?.굳힌것 ?? null;
  const 총계 = 굳힌것?.season_totals ?? null;
  const 축들 = useMemo(
    () => (굳힌것 ? 축칸들(굳힌것.axes_전반, 굳힌것.axes_후반) : []),
    [굳힌것],
  );
  /* 「갈렸나」가 이 그릇의 가장 값진 신호다(설계 §7) — 확정하는 그 자리에서 보여 준다. */
  const 갈림 = 확정 && 확정.자기판정 != null && 확정.자기판정 !== 확정.판정;
  /* 시즌을 연 날의 과녁 한 줄 — 화면은 문항키 사본 없이 «역할» 표식만 본다(어휘 사본 0 규칙).
     서버가 아직 표식을 안 주면 이 줄은 조용히 빠진다. */
  const 목표문항 = (나침반?.questions ?? []).find((q) => q.역할 === '목표');
  const 목표답 = 목표문항 ? (나침반.answers || {})[목표문항.키] : null;
  /**
   * 판정 갈래 하나를 글로. **부르는 자리가 한국어 문장 «안»이라** 그냥 문자열을 돌려주면
   * 그 조각만 몽골어여도 부모 Text 의 킷 한글 폰트로 그려진다 — 키릴은 글리프가 없어
   * 두부(□□□)가 되고, 그 줄은 「글자가 안 온 것」과 구별이 안 된다(`테마.몽골어` 머리말).
   * 🔑 Text 하나에 폰트는 하나뿐이라 **자리를 나눈다** — 중첩 Text 는 부모 스타일을 물려받고
   *   폰트만 덮는다. 그래서 부르는 자리는 한 글자도 안 바뀐다.
   * ⚠ 지금 `라벨_mn` 은 전부 null 이라 문자열이 그대로 나간다(오늘 화면은 어제와 같다).
   *   차는 날 이 함수가 알아서 감싼다.
   */
  const 문구 = (코드, 학생용, 굵기 = 몽골어폰트.본문) => {
    const o = 갈래.find((x) => x.코드 === 코드);
    if (!o) return 코드;
    const mn = 학생용 ? o.라벨_mn_학생 : o.라벨_mn;
    if (!mn) return 학생용 ? o.라벨_학생 : o.라벨;
    /* 굵기는 **부모 줄을 따라간다** — 캡션(400) 줄에 500 을 얹으면 그 조각만 굵어 보인다. */
    return <Text style={{ fontFamily: 굵기 }}>{mn}</Text>;
  };

  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
      <Text style={s.label}>SEASON REVIEW</Text>
      <Text style={s.머리}>시즌 회고</Text>

      {!세션 && (
        <View style={s.카드}>
          <Text style={s.요약}>학생번호를 넣고 열면 회고할 시즌이 뜹니다.</Text>
          {/* 🔑 어느 시즌을 여는지 **서버가 정한다**는 사실을 여기서 말한다 — 안 말하면
              강사는 「내가 고르는 화면이겠지」로 기대하고, 그 기대는 밀린 회고에서 깨진다. */}
          <Text style={s.메모}>
            밀린 회고가 있으면 가장 오래된 시즌부터 열립니다(건너뛸 수 없어요 — 건너뛴
            시즌은 기록이 영영 비어요).
          </Text>
          <TextInput
            style={s.입력}
            value={학생번호입력}
            onChangeText={set학생번호입력}
            placeholder="SYNK-001"
            placeholderTextColor={색.잉크_메타}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Pressable
            onPress={열기누름}
            disabled={도는중}
            style={({ pressed }) => [s.저장, pressed && s.눌림]}
          >
            <Text style={s.저장글}>{여는중 ? '여는 중…' : '열기'}</Text>
          </Pressable>
        </View>
      )}

      {세션 && (
        <View style={s.카드}>
          <Text style={s.메타}>
            {세션.학생번호 ?? ''}{세션.이름 ? ` · ${세션.이름}` : ''}
          </Text>
          {/* 시즌의 정본은 달력이 아니라 **교재**다(설계 §9-0 · 유호님 확정). */}
          <Text style={s.요약}>
            {세션.시즌?.code ?? ''} · 교재 「{세션.시즌?.textbook ?? ''}」
          </Text>
          <Text style={s.메모}>
            {세션.시즌?.starts_on ?? ''} ~ {세션.시즌?.ends_on ?? '진행 중'}
            {굳힌것?.구간?.시즌_진행중 ? ' (교재가 아직 진행 중이에요 — 오늘까지 기준으로 계산해요)' : ''}
          </Text>
        </View>
      )}

      {/* ── 왼쪽: 그 시즌 시작에 «학생이 스스로» 선언한 것 ── */}
      {나침반 && (
        <View style={s.카드}>
          <Text style={s.칸이름}>이번 시즌에 스스로 말한 것</Text>
          {(나침반.questions ?? []).map((q) => (
            <View key={q.키} style={s.칸}>
              <Text style={[s.메타, q.라벨_mn && { fontFamily: 몽골어폰트.캡션 }]}>
                {q.라벨_mn || q.라벨}
              </Text>
              <Text style={s.문장}>{(나침반.answers || {})[q.키] || '—'}</Text>
            </View>
          ))}
          {나침반.self_in_5y_changed === true && (
            <Text style={s.메모}>
              이 시즌을 열 때 5년 뒤의 나를 바꿨어요 — 「방향이 바뀌었다」의 직접 근거예요.
            </Text>
          )}
        </View>
      )}

      {/* ── 오른쪽: 굳힌 실기록(전반 → 후반) ── */}
      {굳힌것 && (
        <View style={s.카드}>
          <Text style={s.칸이름}>실제로 어땠나 — 시즌 앞 절반 → 뒤 절반</Text>
          <Text style={s.메모}>
            {굳힌것.추정판} · 회고를 연 {String(굳힌것.굳힌시각).slice(0, 16).replace('T', ' ')}
            에 굳힌 값이에요(다시 열어도 같은 숫자가 떠요).
          </Text>
          {총계 && (
            <Text style={s.문장}>
              제출 {총계.제출수}건 / 배정 {총계.배정수}건 · 교정 {총계.교정수}건 중{' '}
              {총계.열람수}건 열람{총계.교정열람률 == null ? '' : ` (${Math.round(총계.교정열람률 * 100)}%)`}
              {총계.급수_시작 || 총계.급수_끝
                ? ` · 급수 ${값글(총계.급수_시작)} → ${값글(총계.급수_끝)}` : ''}
            </Text>
          )}
          {축들.map(({ 축, 칸들 }) => (
            <View key={축} style={s.칸}>
              <Text style={s.메타}>{축}</Text>
              {칸들.map(({ 칸, 전, 후 }) => {
                const 오름 = typeof 전 === 'number' && typeof 후 === 'number' && 후 > 전;
                return (
                  <Text key={칸} style={[s.줄, 오름 && s.줄_오름]}>
                    {칸}  {값글(전)} → {값글(후)}
                  </Text>
                );
              })}
            </View>
          ))}
          {축들.length === 0 && (
            <Text style={s.메모}>이 시즌에 쌓인 기록이 없어요 — 숫자로는 판정할 재료가 없어요.</Text>
          )}
        </View>
      )}

      {/* ── 4. 학생 판정 — «먼저» ── */}
      {세션 && !확정 && (
        <View style={s.카드}>
          <Text style={s.칸이름}>학생에게 먼저 물어요</Text>
          <Text style={s.메모}>
            강사 칸은 이 답이 저장된 뒤에 열려요 — 먼저 보여 주면 학생이 강사 판정을
            따라 말하게 됩니다.
          </Text>
          <View style={s.칩줄}>
            {갈래.map((o) => (
              <Pressable
                key={o.코드}
                onPress={() => set자기고름(o.코드)}
                disabled={자기저장됨 != null || 건너뜀}
                accessibilityRole="button"
                accessibilityState={{ selected: 자기고름 === o.코드, disabled: 자기저장됨 != null || 건너뜀 }}
                style={({ pressed }) => [
                  s.판정칩, s.판정칩_학생, 자기고름 === o.코드 && s.판정칩_고름,
                  (자기저장됨 != null || 건너뜀) && s.칩잠김, pressed && s.눌림,
                ]}
              >
                {/* 🔴 폰트가 글자를 따라간다 — 키릴은 킷 한글 폰트에 글리프가 없어 두부가 된다.
                    지금은 `라벨_mn_학생` 이 전부 null 이라 증상이 없을 뿐이다(08-27 실측). */}
                <Text style={[
                  s.판정칩글, s.판정칩글_학생, 자기고름 === o.코드 && s.판정칩글_고름,
                  o.라벨_mn_학생 && { fontFamily: 자기고름 === o.코드 ? 몽골어폰트.강조 : 몽골어폰트.본문 },
                ]}>
                  {o.라벨_mn_학생 || o.라벨_학생}
                </Text>
              </Pressable>
            ))}
          </View>
          {자기저장됨 == null && !건너뜀 && (
            <>
              <Pressable
                onPress={자기제출}
                disabled={!자기고름 || 도는중}
                style={({ pressed }) => [s.저장, !자기고름 && s.잠김, pressed && s.눌림]}
              >
                <Text style={s.저장글}>{도는중 ? '적는 중…' : '학생 답 적기'}</Text>
              </Pressable>
              {/* 🔑 건너뛰기가 **있어야** 한다 — 학생 하나가 안 눌러 그 시즌 라벨이 통째로
                  안 생기는 것이 더 큰 손실이다(회고는 밀리는 순간 라벨 0). */}
              <Pressable onPress={() => set건너뜀(true)} hitSlop={6}>
                <Text style={s.보조글}>학생 없이 진행 (이 칸은 비워 둡니다)</Text>
              </Pressable>
            </>
          )}
          {자기저장됨 != null && <Text style={s.안내글}>학생 답이 적혔어요 — {문구(자기저장됨, true, 몽골어폰트.캡션)}</Text>}
          {건너뜀 && 자기저장됨 == null && (
            <Text style={s.안내글}>학생 칸을 비워 둡니다 — 「안 눌렀다」로 남아요.</Text>
          )}
        </View>
      )}

      {/* ── 5. 강사 판정 — 클릭 하나 + 한 줄 ── */}
      {강사칸열림 && !확정 && (
        <View style={s.카드}>
          <Text style={s.칸이름}>강사 판정</Text>
          <View style={s.칩줄}>
            {갈래.map((o) => (
              <Pressable
                key={o.코드}
                onPress={() => set강사고름(o.코드)}
                accessibilityRole="button"
                accessibilityState={{ selected: 강사고름 === o.코드 }}
                style={({ pressed }) => [s.판정칩, 강사고름 === o.코드 && s.판정칩_고름, pressed && s.눌림]}
              >
                <Text style={[
                  s.판정칩글, 강사고름 === o.코드 && s.판정칩글_고름,
                  o.라벨_mn && { fontFamily: 강사고름 === o.코드 ? 몽골어폰트.강조 : 몽골어폰트.본문 },
                ]}>
                  {o.라벨_mn || o.라벨}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={s.입력}
            value={사유}
            onChangeText={(t) => set사유(세션?.사유상한 ? t.slice(0, 세션.사유상한) : t)}
            placeholder="왜 그렇게 봤는지 한 줄"
            placeholderTextColor={색.잉크_메타}
          />
          {세션?.사유상한 == null && (
            <Text style={s.안내글}>사유 글자수 규칙을 서버가 안 보냈어요 — 잠시 뒤 다시 열어 주세요</Text>
          )}
          <Pressable
            onPress={확정누름}
            disabled={!강사고름 || !사유.trim() || 도는중 || 세션?.사유상한 == null}
            style={({ pressed }) => [
              s.저장, (!강사고름 || !사유.trim() || 세션?.사유상한 == null) && s.잠김, pressed && s.눌림,
            ]}
          >
            <Text style={s.저장글}>{도는중 ? '확정하는 중…' : '확정'}</Text>
          </Pressable>
        </View>
      )}

      {확정 && (
        <확정카드틀>
          <Text style={s.칸이름}>확정됐어요</Text>
          <Text style={s.문장}>강사 — {문구(확정.판정, false)}</Text>
          <Text style={s.문장}>
            학생 — {확정.자기판정 == null ? '(안 눌렀어요)' : 문구(확정.자기판정, true)}
          </Text>
          {목표답 ? <Text style={s.메모}>그때 스스로 말한 것 — “{목표답}”</Text> : null}
          {/* 🔑 갈린 행이 «가장 값진» 행이다 — 자기인식축의 유일한 대조군(설계 §7 도전안).
              그러니 「틀렸다」로 그리지 않는다: 두 사람이 다르게 본 것 자체가 재료다. */}
          {갈림 && (
            <갈림안내>
              둘이 다르게 봤어요 — 학생이 자신을 어떻게 보는지 알 수 있는 귀한 기록이라 그대로 남아요.
            </갈림안내>
          )}
          <Pressable onPress={다음학생} hitSlop={8}>
            <Text style={s.backText}>다음 학생 열기 →</Text>
          </Pressable>
        </확정카드틀>
      )}

      {오류 && <Text style={오류.운영 ? s.안내글 : s.오류글}>{오류.말}</Text>}

      <Pressable onPress={돌아가기} style={s.back} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Text style={s.backText}>← 돌아가기</Text>
      </Pressable>
    </ScrollView>
  );
}

/* 확정 카드·갈림 안내의 등장 틀 — 확정 응답이 «도착한 순간» 마운트된다. 서버 왕복 뒤 마운트라
   훅이 화면 최상위면 안 된다(나침반 적혔어요줄과 같은 이유). reduce-motion 은 use등장이 접는다. */
function 확정카드틀({ children }) {
  const 등장 = use등장({ 올라옴: 6, 시간: 260 });
  return <Animated.View style={[s.카드, 등장]}>{children}</Animated.View>;
}

function 갈림안내({ children }) {
  const 등장 = use등장({ 올라옴: 4, 시간: 220, 지연: 220 });
  return <Animated.Text style={[s.안내글, 등장]}>{children}</Animated.Text>;
}

const 입력바탕 = {
  backgroundColor: 색.바탕,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: 색.잉크_희미,
  color: 색.잉크,
  paddingHorizontal: 12,
  paddingVertical: 10,
  minHeight: 44,
};

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: 색.바탕 },
  inner: { padding: 20, paddingTop: 76, paddingBottom: 48, gap: 12 },

  label: { fontFamily: 폰트.모노, fontSize: 10, letterSpacing: 모노트래킹.라벨, color: 색.잉크_메타 },
  머리: { fontFamily: 폰트.헤드, fontSize: 26, lineHeight: 34, color: 색.잉크 },
  요약: { fontFamily: 폰트.강조, fontSize: 14, lineHeight: 22, color: 색.잉크_서브 },

  카드: { backgroundColor: 색.바탕띄움, borderRadius: 18, padding: 18, gap: 12 },
  칸: { gap: 6 },
  칸이름: { fontFamily: 폰트.강조, fontSize: 13, lineHeight: 21, color: 색.잉크 },
  문장: { fontFamily: 폰트.본문, fontSize: 16, lineHeight: 25, color: 색.잉크 },
  /* 전·후반 대조는 **자릿수가 맞아야** 「올라갔다」가 눈에 든다 — 모노가 그 일을 한다. */
  줄: { fontFamily: 폰트.모노, fontSize: 12, lineHeight: 20, color: 색.잉크_서브 },
  /* 오른 칸만 잉크 100% — 색을 더하지 않고 밀도로만(「어제의 나」 무늬 · 색 추가 0). */
  줄_오름: { color: 색.잉크 },
  메모: { fontFamily: 폰트.캡션, fontSize: 13, lineHeight: 20, color: 색.잉크_서브 },
  메타: { fontFamily: 폰트.캡션, fontSize: 12, lineHeight: 19, color: 색.잉크_메타 },

  입력: { ...입력바탕, fontFamily: 폰트.본문, fontSize: 16, lineHeight: 24 },

  칩줄: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  판정칩: {
    borderWidth: 1, borderColor: 색.잉크_희미, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  판정칩_고름: { backgroundColor: 색.바탕, borderColor: 색.잉크 },
  판정칩글: { fontFamily: 폰트.본문, fontSize: 14, lineHeight: 20, color: 색.잉크_서브 },
  판정칩글_고름: { fontFamily: 폰트.강조, color: 색.잉크 },
  /* 학생이 «직접» 누르는 칩은 강사 칩보다 한 층 크다 — 색·폰트 토큰 불변, 크기만. */
  판정칩_학생: { paddingHorizontal: 18, paddingVertical: 14, borderRadius: 16 },
  판정칩글_학생: { fontSize: 16, lineHeight: 24 },
  칩잠김: { opacity: 0.55 },

  안내글: { fontFamily: 폰트.캡션, fontSize: 13, lineHeight: 20, color: 색.잉크_메타 },
  /* 실패 ≥ 잉크_서브 · 운영 안내 = 잉크_메타 — 강사화면 자 · 감사 D6-4 */
  오류글: { fontFamily: 폰트.캡션, fontSize: 13, lineHeight: 20, color: 색.잉크_서브 },
  보조글: { fontFamily: 폰트.캡션, fontSize: 13, lineHeight: 20, color: 색.잉크_메타 },

  /* 이 화면의 신호 1점 = 진행 버튼(`테마.신호자리` 규칙). 잠기면 색을 빼고 밝기로 낮춘다. */
  저장: {
    backgroundColor: 색.신호, borderRadius: 14, paddingVertical: 14, alignItems: 'center',
  },
  저장글: { fontFamily: 폰트.강조, fontSize: 15, color: 색.바탕 },
  /* 잠김 = 미충족 전용. 진행 중(…는 중)은 disabled 만 걸고 면은 산 채로 둔다 —
     잠김꼴 위 글자는 2.3:1 이라 진행 문구가 안 읽힌다(감사 D6-3). */
  잠김: { backgroundColor: 색.잉크_희미 },
  눌림: { opacity: 눌림감.면 },

  back: { marginTop: 8, alignSelf: 'flex-start' },
  backText: { fontFamily: 폰트.강조, fontSize: 13, color: 색.잉크_서브 },
});
