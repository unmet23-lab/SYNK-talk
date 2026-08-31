'use strict';
/**
 * 교실 관찰 화면 — 학생 고르기 → 자유 한 줄 → AI 초안 → 강사 확정.
 * 정본 = appsscript `docs/관찰태그_자동화_설계.md` v1.1 §2·§3·§4 · 계약 c14 `observation.noted`.
 *
 * ■ 이 화면의 값은 「보기 좋음」이 아니라 **교실에서만 보이는 것이 엔진에 닿는가** 하나다
 *   앱은 발음·태도·듣기·위축을 원리상 못 본다. 그 관찰이 학습 재료가 되는 길은 이 화면뿐이고,
 *   없는 동안 교실 관찰은 라이브 구글 폼 → `student_errors` 로만 갔다 — 그 행들은 그 시점의
 *   동의판·급수 스냅샷을 **영원히 못 갖는다**(설계 §4 ③). 이 화면이 서는 만큼 그 창이 줄어든다.
 *
 * ■ 🔴 앱 축 데이터를 한 칸도 안 그린다 (설계 §2 ㉯ 기각의 화면 적용)
 *   학생의 첨삭 태그·퀴즈 오답·급수·진도를 **관찰 전에** 보여주면, 그 뒤 관찰은 새 정보가
 *   아니라 앱 사전확률의 **확증 표본**이 된다. 그러면 `source_kind='teacher'` 가 거짓이 되고
 *   교실 축이 앱 축의 복제가 된다. 로스터가 급수를 실어 오지만 **그리지 않는 것이 규격**이다.
 *   🚫 「맥락 표시」·「지난 관찰 보기」도 같은 칼에 잘린다(설계 §8 ⑥ — 초판의 자기모순이었다).
 *
 * ■ 🔴 초안은 사건이 아니다 (설계 §2)
 *   초안 왕복은 DB 를 안 건드리고, 확정 «전»에 이 화면을 떠나면 아무 데도 안 남는다. 그것이
 *   규격이다 — 관찰 원문은 강사가 재입력할 수 있는 것이라 그 소실을 감수한다. 그래서 화면도
 *   초안을 저장하지 않는다(임시 저장·복구를 붙이면 그 순간 초안이 사실상 사건이 된다).
 *
 * ■ 🔑 「비운 채 확정」이 정상 경로다 (설계 §3)
 *   AI 가 태그를 못 뽑아도, 키가 없어도, 벤더가 막혀도 강사는 그대로 확정할 수 있다. 초안
 *   실패를 오류로 그리지 않는 이유가 이것이다 — 「AI 가 막히면 교실 관찰도 막힌다」가 되면
 *   이 통로는 벤더 가동률만큼만 사는 통로가 된다.
 *
 * ■ 🔑 두 단추의 무게가 다르다 — 일부러 그렇다
 *   [초안 받기]는 **건너뛸 수 있는** 걸음이고 [관찰 남기기]가 이 화면의 동사다. 초안을 필수로
 *   만들면 벤더 왕복이 관찰의 전제가 되고, 위 §3 의 규격이 화면에서 뒤집힌다.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { 색, 폰트, 모노트래킹 } from './테마';
import { 로스터, 초안받기, 관찰보내기, 새멱등키 } from './관찰API.js';
import { 영역들, 태그들, 태그실리는영역, 원문상한, 태그상한 } from '../lib/관찰초안.js';

/** 초안 실패 사유 → 강사가 읽을 한 줄. 🔑 **오류가 아니라 안내**다(위 머리말 §3). */
function 초안안내(사유) {
  if (!사유) return null;
  if (사유 === '키없음') return '지금은 초안을 못 받아요 — 그대로 골라서 남기시면 됩니다.';
  if (사유 === '응답형식밖') return '초안을 못 읽었어요 — 그대로 골라서 남기시면 됩니다.';
  if (사유 === '예외') return '초안 받는 길이 막혔어요 — 그대로 골라서 남기시면 됩니다.';
  if (String(사유).startsWith('벤더:')) return '초안이 지금 안 와요 — 그대로 골라서 남기시면 됩니다.';
  return '초안 없이 남기셔도 됩니다.';
}

