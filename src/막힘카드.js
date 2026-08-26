'use strict';
/**
 * 막힘 카드 — 오늘 할 것이 **없는 게 아니라 막힌** 학생이 읽는 자리 (F176 ① · C0 §4-3).
 *
 * ■ 이 파일이 닫는 것
 *   `GET /v1/tasks` 는 동의가 없는 학생에게 `data: []` 를 준다(P0 §345 — `deliver` 가 배정을
 *   안 만든다). 배치가 안 돈 날도 똑같이 빈다. 원인이 둘인데 화면이 하나뿐이라 학생은
 *   「오늘 받은 과제가 아직 없어요」만 보고 **며칠이든 기다린다.** 그 상태를 끝낸다.
 *
 * ■ 🔑 이 카드가 하는 일은 **다음 한 걸음을 주는 것** 하나다
 *   학생이 할 수 있는 일이 「선생님께 학생번호를 보여 주기」라서, 화면의 주인공은 그 번호다.
 *   문장은 여기 없다 — 정본은 `contents/문구_동의.js` 고 이 파일은 배치만 한다.
 *
 * ■ 🚫 「동의하기」 버튼을 두지 않는다 (P0 §239 · S1)
 *   S1 에서 앱은 **확인만** 한다 — 동의는 상담 자리에서 대면으로 받고 운영자가
 *   `tools/동의발급.js` 로 옮겨 적는다. 지금 버튼을 두면 근거 없는 동의가 쌓인다.
 *   그 버튼이 서는 것은 파일럿(2027-02 · P0 §240)이고, 선행 조건이 **둘** 남았다:
 *   몽골어 검수 · **Inter Tight cyrillic-ext 탑재**.
 *   (문안 A-10 은 ✅ 종결 — 유호님 D6 `docs/동의_문구_v1.md`.)
 *
 * ■ 디자인 (`테마.js` R1)
 *   이 화면의 신호 1점은 **녹음 버튼**이다 — 여기엔 코랄을 쓰지 않는다. 위계는 밀도로 준다.
 */
import { StyleSheet, Text, View } from 'react-native';
import { 색, 폰트, 모노트래킹, 몽골어폰트 } from './테마';
import { 막힘안내 } from '../contents/문구_동의.js';

/**
 * @param {{막힘: {code: string}|null, 학생번호?: string|null}} props
 *   `막힘` = `오늘과제받기()` 가 실어 온 `blocked`. 없으면 **아무것도 그리지 않는다** —
 *   막히지 않은 학생의 화면에 빈 카드가 서면 그게 더 큰 오해다.
 */
export default function 막힘카드({ 막힘, 학생번호 = null }) {
  const 안 = 막힘안내(막힘);
  if (!안) return null;

  return (
    <View style={s.카드}>
      {안.제목.map((줄, i) => (
        <Text key={`제목${i}`} style={i === 0 ? s.제목 : s.제목_병기}>{줄}</Text>
      ))}
      {안.본문.map((줄, i) => (
        <Text key={`본문${i}`} style={i === 0 ? s.본문 : s.본문_병기}>{줄}</Text>
      ))}

      {안.보여줄값 === '학생번호' && 학생번호 ? (
        <View style={s.번호칸}>
          <Text style={s.번호라벨}>STUDENT ID</Text>
          {/* 선생님이 명단에서 찾을 값이다 — 크게, 그리고 복사할 수 있게. */}
          <Text style={s.번호} selectable>{학생번호}</Text>
        </View>
      ) : null}

      {/* 🔴 모르는 코드를 「괜찮다」로 접지 않는다 — 서버가 새 코드를 내는 날, 이 한 줄이
          없으면 우리도 학생도 무엇이 막았는지 모른 채 일반 문구만 본다. */}
      {안.아는코드 ? null : <Text style={s.메모}>{안.코드}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  카드: { backgroundColor: 색.바탕띄움, borderRadius: 20, padding: 22, gap: 14 },
  제목: { fontFamily: 폰트.헤드, fontSize: 21, lineHeight: 31, color: 색.잉크 },
  본문: { fontFamily: 폰트.본문, fontSize: 16, lineHeight: 26, color: 색.잉크_서브 },
  /* 몽골어 병기 줄 — 한 단계 내린다(같은 뜻의 두 번째 목소리다). 지금은 `mn` 이 비어 있어
     이 자리가 안 그려진다. 번역·폰트가 오는 날 `문구_동의.js` 의 `mn` 만 채우면 선다. */
  /* 🔴 **몽골어 줄이다** — 킷 한글 폰트(SUIT)를 박으면 키릴 자형이 없어 두부(□□□)가 된다.
     08-27 까지 여기가 `폰트.강조`·`폰트.캡션` 이었다: 몽골어가 아직 안 와서 증상이 없었을 뿐,
     오는 날 이 화면만 깨졌을 자리다(`테마.몽골어` 머리말이 예고한 바로 그 새는 자리). */
  제목_병기: { fontFamily: 몽골어폰트.강조, fontSize: 17, lineHeight: 26, color: 색.잉크_서브 },
  본문_병기: { fontFamily: 몽골어폰트.캡션, fontSize: 15, lineHeight: 24, color: 색.잉크_메타 },

  번호칸: { alignItems: 'center', gap: 6, paddingVertical: 12 },
  번호라벨: { fontFamily: 폰트.모노, fontSize: 11, letterSpacing: 모노트래킹.라벨, color: 색.잉크_태그 },
  /* DM Mono — 학생번호는 로마자 + 숫자뿐이라 이 폰트의 글리프 안이다(`테마.js`). */
  번호: { fontFamily: 폰트.모노, fontSize: 34, letterSpacing: 모노트래킹.타이머, color: 색.잉크 },

  메모: { fontFamily: 폰트.모노, fontSize: 11, letterSpacing: 모노트래킹.라벨, color: 색.잉크_보조 },
});
