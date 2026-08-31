'use strict';
/**
 * 몽골어 문구 감수 화면 — 외부 감수자가 **우리 카피**를 옮기는 자리.
 *
 * ■ 이 화면이 없으면 통로의 통과량이 원리상 0이다
 *   표 둘·뷰 하나·경로 셋·도구 둘이 다 서 있어도, 사람이 판정을 넣을 자리가 없으면 몽골어는
 *   영영 안 온다(`강사화면.js` 머리말과 같은 자리 — 통로만 서고 화면이 없으면 통과량 0).
 *
 * ■ 🔴 **소리가 없다** — 발화 검수 화면과 가장 크게 다른 점
 *   `src/검수화면.js` 는 오디오를 듣고 전사를 고치는 일이라 청취 게이트가 심장이다.
 *   여기엔 오디오도, 학생번호도, 발화도 **한 칸도 없다.** 감수자는 외부 계약자고, 그가 학생
 *   데이터에 못 닿는 것은 권한 설정이 아니라 **자원이 갈려 있어서**다(마이그레이션 머리말).
 *   회귀가 그 선을 소스에서 잰다 — 편의로 학생 표를 끌어오면 증상이 **없기** 때문이다.
 *
 * ■ 🔑 판정 셋 중 «둘»은 화면이 고르고, 하나는 사람이 고른다
 *   `초벌이 맞다` ↔ `고쳤다` 는 **글자 비교로 결정된다**(초벌을 그대로 뒀나, 손댔나).
 *   사람에게 물으면 초벌을 고쳐 놓고 「초벌이 맞다」를 누르는 일이 실제로 생기고, 그러면
 *   장부의 그 낱말이 뜻을 잃는다. → 버튼 하나(`확정`)로 받고 **무엇으로 적히는지를 그 자리에
 *   글자로 보인다**(감춘 파생이 아니다).
 *   ⚠ 「검수 콘솔에서 verdict 를 화면이 미리 그리지 않는다」는 규칙과 어긋나지 «않는다» —
 *     거기서는 **서버가** 파생해서 화면의 짐작과 갈릴 수 있었다. 여기서는 화면이 정해 보내고
 *     서버는 받은 것을 그대로 적는다(l10n Fn 머리말: 서버는 이 셋을 파생하지 않는다).
 *   🔴 `원문을 고쳐야 한다` 만은 사람이 따로 누른다 — 그건 «옮길 수 없는 한국어»라는 뜻이라
 *     텍스트 비교로 안 나온다. 그리고 그 판정의 **유일한 산출물이 까닭(note)** 이라 필수다.
 *
 * ■ 🔑 검증 규칙의 **사본이 0개**다
 *   저장을 막는 판단을 여기 다시 적지 않는다 — 서버가 쓰는 `확정요청`(`lib/문구감수.js`)을
 *   화면이 그대로 부른다. 그래서 화면이 내는 거절 문구는 서버가 낼 문구와 **글자까지 같다**.
 *
 * ■ 말투 — 이 화면을 읽는 사람은 **학생이 아니라 계약자**다
 *   그래서 「~해 주세요」가 아니라 무엇을 판정하는지가 먼저 온다. 다만 화면 글은 한국어다:
 *   한국어를 옮기는 일이라 그것을 못 읽으면 애초에 이 일을 할 수 없다.
 *   ⚠ 그 전제가 깨지는 날(몽골어만 읽는 감수자)이 오면 이 화면도 감수 대상이 된다 — 그때는
 *     이 파일의 문구가 `contents/문구_1차.js` 2차에 들어간다. 지금 미리 짓지 않는다.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { 색, 폰트, 모노트래킹, 몽골어, 눌림층, 눌림감 } from './테마';
import * as API from './문구감수API';
import { VERDICT, 원문결함, 확정요청 } from '../lib/문구감수.js';

/* 어휘를 여기 다시 적지 않는다 — `VERDICT` 는 DB CHECK 의 사본이고 그 사본은 lib 하나뿐이다.
 * 순서(초벌이 맞다 · 고쳤다 · 원문을 고쳐야 한다)도 그 파일이 정한 그대로 쓴다. */