export default function 관찰화면({ 토큰, 돌아가기 }) {
  const [명단, set명단] = useState(null);      // observe/roster 한 벌
  const [학생, set학생] = useState(null);
  const [원문, set원문] = useState('');
  const [초안, set초안] = useState(null);       // 되싣기의 재료 — 사람이 고쳐도 «안» 바뀐다
  const [영역, set영역] = useState(null);
  const [태그, set태그] = useState([]);
  const [끝난것, set끝난것] = useState(null);
  const [오류, set오류] = useState(null);
  const [도는중, set도는중] = useState(false);
  /* 멱등키를 확정 «전»에 지어 들고 있는다 — 실패 뒤 다시 누를 때 새 키를 지으면 그 재시도가
   * 중복 행이 된다(관찰API 머리말). 학생을 바꾸면 그때 새로 짓는다. */
  const [멱등키, set멱등키] = useState(() => 새멱등키());

  const 첫조회 = useCallback(async () => {
    set오류(null);
    try { set명단(await 로스터(토큰)); }
    catch (e) { set오류(String(e?.message ?? e)); set명단([]); }
  }, [토큰]);
  useEffect(() => { 첫조회(); }, [첫조회]);

  /* 반별로 묶어 보여 준다 — 강사가 손에 든 것은 「반」이지 학생 목록 하나가 아니다.
   * 🔑 서버가 준 순서를 그대로 접는다(다시 정렬하지 않는다 · 반피드백 화면과 같은 규율). */
  const 반별 = useMemo(() => {
    const 통 = [];
    for (const r of 명단 ?? []) {
      const 마지막 = 통[통.length - 1];
      if (마지막 && 마지막.열쇠 === r.반열쇠) 마지막.학생들.push(r);
      else 통.push({ 열쇠: r.반열쇠, 이름: r.반이름, 학생들: [r] });
    }
    return 통;
  }, [명단]);

  const 태그가능 = 영역 ? 태그실리는영역.includes(영역) : false;

  function 학생고르기(r) {
    set학생(r); set원문(''); set초안(null); set영역(null); set태그([]);
    set끝난것(null); set오류(null); set멱등키(새멱등키());
  }

  async function 초안누름() {
    if (도는중 || !원문.trim()) return;
    set도는중(true); set오류(null);
    try {
      const d = await 초안받기(토큰, 원문);
      set초안(d);
      /* 초안을 **채워 넣되 잠그지 않는다** — 강사가 그대로 두면 무수정, 고치면 그것이 확정이다.
       * 🔑 되싣기용 `초안` 은 이 값들과 별개로 그대로 남는다(사람이 고친 값으로 덮으면 서버의
       *   `draft_modified` 가 언제나 「안 고쳤다」가 된다). */
      set영역(d.영역);
      set태그(d.태그);
    } catch (e) { set오류(String(e?.message ?? e)); }
    finally { set도는중(false); }
  }

  function 태그누름(t) {
    set태그((앞) => {
      if (앞.includes(t)) return 앞.filter((x) => x !== t);
      if (앞.length >= 태그상한) return 앞;        // 상한은 lib 이 정한다 — 여기서 숫자를 안 적는다
      return [...앞, t];
    });
  }

  function 영역누름(a) {
    set영역(a);
    /* 태그가 안 실리는 영역으로 옮기면 태그를 **비운다** — 안 비우면 서버가 400 으로 막고
     * 강사는 「왜 저장이 안 되지」만 본다(설계 §3: 발음·태도 관찰은 축이 다르다). */
    if (!태그실리는영역.includes(a)) set태그([]);
  }

  async function 남기기() {
    if (도는중 || !학생 || !영역 || !원문.trim()) return;
    set도는중(true); set오류(null);
    try {
      const r = await 관찰보내기(토큰, { 학생id: 학생.학생id, 영역, 태그, 원문, 초안, 멱등키 });
      set끝난것(r);
    } catch (e) { set오류(String(e?.message ?? e)); }
    finally { set도는중(false); }
  }

  const 남은글자 = 원문상한 - 원문.length;

  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.inner}>
      <Text style={s.label}>OBSERVE</Text>
      <Text style={s.머리}>교실 관찰</Text>

      {오류 ? <Text style={s.오류}>{오류}</Text> : null}

      {/* ── ① 학생 고르기 ─────────────────────────────────────────────── */}
      {!학생 ? (
        명단 === null ? (
          <Text style={s.메모}>명단을 여는 중…</Text>
        ) : 반별.length === 0 ? (
          /* 🔴 「내가 다 봤다」가 아니라 **배정 전**이다 — 두 상태를 같은 모양으로 그리면
             배정을 못 받은 강사가 자기가 일을 끝냈다고 읽는다(반피드백 화면과 같은 판정). */
          <View style={s.카드}>
            <Text style={s.문장}>배정된 반이 없어요.</Text>
            <Text style={s.메모}>원장님이 반을 배정하면 여기에 학생이 뜹니다.</Text>
          </View>
        ) : (
          반별.map((반) => (
            <View key={반.열쇠} style={s.카드}>
              <Text style={s.칸이름}>{반.이름 || 반.열쇠}</Text>
              <View style={s.칩줄}>
                {반.학생들.map((r) => (
                  <Pressable key={r.학생id} onPress={() => 학생고르기(r)}
                    style={({ pressed }) => [s.칩, pressed && s.칩_눌림]}>
                    <Text style={s.칩글}>{r.이름 || r.학번}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))
        )
      ) : 끝난것 ? (
        /* ── ④ 남았다 ──────────────────────────────────────────────── */
        <View style={s.카드}>
          <Text style={s.문장}>{학생.이름 || 학생.학번} — 관찰을 남겼어요.</Text>
          <Text style={s.메모}>
            {끝난것.영역}
            {끝난것.태그.length ? ` · ${끝난것.태그.join(' · ')}` : ''}
          </Text>
          {/* 🚫 「무수정 통과」를 강사에게 점수처럼 보여주지 않는다 — 그 칸은 감사 재료지
              강사가 맞춰야 할 지표가 아니다(설계 §2: 문턱 상수는 지금 0 · 먼저 센다). */}
          <Pressable onPress={() => 학생고르기(학생)} style={({ pressed }) => [s.단추, pressed && s.단추_눌림]}>
            <Text style={s.단추글}>이 학생에게 하나 더 남기기</Text>
          </Pressable>
          <Pressable onPress={() => set학생(null)} style={({ pressed }) => [s.연한단추, pressed && { opacity: 0.7 }]}>
            <Text style={s.연한단추글}>← 명단으로</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* ── ② 자유 한 줄 ────────────────────────────────────────── */}
          <View style={s.카드}>
            <Text style={s.칸이름}>{학생.이름 || 학생.학번}</Text>
            <Text style={s.메모}>오늘 교실에서 보신 것을 한 줄로 적어 주세요.</Text>
            <TextInput
              value={원문} onChangeText={set원문} multiline
              maxLength={원문상한}
              placeholder="예) 받침 ㄹ 발음이 오늘도 새어 나갔다"
              placeholderTextColor={색.잉크_메타}
              style={s.입력}
            />
            <Text style={s.줄}>{남은글자}</Text>

            <View style={s.칩줄}>
              <Pressable onPress={초안누름} disabled={도는중 || !원문.trim()}
                style={({ pressed }) => [s.연한단추, pressed && { opacity: 0.7 }, (도는중 || !원문.trim()) && s.흐림]}>
                <Text style={s.연한단추글}>{도는중 ? '…' : '초안 받기'}</Text>
              </Pressable>
            </View>
            {초안 ? (
              초안.사유 ? <Text style={s.메모}>{초안안내(초안.사유)}</Text>
                : <Text style={s.메모}>초안을 채웠어요 — 다르면 그냥 고치시면 됩니다.</Text>
            ) : null}
          </View>

          {/* ── ③ 확정 ─────────────────────────────────────────────── */}
          <View style={s.카드}>
            <Text style={s.칸이름}>어떤 갈래인가요?</Text>
            <View style={s.칩줄}>
              {영역들.map((a) => (
                <Pressable key={a} onPress={() => 영역누름(a)}
                  style={({ pressed }) => [s.칩, 영역 === a && s.칩_고름, pressed && s.칩_눌림]}>
                  <Text style={[s.칩글, 영역 === a && s.칩글_고름]}>{a}</Text>
                </Pressable>
              ))}
            </View>

            {/* 🔑 태그 칸은 **태그가 실리는 영역에서만** 뜬다 — 발음·태도 관찰에 24지선다를
                내밀면 그 관찰이 텍스트 교정 축으로 끌려간다(설계 §3). 안 뜨는 것이 규격이라
                「왜 없지」가 아니라 「여기엔 없다」가 읽히도록 한 줄로 말한다. */}
            {영역 ? (태그가능 ? (
              <>
                <Text style={s.칸이름}>어떤 오류였나요? <Text style={s.메모}>(없으면 비워 두세요)</Text></Text>
                <View style={s.칩줄}>
                  {태그들.map((t) => (
                    <Pressable key={t} onPress={() => 태그누름(t)}
                      style={({ pressed }) => [s.칩, 태그.includes(t) && s.칩_고름, pressed && s.칩_눌림]}>
                      <Text style={[s.칩글, 태그.includes(t) && s.칩글_고름]}>{t}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : (
              <Text style={s.메모}>{영역} 관찰에는 오류태그를 달지 않아요 — 적어 주신 문장이 그대로 남습니다.</Text>
            )) : null}

            <Pressable onPress={남기기} disabled={도는중 || !영역 || !원문.trim()}
              style={({ pressed }) => [s.단추, pressed && s.단추_눌림, (도는중 || !영역 || !원문.trim()) && s.흐림]}>
              <Text style={s.단추글}>{도는중 ? '남기는 중…' : '관찰 남기기'}</Text>
            </Pressable>
            <Pressable onPress={() => set학생(null)} style={({ pressed }) => [s.연한단추, pressed && { opacity: 0.7 }]}>
              <Text style={s.연한단추글}>← 명단으로</Text>
            </Pressable>
          </View>
        </>
      )}

      <Pressable onPress={돌아가기} style={({ pressed }) => [s.연한단추, pressed && { opacity: 0.7 }]}>
        <Text style={s.연한단추글}>← 시스템으로</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: 색.바탕 },
  inner: { padding: 20, paddingTop: 76, paddingBottom: 48, gap: 12 },

  label: { fontFamily: 폰트.모노, fontSize: 10, letterSpacing: 모노트래킹.라벨, color: 색.잉크_메타 },
  머리: { fontFamily: 폰트.헤드, fontSize: 26, lineHeight: 34, color: 색.잉크 },

  카드: { backgroundColor: 색.바탕띄움, borderRadius: 18, padding: 18, gap: 12 },
  칸이름: { fontFamily: 폰트.강조, fontSize: 13, lineHeight: 21, color: 색.잉크 },
  문장: { fontFamily: 폰트.본문, fontSize: 16, lineHeight: 25, color: 색.잉크 },
  메모: { fontFamily: 폰트.캡션, fontSize: 13, lineHeight: 20, color: 색.잉크_서브 },
  /* 남은 글자수 — 숫자 전용이라 모노다(한글 글리프가 없는 폰트라 문장에 쓰면 안 된다). */
  줄: { fontFamily: 폰트.모노, fontSize: 11, lineHeight: 18, color: 색.잉크_메타, textAlign: 'right' },
  오류: { fontFamily: 폰트.강조, fontSize: 13, lineHeight: 21, color: 색.신호_보조 },

  입력: {
    minHeight: 88, borderRadius: 12, padding: 12,
    backgroundColor: 색.바탕, color: 색.잉크,
    fontFamily: 폰트.본문, fontSize: 15, lineHeight: 24,
    textAlignVertical: 'top',
  },

  칩줄: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  칩: {
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999,
    borderWidth: 1, borderColor: 색.잉크_희미,
  },
  /* 고른 칩은 **면**으로 든다 — 신호(코랄)를 안 쓴다(이 앱에서 코랄은 「지금 녹음 중」이라
     여기 쓰면 그 뜻이 흐려진다 · `어제의나` 머리말과 같은 판정). */
  칩_고름: { backgroundColor: 색.실땀, borderColor: 색.실땀 },
  칩_눌림: { opacity: 0.7 },
  칩글: { fontFamily: 폰트.강조, fontSize: 13, lineHeight: 18, color: 색.잉크_서브 },
  칩글_고름: { color: 색.바탕 },

  단추: {
    marginTop: 4, paddingVertical: 14, borderRadius: 14,
    backgroundColor: 색.실땀, alignItems: 'center',
  },
  단추_눌림: { opacity: 0.8 },
  단추글: { fontFamily: 폰트.강조, fontSize: 15, color: 색.바탕 },
  연한단추: { paddingVertical: 10, alignItems: 'center' },
  연한단추글: { fontFamily: 폰트.강조, fontSize: 13, color: 색.잉크_서브 },
  흐림: { opacity: 0.4 },
});
