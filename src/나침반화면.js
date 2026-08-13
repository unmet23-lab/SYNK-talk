'use strict';
/**
 * 나침반 화면 — 시즌 회고가 병치할 **왼쪽**을 그날 담는 자리.
 * 정본 = appsscript `docs/시즌회고_설계.md` v3 §8 ①·§9-2 ㉤(유호님 확정 6건 · 2026-08-12).
 *
 * ■ 이 화면의 값은 「예쁨」이 아니라 **그날 실제로 담기는가** 하나다
 *   🔴 왼쪽은 **소급이 원리상 불가능**하다 — 나중에 다시 물어도 나오는 것은 오늘의 답이지
 *      그때의 답이 아니다(`learners.goal_track` 이 이미 그렇게 죽었다).
 *   🔴 시한은 개원일이 아니라 **첫 학생의 «입학일»** 이다 — 대외로 「입학할 때, 그리고
 *      시즌마다 나침반 세션을 엽니다」가 이미 나가 있다(상담AI FAQ Q11 `확정: true`).
 *   🔑 그래서 이 화면은 **강사 손에 있는 것**(학생번호 `SYNK-001`)으로 연다. uuid 를 요구하면
 *      실제로는 「나중에 옮겨 적기」가 되고, 그 순간 자동화 축이 그 자리에서 죽는다(설계 §8 ①).
 *
 * ■ 시즌마다 학생이 하는 일 = **한 줄 + 클릭 하나** (설계 §9-2 ㉤·㉥)
 *   입학 회차만 서술 3칸이고, 이후 시즌은 ②[그대로]/[바꿀래] 버튼 + ④`season_goal` 한 줄이다.
 *   ②를 매번 다시 쓰게 하면 대부분 「지난번과 같은 답」이 되고 학생에겐 반복 노동이 된다.
 *   🔑 [그대로]를 눌러도 답 자체는 **복사해 보낸다** — 행마다 자족해야 회고의 병치가 단순해지고,
 *      「안 바꿨다」를 값 비교로 추측하지 않는다(그 칸이 `redirected` 판정의 직접 근거다).
 *
 * ■ 🔴 어휘 사본이 **0개**다 — 이 화면은 문항키도 문구도 모른다
 *   문항·라벨·글자 상한은 **서버가 준다**(`compass/open` 의 `questions`). 화면이 손으로 적으면
 *   목적별 문구 갈래(`culture` = TOPIK 문항이 안 맞는 학생)와 몽골어 검수가 서는 날 화면만 낡는다.
 *   🔑 몽골어(`라벨_mn`)는 지금 전부 `null` 이다 — 검수자 1인이 아직 안 봤다(설계 §9-2 ㉦-2).
 *      **비면 한국어를 그린다**(지어 넣지 않는다 · 검수가 끝나면 서버만 고치면 화면은 그대로다).
 *
 * ■ 🔴 「시즌이 안 열렸다」와 「앱이 고장났다」를 **가른다**
 *   서버가 409 `SEASON_NOT_OPEN` 을 주면 그건 결함이 아니라 **운영이 아직 그 시즌 행을 안
 *   열었다**는 뜻이다(시즌 경계 = 교재 경계라 사람이 연다). 안 가르면 강사는 앱을 의심한다.
 *
 * 🚫 재제안 금지
 *   · 화면이 시즌·회차를 고르기 — 서버가 정한다(`functions/teach` 머리말 🔴). 고르게 하면
 *     지난 시즌 소급 기입이 열리고, 그 순간 「그때 그 시점의 선언」이라는 전제가 죽는다.
 *   · `season_goal` 을 지표·마감·달성기준으로 쪼개기 — 학생 화면이 계획서가 된다(설계 §9-2 ㉤).
 *   · 답을 자동 채점·판정하기 — 「목표 런타임 자동 판정 🚫」 유호님 확정 승계.
 *   · 저장 성공을 낙관적으로 그리기 — 서버가 준 `적힌시각` 만 「적혔다」로 그린다.
 */
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { 색, 폰트, 모노트래킹 } from './테마';
import { 열기, 저장하기 } from './나침반API.js';

/** 회차 코드 — 정본은 `lib/나침반문항.js` 의 `종류` 다.
 *  🔑 없앨 수 없는 사본(서버가 이 어휘를 값목록으로 내주는 경로가 없다)이라 **기계에 물린다** —
 *    `tests/나침반화면.test.js` 가 그 lib 의 리터럴과 대조한다. */
export const 회차 = Object.freeze({ 입학: 'enrollment', 시즌: 'season' });

