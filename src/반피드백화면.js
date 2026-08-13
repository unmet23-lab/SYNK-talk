'use strict';
/**
 * 강사 반 단위 피드백 화면 — 반 카드 → 반 안 → 한 마디.
 * 정본 = `docs/강사_반단위_피드백_설계.md` v2 §5·§6·§8-4.
 *
 * ■ 이 화면의 값은 「보기 좋음」이 아니라 **강사의 말이 실제로 남는가** 하나다
 *   개원 뒤 사람 손이 실제로 도는 자리는 여기다. 통로(§8-3)는 섰는데 화면이 없으면 그 통로의
 *   통과량은 원리상 **0**이고, 0인 채로 개원하면 「선생님이 봐 줬다」가 한 번도 안 일어난다.
 *
 * ■ 🔴 정렬 축이 곧 비교다 (설계 §5)
 *   반 안 정렬은 **「오래 기다린 순」 하나**이고 그 순서는 **서버가 준 그대로**다. 화면이 다시
 *   정렬하지 않는다 — 점수·정답률·진도로 정렬하는 순간 이 화면이 등수표가 되고 철학 ㉢
 *   (학생끼리 비교하지 않는다)을 정면으로 깬다. 기다린 시간은 학생의 속성이 아니라
 *   **내 일감의 나이**라 비교가 아니다. 🚫 평균·상위·배지·「다른 아이보다」 어느 자리에도.
 *
 * ■ 🔴 빈 화면과 권한 없음이 같은 모양이면 안 된다 (설계 §5)
 *   담당 반 0개인 강사는 「아무것도 없다」가 아니라 **「배정된 반이 없어요」**를 본다 — 원장이
 *   배정을 안 한 것이지 그가 일을 다 끝낸 것이 아니다. 그 갈래는 서버가 `empty_reason` 으로
 *   준다(화면이 `길이 === 0` 으로 추측하지 않는다).
 *
 * ■ 🔑 조회를 되풀이하지 않는다 — 조회 1회 = **감사 1행**이다
 *   `staff_access_log` 는 「나중에 보는 기록」이 아니라 조회 횟수의 분모라, 화면이 뒤로 갈
 *   때마다 다시 부르면 그 분모가 조용히 달라진다. 한 마디를 남긴 뒤 그 항목이 큐에서 빠지는
 *   것은 **추측이 아니라 서버 술어 그대로**다(「강사 한 마디가 아직 없다」 ∧ 방금 썼다) —
 *   그래서 목록에서 빼고 카드 셈을 1 내리는 것은 재조회 없이도 정확하다.
 *   🔑 그 셈을 다시 판정하지 않는다: 모양(`waiting`·`clear`·`empty`)은 서버가 쓴 것과 **같은
 *   함수**(`lib/반피드백.카드요약`)로 다시 낸다. 화면이 `기다림 > 0` 을 손으로 적으면 그게
 *   두 번째 정본이고, 갈리는 날 증상은 「● 0 인데 카드가 노랗다」라 아무 데도 안 남는다.
 *
 * ■ 🔑 갈래(`origin`)를 화면이 «지어내지» 않는다 — 동작에서 나온다 (설계 §6)
 *   기본은 **빈 칸에 쓰기**다(`written`). 도전안 「기본값을 고르기로」는 ⏳유호님 판정이라
 *   그 버튼 구성을 미리 세우지 않는다. 다만 AI 문장이 눈앞에 있는데 그대로 보내려면 손으로
 *   다시 타자해야 하는 것은 화면의 결함이라, **가져오기 한 줄**만 연다:
 *     안 가져왔다 → `written` · 가져와서 글자 그대로 → `as_is` · 가져와서 고쳤다 → `edited`.
 *   답이 무엇이든 갈리는 것은 「어느 것이 기본 버튼인가」뿐이고, 그동안 쌓이는 행의 갈래는
 *   지금부터 정확하다(안 두면 답 나는 날 이미 쌓인 것의 갈래를 영영 복원 못 한다).
 *
 * 🚫 재제안 금지
 *   · 골든 판정과 한 화면으로 합치기 — 합치면 골든의 주 5건 상한이 반 큐 물량에 묻혀
 *     「유인이 0인 업무」가 영영 안 끝난다(설계 §5).
 *   · 전교생 큐를 기본값으로 보이기 — 담당 반 밖은 서버가 0행으로 막는다(설계 §4).
 *   · 「이번 주 조용한 학생」을 학생에게 보이기 — 그건 강사 자신의 행동 기록이다.
 *   · 학생글과 전사를 한 칸으로 접기 — 기계가 «들은» 문장을 학생이 «쓴» 문장으로 말하게 된다.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { 색, 폰트, 모노트래킹, 몽골어 } from './테마';
import { 반목록, 반큐, 한마디주기 } from './반피드백API.js';
import { 갈래 as 갈래값, 처분 as 처분값, 본문상한, 카드요약 } from '../lib/반피드백.js';

/** 처분 버튼의 말. 🔑 **코드값은 lib 이 정본**이고 여기 있는 것은 그 코드의 «말»뿐이다 —
 *  목록을 손으로 적지 않고 lib 의 값에서 찾아 쓴다(값이 늘면 여기서 `undefined` 로 드러난다). */