const [초벌맞음, 고침] = VERDICT;

/* 미확정 카드가 쌓이면 TextInput 수십 장이 ScrollView 에 동시 마운트된다 — FlatList 전환 대신
 * 상한이 싼 처방. 값은 기본쪽크기 20 의 3쪽.
 * ⚠ 실기기 프레임은 안 재봤다(emulator-review-blocked) — 60 은 추정이다. */
const 미확정상한 = 60;

export default function 문구감수화면({ 토큰, 돌아가기 }) {
  const [목록, set목록] = useState([]);
  const [커서, set커서] = useState(null);
  const [불러옴, set불러옴] = useState(false);   // 한 번이라도 받아 봤나 — 「0」과 「안 재봤다」를 가른다
  const [도는중, set도는중] = useState(false);
  const [오류, set오류] = useState('');
  const [끝낸수, set끝낸수] = useState(0);
  const [서버총, set서버총] = useState(null);

  const 더받기 = useCallback(async (이어서) => {
    if (도는중) return;
    set도는중(true); set오류('');
    try {
      const r = await API.큐받기(토큰, 이어서 ? { 커서 } : {});
      set목록((앞) => (이어서 ? [...앞, ...r.목록] : r.목록));
      set커서(r.다음커서);
      if (r.총대기 != null) set서버총(r.총대기);
      set불러옴(true);
    } catch (e) {
      set오류(String((e && e.message) || e));
    } finally {
      set도는중(false);
    }
  }, [토큰, 커서, 도는중]);

  useEffect(() => { 더받기(false); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (불러옴 && !도는중 && !오류 && !목록.length && 커서) 더받기(true); }, [불러옴, 도는중, 오류, 목록.length, 커서, 더받기]); // eslint-disable-line react-hooks/exhaustive-deps

  /* 끝난 줄은 **그 자리에서 뺀다.** 큐는 `pending` 만 담으므로 다시 받아도 안 나온다 —
     다시 받으면 감수자가 방금 판정한 자리 위로 목록이 튀어 어디까지 했는지를 잃는다. */
  const 끝냈다 = (string_id) => {
    set목록((앞) => 앞.filter((x) => x.string_id !== string_id));
    set끝낸수((n) => n + 1);
    set서버총((n) => (n == null ? n : Math.max(0, n - 1)));
  };

  return (
    <ScrollView style={s.말림} contentContainerStyle={s.속} keyboardShouldPersistTaps="handled">
      <Text style={s.라벨}>SYNK LAB</Text>
      <Text style={s.제목}>몽골어 문구 감수</Text>
      <Text style={s.머리말}>
        한국어 문장을 몽골어로 옮깁니다. 학생 정보는 이 화면에 없습니다.
      </Text>

      <View style={s.셈줄}>
        <셈 이름="남은 것" 값={서버총 ?? 목록.length} />
        <셈 이름="오늘 끝낸 것" 값={끝낸수} />
      </View>

      {오류 ? <Text style={s.오류}>{오류}</Text> : null}

      {목록.map((줄) => (
        <문장카드 key={줄.string_id} 줄={줄} 토큰={토큰} 끝냈다={() => 끝냈다(줄.string_id)} />
      ))}

      {/* 🔴 「0」이 두 가지 뜻이라 **가른다** — 아직 안 받아 본 것 · 받았는데 비어 있는 것.
          그리고 후자도 둘이다: 반입 전이라 큐가 빈 것 · 다 끝난 것. 「오늘 끝낸 것」이 그 답을
          쥐고 있으므로 그 수로 문장을 고른다(같은 화면으로 두면 감수자가 고장으로 읽는다). */}
      {불러옴 && !목록.length && !도는중 ? (
        <View style={s.빈자리}>
          <Text style={s.빈글}>
            {끝낸수 > 0 ? '이 쪽은 다 끝냈습니다.' : '지금 감수할 문장이 없습니다.'}
          </Text>
          <Text style={s.빈꼬리}>
            {끝낸수 > 0
              ? (커서
                ? '다음 문장을 이어 받다가 멈췄어요 — 아래 「더 불러오기」를 눌러 주세요.'
                : '지금 받은 것은 여기까지예요.')
              : '문장이 아직 안 올라왔거나, 이미 다 끝났습니다. 원장에게 알려 주세요.'}
          </Text>
        </View>
      ) : null}

      {도는중 ? <ActivityIndicator color={색.잉크} style={{ marginTop: 18 }} /> : null}

      {커서 && !도는중 && 목록.length < 미확정상한 ? (
        <Pressable onPress={() => 더받기(true)} style={({ pressed }) => [s.더, pressed && { opacity: 눌림감.글 }]}>
          <Text style={s.더글}>더 불러오기</Text>
        </Pressable>
      ) : null}

      {커서 && !도는중 && 목록.length >= 미확정상한 ? (
        <Text style={s.빈꼬리}>화면에 {목록.length}문장이 쌓였어요 — 판정을 끝내면 이어서 받을 수 있어요.</Text>
      ) : null}

      <Pressable onPress={돌아가기} style={({ pressed }) => [s.뒤로, pressed && { opacity: 눌림감.글 }]}>
        <Text style={s.뒤로글}>← 돌아가기</Text>
      </Pressable>
    </ScrollView>
  );
}