/** 시즌 회차에서 ②를 다시 묻는 방식 — 버튼 둘. 설계 §9-2 ㉤ 「버튼 1」. */
const 그대로값 = Object.freeze({ 그대로: false, 바꿀래: true });

export default function 나침반화면({ 토큰, 돌아가기 }) {
  const [학생번호입력, set학생번호입력] = useState('');
  const [세션, set세션] = useState(null);      // compass/open 이 준 것 한 벌
  const [답, set답] = useState({});
  const [바꿨나, set바꿨나] = useState(null);
  const [오류, set오류] = useState(null);
  const [도는중, set도는중] = useState(false);
  const [적힌시각, set적힌시각] = useState(null);

  const 여는중 = 도는중 && !세션;

  const 열기누름 = useCallback(async () => {
    const 번호 = 학생번호입력.trim();
    if (!번호) { set오류({ 말: '학생번호를 넣어 주세요', 운영: false }); return; }
    set도는중(true); set오류(null); set적힌시각(null);
    try {
      const r = await 열기(토큰, 번호);
      set세션(r);
      set답({});
      /* 시즌 회차의 기본값을 **비워 둔다** — [그대로]를 미리 눌러 두면 강사가 넘긴 것과
       * 학생이 고른 것이 같은 모양이 되고, 그 칸의 존재 이유가 그 자리에서 사라진다. */
      set바꿨나(null);
    } catch (e) {
      set세션(null);
      /* 🔑 「시즌이 안 열렸다」는 **운영 안내**로 가른다(위 머리말) — 오류색으로 그리면
       *   강사는 앱을 의심하고, 그러면 그날의 나침반이 통째로 밀린다. */
      set오류({ 말: e?.message || '열지 못했어요', 운영: e?.code === 'SEASON_NOT_OPEN' });
    } finally { set도는중(false); }
  }, [토큰, 학생번호입력]);

  /* 물어야 할 것 — **서버가 준 목록 그대로**다. 화면은 순서도 안 바꾼다(설계가 정한 순서에서
   * ②가 ④보다 먼저 오고, 그건 「지난 답을 보고 이번 과녁을 정한다」는 흐름이다). */
  const 문항들 = 세션?.문항 ?? [];
  const 시즌회차 = 세션?.회차 === 회차.시즌;

  /* 시즌 회차에서 ②는 입력칸이 아니라 **버튼**이다 — [그대로]면 지난 답을 그대로 담는다. */
  const 답값 = useCallback((키) => {
    if (시즌회차 && 키 === 'self_in_5y' && 바꿨나 === 그대로값.그대로) return 세션?.지난5년답 ?? '';
    return 답[키] ?? '';
  }, [답, 바꿨나, 세션, 시즌회차]);

  /** 저장 가능? — 서버 검사의 **사본이 아니라 왕복을 아끼는 자리**다(서버가 다시 잰다). */
  const 채워짐 = useMemo(() => {
    if (!세션) return false;
    if (시즌회차 && 바꿨나 === null) return false;
    return 문항들.every((q) => String(답값(q.키)).trim().length > 0);
  }, [세션, 시즌회차, 바꿨나, 문항들, 답값]);

  const 저장누름 = useCallback(async () => {
    if (!채워짐 || 도는중) return;
    set도는중(true); set오류(null);
    try {
      const 보낼답 = {};
      for (const q of 문항들) 보낼답[q.키] = String(답값(q.키)).trim();
      const r = await 저장하기(토큰, {
        학생id: 세션.학생id,
        시즌id: 세션.시즌?.season_id,
        답: 보낼답,
        바꿨나: 시즌회차 ? 바꿨나 : null,
      });
      set적힌시각(r.적힌시각);
    } catch (e) {
      /* 🔑 `SEASON_ROLLED` = 화면을 연 뒤 시즌 경계가 넘어갔다. 이건 실패가 아니라 **다시
       *   열어야 한다**는 뜻이라 그대로 말한다(조준이 밀린 자리 · 서버 머리말 🔑). */
      set오류({ 말: e?.message || '저장하지 못했어요', 운영: e?.code === 'SEASON_ROLLED' });
    } finally { set도는중(false); }
  }, [채워짐, 도는중, 문항들, 답값, 토큰, 세션, 시즌회차, 바꿨나]);

  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
      <Text style={s.label}>COMPASS</Text>
      <Text style={s.머리}>나침반</Text>

      {!세션 && (
        <View style={s.카드}>
          <Text style={s.요약}>학생번호를 넣고 열면 이번 시즌에 물을 것이 뜹니다.</Text>
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
            style={({ pressed }) => [s.저장, 도는중 && s.잠김, pressed && s.눌림]}
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
          {/* 🔑 어느 시즌인지 **교재 이름으로** 말한다 — 시즌의 정본이 달력이 아니라 교재다
              (설계 §9-0 · 유호님 확정). 「2026-08~10」으로 적으면 그 확정이 화면에서 사라진다. */}
          <Text style={s.요약}>
            {세션.시즌?.code ?? ''} · 교재 「{세션.시즌?.textbook ?? ''}」
          </Text>
          <Text style={s.메모}>
            {시즌회차
              ? '이번 시즌 나침반이에요 — 5년 뒤의 나를 다시 보고, 이번 교재에서 이루고 싶은 목표를 한 줄 적어요.'
              : '입학 나침반이에요 — 세 가지를 처음 적고, 이번 교재에서 이루고 싶은 목표를 한 줄 더해요.'}
          </Text>
          {세션.이미적힘 && (
            <Text style={s.메모}>
              이 시즌은 이미 적혀 있어요({세션.이미적힘}) — 다시 저장하면 그 자리를 고칩니다.
            </Text>
          )}
        </View>
      )}

      {세션 && 문항들.map((q) => (
        <View key={q.키} style={s.카드}>
          {/* 몽골어가 검수되면 서버만 채우면 된다 — 비면 한국어를 그린다(지어 넣지 않는다). */}
          <Text style={s.칸이름}>{q.라벨_mn || q.라벨}</Text>

          {시즌회차 && q.키 === 'self_in_5y' ? (
            <View style={s.칸}>
              <Text style={s.문장}>{세션.지난5년답 || '(지난 답이 없어요)'}</Text>
              <View style={s.칩줄}>
                {[['그대로', 그대로값.그대로], ['바꿀래', 그대로값.바꿀래]].map(([글, 값]) => (
                  <Pressable
                    key={글}
                    onPress={() => set바꿨나(값)}
                    style={({ pressed }) => [s.판정칩, 바꿨나 === 값 && s.판정칩_고름, pressed && s.눌림]}
                  >
                    <Text style={[s.판정칩글, 바꿨나 === 값 && s.판정칩글_고름]}>{글}</Text>
                  </Pressable>
                ))}
              </View>
              {바꿨나 === 그대로값.바꿀래 && (
                <TextInput
                  style={s.입력}
                  value={답[q.키] ?? ''}
                  onChangeText={(t) => set답((p) => ({ ...p, [q.키]: t.slice(0, q.상한) }))}
                  placeholder="바뀐 5년 뒤의 나"
                  placeholderTextColor={색.잉크_메타}
                  multiline
                />
              )}
            </View>
          ) : (
            <TextInput
              style={s.입력}
              value={답[q.키] ?? ''}
              onChangeText={(t) => set답((p) => ({ ...p, [q.키]: t.slice(0, q.상한) }))}
              placeholderTextColor={색.잉크_메타}
              multiline={q.상한 > 200}
            />
          )}
        </View>
      ))}

      {오류 && <Text style={오류.운영 ? s.안내글 : s.오류글}>{오류.말}</Text>}
      {적힌시각 && <Text style={s.안내글}>적혔어요 — {적힌시각}</Text>}

      {세션 && (
        <Pressable
          onPress={저장누름}
          disabled={!채워짐 || 도는중}
          style={({ pressed }) => [s.저장, (!채워짐 || 도는중) && s.잠김, pressed && s.눌림]}
        >
          <Text style={s.저장글}>{도는중 ? '적는 중…' : '적기'}</Text>
        </Pressable>
      )}

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
  칸: { gap: 8 },
  칸이름: { fontFamily: 폰트.강조, fontSize: 13, lineHeight: 21, color: 색.잉크 },
  문장: { fontFamily: 폰트.본문, fontSize: 16, lineHeight: 25, color: 색.잉크 },
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

  안내글: { fontFamily: 폰트.캡션, fontSize: 13, lineHeight: 20, color: 색.잉크_서브 },
  오류글: { fontFamily: 폰트.캡션, fontSize: 13, lineHeight: 20, color: 색.잉크_메타 },

  /* 이 화면의 신호 1점 = 「적기」 버튼(`테마.신호자리` 규칙). 잠기면 색을 빼고 밝기로 낮춘다. */
  저장: {
    backgroundColor: 색.신호, borderRadius: 14, paddingVertical: 14, alignItems: 'center',
  },
  저장글: { fontFamily: 폰트.강조, fontSize: 15, color: 색.바탕 },
  잠김: { backgroundColor: 색.잉크_희미 },
  눌림: { opacity: 0.7 },

  back: { marginTop: 8, alignSelf: 'flex-start' },
  backText: { fontFamily: 폰트.강조, fontSize: 13, color: 색.잉크_서브 },
});