const 처분말 = { confirmed: '확인', retry: '다시 해보자' };

/** 과제 종류를 강사 말로. 모르는 값은 **그대로 보여 준다**(지어내지 않는다). */
const 종류말 = { '숙제제출': '숙제', '출석발화': '말하기', '자유발화': '말하기' };

/**
 * 기다린 나이 — **내 일감의 나이**지 학생의 속성이 아니다(설계 §5).
 * 🔑 「오늘」은 자정 경계가 아니라 24시간 단위로 센다 — 밤 11시에 낸 것이 자정을 넘겼다고
 *   「1일 기다림」이 되면 강사는 안 밀린 것을 밀린 것으로 읽는다.
 */
export function 기다린날(낸시각, 지금 = Date.now()) {
  const t = Date.parse(String(낸시각 ?? ''));
  if (!Number.isFinite(t)) return null;
  const 일 = Math.floor((지금 - t) / 86400000);
  return 일 < 0 ? 0 : 일;
}

export function 나이글(낸시각, 지금 = Date.now()) {
  const 일 = 기다린날(낸시각, 지금);
  if (일 == null) return '';
  return 일 === 0 ? '오늘' : `${일}일`;
}

/**
 * 한 마디의 갈래를 **동작에서** 낸다(머리말 🔑).
 * @param {{가져옴: boolean, 글: string, AI교정: string|null}} 상태
 */
export function 갈래판정({ 가져옴, 글, AI교정 }) {
  if (!가져옴) return 'written';
  const a = String(글 ?? '').trim();
  const b = String(AI교정 ?? '').trim();
  return a && a === b ? 'as_is' : 'edited';
}