function 셈({ 이름, 값 }) {
  return (
    <View style={s.셈}>
      <Text style={s.셈이름}>{이름}</Text>
      <Text style={s.셈값}>{값}</Text>
    </View>
  );
}

/**
 * 문장 하나 — 원문 · 맥락 · 폭 예산 · 번역칸 · 판정.
 * 상태를 카드마다 두는 이유: 목록이 길고, 위쪽 카드를 고치다 아래로 내려가는 것이 정상 동선이다.
 */
function 문장카드({ 줄, 토큰, 끝냈다 }) {
  const 초벌 = String(줄.draft_mn || '');
  const [번역, set번역] = useState(초벌);
  const [까닭, set까닭] = useState('');
  const [까닭칸열림, set까닭칸열림] = useState(false);
  const [도는중, set도는중] = useState(false);
  const [막힘, set막힘] = useState('');

  const 적음 = 번역.trim();
  /* 🔑 여기가 위 머리말의 「화면이 고르는 둘」이다 — 초벌을 그대로 뒀으면 `초벌이 맞다`,
     한 글자라도 손댔으면 `고쳤다`. 초벌이 아예 없으면 언제나 `고쳤다`(확인할 초벌이 없다). */
  const 판정 = 초벌.trim() && 적음 === 초벌.trim() ? 초벌맞음 : 고침;
  const 넘침 = 줄.max_len != null && 적음.length > 줄.max_len;

  async function 보내기(verdict) {
    if (도는중) return;
    set막힘('');
    const 요청 = verdict === 원문결함
      ? { string_id: 줄.string_id, verdict, note: 까닭 }
      : { string_id: 줄.string_id, verdict, final_mn: 번역, note: 까닭 || null };

    /* 🔑 서버가 쓰는 **그 함수**로 먼저 거른다 — 왕복 없이 무엇을 고칠지 알려 준다.
       두 곳에 규칙을 적지 않으므로 여기 문구와 서버 문구가 갈릴 수가 없다. */
    const v = 확정요청(요청);
    if (!v.값) { set막힘(v.이유); return; }

    set도는중(true);
    try {
      await API.확정하기(토큰, v.값);
      끝냈다();
    } catch (e) {
      set막힘(String((e && e.message) || e));
    } finally {
      set도는중(false);
    }
  }

  return (
    <View style={s.카드}>
      <View style={s.카드머리}>
        <Text style={s.id}>{줄.string_id}</Text>
        {줄.max_len != null ? (
          <Text style={[s.예산, 넘침 && s.예산_넘침]}>{적음.length} / {줄.max_len}</Text>
        ) : null}
      </View>

      <Text style={s.원문}>{줄.source_ko}</Text>
      {줄.context ? <Text style={s.맥락}>{줄.context}</Text> : null}

      {/* 🔑 `fontFamily` 는 `몽골어` 상수가 정한다 — 지금은 **일부러 비어 있어** 기기 시스템
          폰트가 키릴을 그린다. SUIT 을 박으면 글리프가 없어 두부(□□□)가 뜨고, 그 화면은
          「글자가 안 온 것」과 구별이 안 된다(`src/테마.js` 몽골어 상수). */}
      <TextInput
        testID={`번역-${줄.string_id}`}
        value={번역}
        onChangeText={set번역}
        placeholder="몽골어로 옮겨 주세요"
        placeholderTextColor={색.잉크_희미}
        multiline
        style={[s.입력, { ...몽골어 }, 넘침 && s.입력_넘침]}
      />
      {넘침 ? (
        <Text style={s.넘침글}>
          이 자리는 {줄.max_len}자까지 들어갑니다 — 넘으면 화면에서 잘립니다. 짧게 줄여 주세요.
        </Text>
      ) : null}

      {초벌.trim() ? (
        <View style={s.미리줄}>
          <Text style={s.판정미리}>
            지금 확정하면 「{판정}」으로 기록됩니다.
          </Text>
          {번역.trim() !== 초벌.trim() ? (
            <Pressable onPress={() => set번역(초벌)} hitSlop={6}>
              <Text style={s.초벌버튼글}>초벌로 되돌리기</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {까닭칸열림 ? (
        <TextInput
          testID={`까닭-${줄.string_id}`}
          value={까닭}
          onChangeText={set까닭}
          placeholder="이 한국어를 왜 못 옮기는지 적어 주세요"
          placeholderTextColor={색.잉크_희미}
          multiline
          style={[s.입력, s.입력_까닭]}
        />
      ) : null}

      {막힘 ? <Text style={s.막힘}>{막힘}</Text> : null}

      <View style={s.버튼줄}>
        <Pressable
          testID={`확정-${줄.string_id}`}
          onPress={() => 보내기(판정)}
          disabled={도는중 || !적음}
          style={({ pressed }) => [s.주버튼, (도는중 || !적음) && s.잠김, pressed && { opacity: 눌림층.버튼 }]}
        >
          {도는중 ? <ActivityIndicator color={색.바탕} /> : <Text style={s.주버튼글}>확정</Text>}
        </Pressable>

        {/* 🔴 이 판정만 사람이 따로 고른다 — 「옮길 수 없다」는 텍스트 비교로 안 나온다.
            한 번 눌러 까닭 칸을 열고, 까닭이 찬 뒤에 보낸다(까닭이 이 판정의 유일한 산출물이다). */}
        <Pressable
          testID={`원문결함-${줄.string_id}`}
          onPress={() => (까닭칸열림 ? 보내기(원문결함) : set까닭칸열림(true))}
          disabled={도는중}
          style={({ pressed }) => [s.곁버튼, 도는중 && s.잠김, pressed && { opacity: 눌림감.글 }]}
        >
          <Text style={s.곁버튼글}>{까닭칸열림 ? '원문 결함으로 보내기' : 원문결함}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  말림: { flex: 1, backgroundColor: 색.바탕 },
  속: { padding: 20, paddingTop: 64, paddingBottom: 56, gap: 14 },

  라벨: { fontFamily: 폰트.모노, fontSize: 11, letterSpacing: 모노트래킹.라벨, color: 색.잉크_태그 },
  제목: { fontFamily: 폰트.헤드, fontSize: 24, color: 색.잉크 },
  머리말: { fontFamily: 폰트.캡션, fontSize: 13, lineHeight: 20, color: 색.잉크_보조, marginBottom: 4 },

  셈줄: { flexDirection: 'row', gap: 10 },
  셈: { flex: 1, backgroundColor: 색.바탕띄움, borderRadius: 12, padding: 12, gap: 4 },
  셈이름: { fontFamily: 폰트.캡션, fontSize: 12, color: 색.잉크_메타 },
  셈값: { fontFamily: 폰트.모노, fontSize: 20, color: 색.잉크 },

  오류: { fontFamily: 폰트.강조, fontSize: 13, lineHeight: 19, color: 색.신호 },

  카드: { backgroundColor: 색.바탕띄움, borderRadius: 16, padding: 16, gap: 10 },
  카드머리: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  // string_id 는 로마자·숫자·구분자뿐이라 DM Mono 의 글리프 안이다.
  id: { fontFamily: 폰트.모노, fontSize: 11, color: 색.잉크_메타 },
  예산: { fontFamily: 폰트.모노, fontSize: 11, color: 색.잉크_메타 },
  예산_넘침: { color: 색.신호_보조 },

  원문: { fontFamily: 폰트.강조, fontSize: 17, lineHeight: 26, color: 색.잉크 },
  맥락: { fontFamily: 폰트.캡션, fontSize: 12, lineHeight: 19, color: 색.잉크_보조 },

  입력: {
    backgroundColor: 색.바탕,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 색.잉크_희미,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 56,
    color: 색.잉크,
  },
  입력_넘침: { borderColor: 색.신호_보조 },
  // 까닭은 한국어로 적는 칸이라 킷 폰트를 쓴다(몽골어 칸과 다른 이유가 이것이다).
  입력_까닭: { fontFamily: 폰트.본문, fontSize: 14, lineHeight: 21 },
  넘침글: { fontFamily: 폰트.캡션, fontSize: 12, lineHeight: 18, color: 색.신호_보조 },

  판정미리: { fontFamily: 폰트.캡션, fontSize: 12, color: 색.잉크_메타 },
  미리줄: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  초벌버튼글: { fontFamily: 폰트.본문, fontSize: 12, color: 색.잉크_서브 },
  막힘: { fontFamily: 폰트.강조, fontSize: 13, lineHeight: 19, color: 색.신호 },

  버튼줄: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  /* 🚫 코랄 면을 안 쓴다 — 코랄 위 흰 글자가 킷에서 대비 미달이고(`인증화면.js` 머리말),
     이 화면의 신호 1점은 「넘쳤다·막혔다」쪽이다. */
  주버튼: {
    backgroundColor: 색.잉크, borderRadius: 12, height: 46, paddingHorizontal: 26,
    alignItems: 'center', justifyContent: 'center',
  },
  주버튼글: { fontFamily: 폰트.강조, fontSize: 15, color: 색.바탕 },
  곁버튼: { paddingVertical: 10 },
  곁버튼글: { fontFamily: 폰트.본문, fontSize: 13, color: 색.잉크_보조 },
  잠김: { opacity: 눌림층.잠김 },

  빈자리: { backgroundColor: 색.바탕띄움, borderRadius: 16, padding: 20, gap: 6 },
  빈글: { fontFamily: 폰트.강조, fontSize: 15, color: 색.잉크 },
  빈꼬리: { fontFamily: 폰트.캡션, fontSize: 12, lineHeight: 19, color: 색.잉크_보조 },

  더: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 20 },
  더글: { fontFamily: 폰트.본문, fontSize: 14, color: 색.잉크_서브 },
  뒤로: { alignSelf: 'center', paddingTop: 8 },
  뒤로글: { fontFamily: 폰트.본문, fontSize: 14, color: 색.잉크_보조 },
});