export default function 반피드백화면({ 토큰, 돌아가기 }) {
  const [목록, set목록] = useState(null);      // feedback/classes 한 벌
  const [반, set반] = useState(null);          // 고른 반 + 그 큐
  const [항목, set항목] = useState(null);      // 고른 산출물
  const [글, set글] = useState('');
  const [가져옴, set가져옴] = useState(false);
  const [처분, set처분] = useState(null);
  const [끝난것, set끝난것] = useState(null);
  const [오류, set오류] = useState(null);
  const [도는중, set도는중] = useState(false);

  const 첫조회 = useCallback(async () => {
    set도는중(true); set오류(null);
    try {
      set목록(await 반목록(토큰));
    } catch (e) {
      set오류({ 말: e?.message || '반 목록을 열지 못했어요', 운영: false });
    } finally { set도는중(false); }
  }, [토큰]);

  useEffect(() => { 첫조회(); }, [첫조회]);

  const 반열기 = useCallback(async (그반) => {
    if (도는중) return;
    set도는중(true); set오류(null); set끝난것(null);
    try {
      const r = await 반큐(토큰, 그반.id);
      set반({ ...r, 카드: 그반 });
    } catch (e) {
      /* 🔴 「담당 반이 아니다」와 「그 반이 없다」를 서버가 일부러 한 코드로 묶었다 —
       *   화면도 갈라 말하지 않는다(가르면 응답 자체가 그 반의 존재를 말한다). */
      set오류({ 말: e?.message || '반을 열지 못했어요', 운영: e?.code === 'NOT_FOUND' });
    } finally { set도는중(false); }
  }, [토큰, 도는중]);

  const 항목열기 = useCallback((i) => {
    set항목(i);
    set글(''); set가져옴(false); set처분(null); set끝난것(null); set오류(null);
  }, []);

  const 가져오기 = useCallback(() => {
    if (!항목?.AI교정) return;
    set글(String(항목.AI교정).slice(0, 본문상한));
    set가져옴(true);
  }, [항목]);

  const 보내기 = useCallback(async () => {
    if (!항목 || !글.trim() || !처분 || 도는중) return;
    set도는중(true); set오류(null);
    try {
      const r = await 한마디주기(토큰, {
        산출물id: 항목.산출물id,
        글: 글.trim(),
        갈래: 갈래판정({ 가져옴, 글, AI교정: 항목.AI교정 }),
        처분,
      });
      set끝난것({ ...r, 이름: 항목.이름 });
      /* 🔑 재조회 0 — 방금 쓴 한 마디가 서버 술어 ②를 그대로 뒤집는다(머리말 🔑).
       *   ⚠ **고쳐 쓴 것이면 큐에서 안 뺀다** — 그 항목은 애초에 큐에 없었다(내 한 마디가
       *   이미 있었으니). 빼면 셈이 한 칸 어긋나고 그 어긋남은 아무 데도 안 남는다. */
      if (!r.고친시각) {
        set반((이전) => (이전
          ? { ...이전, 항목들: 이전.항목들.filter((x) => x.산출물id !== 항목.산출물id) }
          : 이전));
        set목록((이전) => (이전 ? { ...이전, 반들: 이전.반들.map((c) => (
          c.id === 반?.카드?.id
            ? { ...c, ...카드요약({ 학생수: c.학생수, 기다림: Math.max(0, c.기다림 - 1) }) }
            : c)) } : 이전));
      }
      set항목(null);
    } catch (e) {
      /* 🔴 「남이 이미 썼다」는 고장이 아니라 정상 상태다(한 반에 강사 둘 · 설계 §1 ⓐ). */
      set오류({ 말: e?.message || '한 마디를 남기지 못했어요', 운영: e?.code === 'NOTE_BY_OTHER' });
    } finally { set도는중(false); }
  }, [토큰, 항목, 글, 가져옴, 처분, 도는중, 반]);

  const 조용한이반 = useMemo(
    () => (목록?.조용한 ?? []).filter((q) => !반 || q.반id === 반.반.id),
    [목록, 반],
  );

  /* ── ③ 한 마디 ─────────────────────────────────────────────────────── */
  if (항목) {
    const 낸글 = 항목.학생글 ?? 항목.들린대로 ?? null;
    const 전사 = !항목.학생글 && Boolean(항목.들린대로);
    return (
      <ScrollView style={s.wrap} contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
        <Text style={s.label}>ONE WORD</Text>
        <Text style={s.머리}>{항목.이름 ?? 항목.학생번호 ?? '학생'}</Text>
        <Text style={s.메타}>
          {종류말[항목.과제종류] ?? 항목.과제종류 ?? ''} · {나이글(항목.낸시각)} 기다렸어요
        </Text>

        <View style={s.카드}>
          {/* 🔴 「쓴 것」과 「들린 대로」를 라벨로 가른다 — 접으면 기계의 오차가 학생의
              실수로 읽힌다(전사는 확신의 결이 다르다). */}
          <Text style={s.칸이름}>{전사 ? '들린 대로' : '학생이 낸 글'}</Text>
          <Text style={s.문장}>{낸글 ?? '—'}</Text>
          {전사 && <Text style={s.메모}>음성을 기계가 옮긴 것이라 학생이 말한 것과 다를 수 있어요.</Text>}
        </View>

        {항목.AI교정 && (
          <View style={s.카드}>
            <Text style={s.칸이름}>AI 가 낸 교정</Text>
            <Text style={s.문장}>{항목.AI교정}</Text>
            {항목.AI해설 && <Text style={s.해설}>{항목.AI해설}</Text>}
            {항목.AI태그.length > 0 && <Text style={s.줄}>{항목.AI태그.join(' · ')}</Text>}
          </View>
        )}

        <View style={s.카드}>
          <Text style={s.칸이름}>한 마디</Text>
          <TextInput
            style={[s.입력, s.여러줄]}
            value={글}
            onChangeText={(t) => set글(t.slice(0, 본문상한))}
            placeholder="이 학생에게 해 줄 한 마디"
            placeholderTextColor={색.잉크_메타}
            multiline
          />
          <View style={s.줄사이}>
            <Text style={s.줄}>{글.length}/{본문상한}</Text>
            {/* 🔑 기본은 «쓰기»다 — 이 줄은 보조다(머리말 🔑 · 도전안은 ⏳유호님 판정). */}
            {항목.AI교정 && (
              <Pressable onPress={가져오기} hitSlop={8}>
                <Text style={s.보조링크}>AI 교정 그대로 넣기</Text>
              </Pressable>
            )}
          </View>

          <Text style={s.칸이름}>학생이 보낸 것은</Text>
          <View style={s.칩줄}>
            {처분값.map((코드) => (
              <Pressable
                key={코드}
                onPress={() => set처분(코드)}
                style={({ pressed }) => [s.칩, 처분 === 코드 && s.칩_고름, pressed && s.눌림]}
              >
                <Text style={[s.칩글, 처분 === 코드 && s.칩글_고름]}>{처분말[코드] ?? 코드}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={보내기}
            disabled={!글.trim() || !처분 || 도는중}
            style={({ pressed }) => [
              s.저장, (!글.trim() || !처분 || 도는중) && s.잠김, pressed && s.눌림,
            ]}
          >
            <Text style={s.저장글}>{도는중 ? '남기는 중…' : '남기기'}</Text>
          </Pressable>
        </View>

        {오류 && <Text style={오류.운영 ? s.안내글 : s.오류글}>{오류.말}</Text>}

        <Pressable onPress={() => set항목(null)} style={s.back} hitSlop={8}>
          <Text style={s.backText}>← 반으로</Text>
        </Pressable>
      </ScrollView>
    );
  }

  /* ── ② 반 안 ───────────────────────────────────────────────────────── */
  if (반) {
    return (
      <ScrollView style={s.wrap} contentContainerStyle={s.inner}>
        <Text style={s.label}>CLASS QUEUE</Text>
        <Text style={s.머리}>{반.반.이름 || 반.반.열쇠}</Text>
        <Text style={s.메타}>오래 기다린 순</Text>

        {끝난것 && (
          <View style={s.카드}>
            <Text style={s.칸이름}>{끝난것.고친시각 ? '고쳐 썼어요' : '남겼어요'}</Text>
            <Text style={s.문장}>
              {끝난것.이름 ?? ''} · {처분말[끝난것.처분] ?? 끝난것.처분}
            </Text>
          </View>
        )}

        {반.항목들.length === 0 && (
          <View style={s.카드}>
            <Text style={s.요약}>이 반은 다 봤어요.</Text>
            <Text style={s.메모}>
              학생이 새로 내고 AI 교정이 나면 여기 다시 뜹니다.
            </Text>
          </View>
        )}

        {반.항목들.map((i) => (
          <Pressable
            key={i.산출물id}
            onPress={() => 항목열기(i)}
            style={({ pressed }) => [s.줄버튼, pressed && s.눌림]}
          >
            <Text style={s.줄버튼글}>{i.이름 ?? i.학생번호 ?? '학생'}</Text>
            <Text style={s.메타}>
              {나이글(i.낸시각)} · {종류말[i.과제종류] ?? i.과제종류 ?? ''}
            </Text>
          </Pressable>
        ))}

        {/* 🎯 조용한 학생 — 이 반 몫만. 🚫 학생에게 보이지 않는다(강사 자신의 행동 기록이다). */}
        {조용한이반.length > 0 && (
          <View style={s.카드}>
            <Text style={s.칸이름}>이번 주 아직 한 마디를 못 준 학생</Text>
            <Text style={s.문장}>{조용한이반.map((q) => q.이름 ?? '—').join(' · ')}</Text>
            <Text style={s.메모}>
              보낸 것이 없어도 여기 떠요 — 조용한 학생이 조용한 채로 지나가는 걸 막는 칸이에요.
            </Text>
          </View>
        )}

        {오류 && <Text style={오류.운영 ? s.안내글 : s.오류글}>{오류.말}</Text>}

        <Pressable onPress={() => { set반(null); set끝난것(null); set오류(null); }} style={s.back} hitSlop={8}>
          <Text style={s.backText}>← 내 반</Text>
        </Pressable>
      </ScrollView>
    );
  }

  /* ── ① 내 반 카드 ──────────────────────────────────────────────────── */
  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.inner}>
      <Text style={s.label}>MY CLASSES</Text>
      <Text style={s.머리}>반 피드백</Text>

      {/* 🔴 첫 프레임을 **비우지 않는다** — 빈 화면은 「반이 0개」와 「아직 못 읽었다」와
          「조회가 죽었다」 셋을 같은 모양으로 만든다(검수 콘솔이 「큐를 읽는 중」을 세운 자리와
          같은 축). 셋이 같아 보이면 강사는 셋 다 「내 일이 없다」로 읽는다. */}
      {!목록 && !오류 && <Text style={s.요약}>반을 읽는 중…</Text>}

      {/* 🔴 「배정된 반이 없다」와 「다 봤다」는 다른 상태다 — 서버가 갈라 준다. */}
      {목록?.빈사유 === 'no_classes_assigned' && (
        <View style={s.카드}>
          <Text style={s.요약}>배정된 반이 없어요.</Text>
          <Text style={s.메모}>원장님이 반을 배정하면 여기 뜹니다.</Text>
        </View>
      )}

      <View style={s.카드줄}>
        {(목록?.반들 ?? []).map((c) => (
          <Pressable
            key={c.id}
            onPress={() => 반열기(c)}
            style={({ pressed }) => [
              s.반카드, c.모양 === 'waiting' && s.반카드_기다림, pressed && s.눌림,
            ]}
          >
            <Text style={s.반이름}>{c.이름 || c.열쇠}</Text>
            {/* 🔴 카드에 실을 수 있는 수는 둘뿐이다 — 반 인원과 **내 일감의 수**.
                🚫 평균·정답률·진도 어느 것도 여기 오지 않는다(설계 §5 · 철학 ㉢). */}
            <Text style={s.반셈}>
              {c.모양 === 'empty'
                ? '학생이 없어요'
                : `👥 ${c.학생수} · ${c.기다림 > 0 ? `● ${c.기다림}` : '○ 다 봤다'}`}
            </Text>
          </Pressable>
        ))}
      </View>

      {오류 && <Text style={오류.운영 ? s.안내글 : s.오류글}>{오류.말}</Text>}

      <Pressable onPress={돌아가기} style={s.back} hitSlop={8}>
        <Text style={s.backText}>← 돌아가기</Text>
      </Pressable>
    </ScrollView>
  );
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
  칸이름: { fontFamily: 폰트.강조, fontSize: 13, lineHeight: 21, color: 색.잉크 },
  문장: { fontFamily: 폰트.본문, fontSize: 16, lineHeight: 25, color: 색.잉크 },
  /* 몽골어 해설 — 킷 폰트에 키릴 자형이 없어 별개 스타일이다(`테마.몽골어` 머리말). */
  해설: { ...몽골어, color: 색.잉크_서브 },
  줄: { fontFamily: 폰트.모노, fontSize: 12, lineHeight: 20, color: 색.잉크_서브 },
  메모: { fontFamily: 폰트.캡션, fontSize: 13, lineHeight: 20, color: 색.잉크_서브 },
  메타: { fontFamily: 폰트.캡션, fontSize: 12, lineHeight: 19, color: 색.잉크_메타 },

  /* 카드 그리드 — 한 줄에 둘. 목록이 아니라 카드인 것이 §5 ⓑ 의 규격이다. */
  카드줄: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  반카드: {
    backgroundColor: 색.바탕띄움,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'transparent',
    padding: 18,
    gap: 8,
    minWidth: 150,
    flexGrow: 1,
    flexBasis: '46%',
  },
  /* 기다리는 반은 **테두리 한 겹**으로만 앞세운다 — 코랄은 이 앱에서 녹음 버튼 전용이고
     (R1 신호 1점), 카드마다 신호색을 칠하면 「어디부터 볼지」가 오히려 안 보인다. */
  반카드_기다림: { borderColor: 색.잉크_희미 },
  반이름: { fontFamily: 폰트.강조, fontSize: 16, lineHeight: 24, color: 색.잉크 },
  반셈: { fontFamily: 폰트.캡션, fontSize: 13, lineHeight: 20, color: 색.잉크_서브 },

  줄버튼: {
    backgroundColor: 색.바탕띄움,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 4,
  },
  줄버튼글: { fontFamily: 폰트.강조, fontSize: 15, lineHeight: 23, color: 색.잉크 },

  입력: 입력바탕,
  여러줄: { minHeight: 96, textAlignVertical: 'top' },
  줄사이: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  보조링크: { fontFamily: 폰트.캡션, fontSize: 13, color: 색.잉크_보조 },

  칩줄: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  칩: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 색.잉크_희미,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  칩_고름: { backgroundColor: 색.잉크, borderColor: 색.잉크 },
  칩글: { fontFamily: 폰트.강조, fontSize: 13, color: 색.잉크_서브 },
  칩글_고름: { color: 색.바탕 },

  저장: {
    backgroundColor: 색.잉크,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  저장글: { fontFamily: 폰트.강조, fontSize: 15, color: 색.바탕 },
  잠김: { opacity: 0.45 },
  눌림: { opacity: 0.65 },

  /* 운영 안내와 오류를 **밝기**로 가른다 — 「남이 이미 썼다」를 오류색으로 그리면 강사는 앱을
     의심하고, 그러면 그날의 피드백이 통째로 밀린다(밀린 피드백 = 한 마디 0).
     🚫 코랄을 쓰지 않는다: 이 화면의 신호 1점은 **남기기 버튼**이다(`테마.신호자리`). */
  안내글: { fontFamily: 폰트.캡션, fontSize: 13, lineHeight: 20, color: 색.잉크_서브 },
  오류글: { fontFamily: 폰트.캡션, fontSize: 13, lineHeight: 20, color: 색.잉크_메타 },

  back: { paddingVertical: 10 },
  backText: { fontFamily: 폰트.강조, fontSize: 13, color: 색.잉크_메타 },
});
