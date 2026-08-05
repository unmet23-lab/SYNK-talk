# C0 API 계약 — 앱↔서버 인터페이스 (초안 v1)

> **자리**: 개발 분업 §2의 **C0**. 기반(F0·C0)은 **한 번만** 만들고 그 뒤 기능마다 반복하는 그 「한 번」이다.
> **담당** = 클로드 초안 · **동결** = **Codex 소비자 승인 + §7 왕복 6 통과** · **DB 정본** = `docs/L0_데이터계약.md` · **필드 정본** = `계약/수집_교정_계약.json`.
> **⚠ 아직 초안이다.** 승인 전에는 이 문서를 근거로 화면을 만들지 않는다(만들면 승인이 형식이 된다).

## 0. 세 계약의 경계 — 무엇을 어디서 찾나

| 묻는 것 | 정본 | 여기서 하는 일 |
|---|---|---|
| 무엇이 **필수 필드**인가 · 값목록 | `계약/수집_교정_계약.json`(c3) | **참조만.** 값을 복사하지 않는다 |
| DB에 **어떤 모양**으로 앉나 · 권한 | `docs/L0_데이터계약.md` | 참조만 |
| 앱이 **무엇을 보내고 받나** | **이 문서** | 정한다 |

⚠ **C0와 L0를 1:1로 만들지 않는다**(L0 §0). 1:1이면 DB 구조가 API로 새서 나중에 테이블을 못 바꾼다. 잇는 자리는 **Edge Function 한 층**이다.

🔴 **값목록을 이 문서에 복사하지 않는다.** c1→c3에서 두 문서가 실제로 갈라졌고(이름 4건) 그 사고를 다시 사지 않는다. 아래 예시에 박힌 값은 **회귀가 계약 파일과 대조**한다(`tests/계약.test.js`).

## 1. 통로 — 앱은 DB를 직접 만지지 않는다

```
[Expo 앱] ──JWT──> [Edge Function] ──service_role──> [Postgres engine.*]
                        └ 값목록·payload·동의 검증이 여기 한 곳에만 있다
```

- **쓰기는 전부 Edge Function**을 지난다(L0 §4-3). 학생 토큰에는 쓰기 정책이 아예 없다.
- **조회도 Edge Function**이다 — `engine` 스키마는 지금 **API에 노출돼 있지 않다**(L0 §4-3). 앱이 `supabase.from('learning_events')`를 부르면 실패한다. **Codex는 이 경로를 쓰지 않는다.**
- 예외 하나: **인증**과 **Storage 업로드**는 Supabase SDK를 직접 쓴다(§2·§4-2).
- 경로 매핑: `POST /v1/events` = Edge Function 이름 `events` → 실제 URL `https://<project>.supabase.co/functions/v1/events`.

## 2. 인증 — 토큰을 얻고 싣는 법

로그인 자체는 우리 API가 아니라 **Supabase Auth**다(L0 §4-2 확정 — 유호님 "학원 발급 코드로 가자").

1. 학생이 **학원 발급 코드**(예 `K7M4-P2X9`)를 입력한다. ⚠ `student_code`(`SYNK-001`)와 **다른 비밀**이다.
2. 앱이 코드를 **정규화**한 뒤 `signInWithPassword({ email: 소문자(코드)+'@synk.invalid', password: 정규화된_코드 })` **1회**.
   - **정규화 = ①공백·하이픈 제거 ②대문자화.** 🔴 코드는 학생에게 `K7M4-P2X9`로 **보이지만** 그 하이픈은 읽기 편하라고 넣은 것이다. 앱이 하이픈을 남긴 채 비밀번호로 쓰고 발급 도구는 빼고 만들었다면 **모든 로그인이 실패**하고, 반대로 갈리면 **일부만** 실패한다. 붙여넣기로 들어오는 공백도 같은 자리다.
   - 🔑 정규화 규칙의 정본은 L0 §4-2이고 **앱과 발급 도구가 같은 함수를 공유한다** — 두 곳에 적으면 갈라진다. 증상은 「어떤 학생만 로그인이 안 됨」이라 원인을 찾는 데 가장 오래 걸리는 종류다.
3. 앱은 `signUp`을 **절대 부르지 않는다**(계정은 학원이 미리 만든다).
4. 이후 모든 호출은 supabase-js `functions.invoke()`로 — 세션 토큰이 자동으로 실린다. 직접 `fetch`하면 `Authorization: Bearer <access_token>`과 `apikey: <anon key>`를 **둘 다** 넣어야 한다.

🔴 **앱은 자기가 누구인지 요청 본문에 적지 않는다.** `learner_id`·`student_code`를 보내면 **400**이다. 서버는 항상 **토큰에서** 학생을 확정한다 — `service_role`은 RLS를 우회하므로, 본문의 학생을 믿는 순간 RLS가 있어도 남의 데이터를 쓴다(L0 §4-3 경고).

## 3. 공통 봉투

**요청 헤더**

| 헤더 | 예 | 없으면 |
|---|---|---|
| `Authorization` | `Bearer <access_token>` | 401 `AUTH_REQUIRED` |
| `X-Contract-Ver` | `c3` | 400 `CONTRACT_VER_MISSING` |
| `X-App-Ver` | `0.3.1 (42)` | 통과(로그용) |

**응답 봉투 — 성공**

```json
{ "ok": true, "contract_ver": "c3", "results": [ ... ] }
```

**응답 봉투 — 요청 전체 실패**

```json
{ "ok": false, "contract_ver": "c3",
  "error": { "code": "AUTH_EXPIRED", "message": "토큰이 만료됐습니다", "retryable": true } }
```

- 시각은 전부 **ISO 8601 UTC**(`2026-08-05T13:20:11.412Z`). `occurred_at`=앱이 관찰한 발생 시각, `ingested_at`=서버 수신 시각(서버가 채운다).
- ⚠ **기기 시계는 못 믿는다.** `occurred_at`이 미래여도 **거부하지 않는다**(거부하면 학생이 시계를 잘못 맞춘 날의 학습이 통째로 사라진다). 서버는 그대로 저장하고 **로그에만** 남긴다 — 컬럼을 늘리지 않는다.

## 4. 엔드포인트

지금 만드는 것은 **둘**이다. 화면이 정해지지 않은 API를 먼저 동결하면 **쓰이지 않는 계약**이 굳는다(§10).

### 4-1. `POST /v1/events` — 유일한 쓰기 통로

모든 기능이 여기로 들어온다(「모든 버튼이 학습이 되게」). **배치**이며 **멱등**이다.

**요청**

```json
{
  "events": [
    {
      "idempotency_key": "b6f1c0a2-…",
      "event_type": "submission.created",
      "task_type": "숙제제출",
      "occurred_at": "2026-08-05T13:20:11.412Z",
      "correlation_id": "1f0c…",
      "session_id": "9a22…",
      "content_id": "c-hw-0031",
      "skill_ids": ["skill-ko-grammar-particle-topic"],
      "level_snapshot": "Lv3",
      "payload": { "ver": 1, "attempt_no": 1 },
      "submission": {
        "task_ref": "hw-2026-08-05-3",
        "task_snapshot": { "지시문": "…", "문항": "…", "보기": ["…"], "정답": "…" },
        "task_schema_ver": "hw.v1",
        "body_original": "어제 친구를 만나서 밥을 먹었어요",
        "audio_ref": null
      }
    }
  ]
}
```

**누가 무엇을 채우나** — 앱이 서버 칸을 보내면 **400**(조용히 덮어쓰면 위조가 통과처럼 보인다).

| 서버가 채운다 | 왜 |
|---|---|
| `event_id`·`ingested_at` | 서버 채번·서버 시계 |
| `learner_id` | **토큰에서**(§2) |
| `consent_ver` | 위조 방지 + `occurred_at` 시점의 **유효한 동의**로 확정(L0 §3-6). 유효 동의가 없으면 저장하지 않는다 |
| `schema_ver` | 계약 파일 버전을 **저장 시 자동 기입**(A-8 · 유호님 확정) |
| `model`·`prompt_ver`·`intervention_id`·`degraded` | AI 호출이 서버에서 나므로 앱은 알 수 없다 |
| `source_kind`·`estimator_*` | 추정 메타 — 추정하는 쪽이 적는다 |

| 앱이 반드시 채운다 | 왜 |
|---|---|
| `idempotency_key` | UUID v4. 🔴 **이벤트를 만들 때 한 번 생성하고 재시도해도 바꾸지 않는다** — 재시도마다 새로 만들면 멱등이 통째로 죽고, 증상은 오프라인에서 돌아온 학생의 기록이 **여러 벌** 쌓이는 것이다 |
| `event_type` | 계약 값목록 |
| `occurred_at` | 서버 수신 시각과 **다르다**(오프라인) |
| `level_snapshot` | 🔑 **앱이 보낸다.** 3일 전 오프라인 제출을 오늘 올리면 서버의 현재 급수는 **그때 급수가 아니다.** 급수 이력 테이블은 만들지 않는다(파생 선행 구축 금지) — 그때 화면이 알던 값을 그때 적는 것이 유일하게 정확하다. 빠지면 400 |
| `task_type` | 값은 계약 값목록. **어느 이벤트에 필수인지는 payload 검증 스키마가 이벤트별로 정한다**(F0 Zod · §4-1 아래) — 여기 이벤트별 표를 적으면 검증 로직과 두 벌이 되어 갈라진다 |

**payload 규격**

- `payload.ver`(정수) **필수**. 모양이 바뀌면 `2`로 올리고 과거 행은 `1`로 남는다.
  > 🔑 **이벤트 이름에 `.v1`을 붙이지 않는다**(L0 §3-2 표기 정정 요청 · §9). 이름에 붙이면 값목록이 payload 개정마다 배로 늘고, 집계가 `like 'choice.selected%'`가 된다. `payload.ver`는 **컬럼도 값목록도 늘리지 않는다.**
- payload 필드 이름도 **c3 필드 목록에서 고른다**(`confidence`·`attempt_no`·`learner_response`·`options_shown`·`position`·`recommended_option`·`selected_option`·`changed_selection`·`latency_ms`·`skipped`). 목록에 없는 이름이 필요하면 **c4 개정**이지 자유 추가가 아니다.
- 🔴 **`is_correct`(정답여부)를 만들지 않는다.** `submission.body_original`(고른 답) + `task_snapshot.정답`이 있으면 채점은 **언제든 다시 계산되는 파생**이다. 원본을 두고 파생을 저장하면 채점 규칙이 바뀌는 날 과거가 거짓말을 한다.
- 빈 껍데기 방지: `event_type`이 요구하는 payload가 비면 **저장하지 않는다**(L0 §3-2 두 층 검증). 검증은 이 함수 한 곳에만 있다.

**응답**

```json
{ "ok": true, "contract_ver": "c3",
  "results": [
    { "idempotency_key": "b6f1…", "status": "stored",    "event_id": "3c9e…" },
    { "idempotency_key": "77a2…", "status": "duplicate", "event_id": "1b40…" },
    { "idempotency_key": "e551…", "status": "rejected",
      "error": { "code": "CONTRACT_VIOLATION", "field": "event_type",
                 "message": "값목록에 없는 event_type", "retryable": false } }
  ] }
```

- **`duplicate`는 오류가 아니다** — 같은 `(학생, idempotency_key)` 재전송은 **200 + 원래 `event_id`**. 오류로 주면 큐가 영원히 재시도한다.
- 🔑 **부분 실패는 HTTP 200이다.** 한 건이 영구 실패인데 배치 전체를 4xx로 돌려주면 **그 한 건이 큐 맨 앞에서 나머지를 영원히 막는다**(head-of-line blocking). 전건 실패 사유(인증·계약 버전)만 4xx.
- 앱은 `status`가 `stored`·`duplicate`인 항목만 로컬 큐에서 지운다. `rejected`는 **격리 보관** 후 보고(사용자에게는 조용히).
- 상한: **100건 / 1MB**. 넘으면 413. *(임의값 — S1 실측으로 조정한다)*

### 4-2. `POST /v1/uploads/sign` — 음성·이미지

발화 과업(`발화녹음`·`출석발화`)의 원본은 **Storage 비공개 버킷**에 있고, 이벤트에는 참조만 실린다.

```json
요청  { "kind": "audio", "content_type": "audio/m4a", "byte_size": 482913 }
응답  { "ok": true, "contract_ver": "c3",
        "upload_url": "https://…", "audio_ref": "voice/2026/08/3c9e….m4a",
        "expires_at": "2026-08-05T13:35:00.000Z" }
```

**순서**: ①서명 받기 → ②Storage에 직접 PUT → ③성공하면 `audio_ref`를 `submission`에 실어 `/v1/events`.

- 🔑 **업로드 성공 뒤에 이벤트를 보낸다.** 반대로 하면 참조가 가리키는 파일이 없는 행이 남고, 그건 나중에 「전사 실패」와 구분되지 않는다.
- 오프라인이면 로컬 파일을 큐에 두고 복귀 시 ①②③을 그대로 밟는다.
- 서버가 `content_type`·`byte_size`를 검증한다(상한 **25MB**, 임의값). 음성은 **보존 무제한**(유호님 확정)이라 용량 실수의 비용이 **영구적**이다.
- 재생은 조회용 서명 URL로 — 버킷은 공개하지 않는다.

### 4-3. 조회 — S1에서 정한다 (지금은 형태만)

어떤 화면이 무엇을 읽을지는 P0/S1이 정한다. 지금 정하는 것은 **모양뿐**이고, 실제 엔드포인트는 첫 화면과 함께 추가한다.

- 경로 `GET /v1/<복수명>` · 응답 봉투는 §3과 같고 `results` 대신 `data` + `next_cursor`.
- **커서 기반**(offset 금지 — append-only라 페이지가 밀린다).
- 자기 것만 — 서버가 토큰에서 학생을 확정한다. 쿼리로 학생을 지정할 수 없다.

## 5. 오류 규격

```json
{ "code": "CONSENT_MISSING", "message": "사람이 읽는 한국어 한 문장",
  "field": "consent_ver", "retryable": false }
```

| code | HTTP | 재시도 | 앱이 할 일 |
|---|---|---|---|
| `AUTH_REQUIRED` | 401 | ✗ | 로그인 화면 |
| `AUTH_EXPIRED` | 401 | ✓ **1회** | 토큰 갱신 후 재전송. 또 실패하면 로그인 화면 |
| `CONSENT_MISSING` | 409 | ✗ | 동의 화면. **이벤트는 로컬에 보관**하고 동의 후 재전송 — 학생이 거부하면 **파기** |
| `CONTRACT_VIOLATION` | 400 | ✗ | 그 항목만 격리 + 개발자 보고. 값목록·필수 필드 위반 |
| `PAYLOAD_INVALID` | 400 | ✗ | 〃 (payload 모양) |
| `CONTRACT_VER_MISSING` | 400 | ✗ | 헤더 누락 — 앱 버그 |
| `CONTRACT_VER_UNSUPPORTED` | 426 | ✗ | 업데이트 안내 |
| `PAYLOAD_TOO_LARGE` | 413 | ✗ | 배치를 쪼개 재전송 |
| `RATE_LIMITED` | 429 | ✓ | `Retry-After` 만큼 대기 |
| `SERVER_ERROR` | 5xx | ✓ | 지수 백오프(최대 6회, 상한 15분) |
| (네트워크 실패) | — | ✓ | 큐 유지 |

🔑 **`retryable`이 계약에 없으면 앱은 영구 오류를 무한 재시도한다** — 배터리·쿼터·서버가 같이 탄다. 반대로 일시 오류를 버리면 학습이 사라진다. **판단을 앱에 맡기지 않고 서버가 말한다.**

🔑 **`message`는 사람이 읽는 문장이고 분기 조건이 아니다.** 앱은 **`code`로만** 분기한다(문구는 몽골어 번역·다듬기로 계속 바뀐다).

## 6. 버전 정책

| 축 | 무엇 | 규칙 |
|---|---|---|
| `api_ver` | URL `/v1` | **깨는 변경만** 올린다. 올리면 구 버전을 최소 1개 릴리스 주기 병행 |
| `contract_ver` | `c3`… | 앱이 헤더로 알리고 서버가 응답에 자기 것을 싣는다 |
| `payload.ver` | 정수 | 이벤트별 payload 모양 (§4-1) |

- **값목록 추가는 하위호환이다** — 구 앱은 새 값을 안 보낼 뿐 계속 작동한다. **이름 변경·삭제는 금지**(과거 집계가 깨진다 · c3 `값목록_규칙` 승계).
- 새 **필수** 필드가 생기면: 서버가 그 값을 유추할 수 있으면 유추하고, **없을 때만** `CONTRACT_VER_UNSUPPORTED`로 앱 업데이트를 요구한다. 필수 필드 추가마다 구 앱을 끊으면 앱 심사 지연이 곧 데이터 구멍이 된다.
- Codex는 **화면 편의를 위해 승인 없이 이 계약을 바꾸지 않는다**(분업 §3). 변경은 C0 개정 절차로.

## 7. 왕복 테스트 6 — **이것이 동결 판정이다**

문서 승인이 아니라 **통과가 동결**이다. F0의 Mock 서버를 대상으로 앱이 다음을 통과한다.

| # | 시나리오 | 통과 기준 |
|---|---|---|
| 1 | 정상 1건 | `event_id` 수신 · 로컬 큐에서 제거 |
| 2 | 같은 `idempotency_key` 재전송 | `duplicate` · **저장 1건** · 앱이 오류로 취급하지 않는다 |
| 3 | 위반 1건 + 정상 2건 배치 | 정상 2건 저장 · 위반 1건만 격리 · **큐가 막히지 않는다** |
| 4 | 오프라인 5건 축적 후 복귀 | 전건 저장 · 각 `occurred_at` 보존(수신 시각으로 덮이지 않는다) |
| 5 | 동의 없음 | `CONSENT_MISSING` · 로컬 보관 · 동의 후 재전송 성공 |
| 6 | 토큰 만료 | 갱신 후 1회 재시도로 성공 · 무한 루프 없음 |

⚠ **2·3·4는 「되는지」가 아니라 「안 되면 데이터가 사라지는지」를 본다** — 통과 기준을 화면 동작이 아니라 **저장된 행 수**로 판정한다.

## 8. 동결 조건

1. **Codex 소비자 승인** — 발주서 검수 4문(분업 §4): ①입출력이 구체적인가 ②빈 값·중복·네트워크 실패가 정의됐는가 ③완료 기준을 테스트로 판정할 수 있는가 ④모바일에서 구현 불가능하거나 모순된 요구가 없는가.
2. **§7 왕복 6 통과**(Mock).
3. ~~**c4 판정 3건**(§9)~~ — ✅ **2026-08-06 c4 개정 완료**(계약 9종 + DDL `_c4` + 양쪽 회귀 · §9).
4. ~~Supabase 프로젝트~~ ✅ · ~~학생 로그인 방식~~ ✅ (유호님 08-05 · L0 §7).

## 9. ~~열린 판정~~ → ✅ c4 개정 완료 (2026-08-06)

> **실행됨** — 아래 실행 목록 1~4 전부. 계약 `버전: c4` · `event_type` 9종 · 양 저장소 동일 바이트(`tools/계약동기화.js`) · DDL 제약 `_c3`→`_c4` · 회귀 3벌 초록. **함께 낸 자리 4**(코어엔진 §9 빈 곳 ①⑤ — S1 전 필요한 원본 고리): `task_snapshot`(c3에 없어 `task_ref`가 겸하던 것) · `selection_reason` · `rejected_all` · `cited_refs`.
> 🔴 **남은 것은 DB 적용뿐이다** — 파일이 c4여도 이미 c3가 선 DB는 재실행으로 안 바뀐다(`create table if not exists`). L0 §8 기준선 마이그레이션에서 확인 ④가 판정한다.

**c4 개정 3건**(완료) — 값목록에 **추가**(추가는 하위호환 · §6). 근거는 L0 §3-2·§6-1.

| 값 | 왜 필요한가 |
|---|---|
| `intervention.delivered` | AI가 **무엇을 했는지**. 없으면 `intervention_id`가 가리킬 내용이 없어 「무엇이 효과 있었나」를 영원히 못 묻는다 |
| `correction.viewed` | 학생이 교정을 **봤다**(채택 여부는 기존 `correction.responded`) |
| `data_use.granted` | 훈련 데이터 승격을 **행의 신분이 아니라 사건으로** 기록(L0 §6-2 · 코어엔진 A-10 정정) |

**c4를 지금 올리지 않은 이유 — 한 번에 같이 가야 한다.** 값목록은 계약 파일에만 있는 게 아니라
`supabase/L0_스키마.sql`의 `CHECK`에도 있고, 그 제약은 **이름에 버전이 박혀 있다**(`..._c3`).
계약만 올리면 **서버는 새 값을 보내고 DB가 조용히 거절한다.** 그 SQL은 지금 다른 세션의 작업본이다.

**c4 실행 목록**(그 레인이 커밋되면 한 패스로 — 순서대로):

1. `계약/수집_교정_계약.json` — `버전` `c3`→`c4` · `값목록.event_type`에 3종 추가 · `c4에서_바뀐_것` 기술 ·
   `보류_유호확정대기.privacy_class` 문구를 「해소(열 없음)」로 정리.
2. **`node tools/계약동기화.js`** 로 형제 저장소에 같은 바이트로 넣는다(🚫손복사).
3. `supabase/L0_스키마.sql` — CHECK 값 3종 추가 + 제약 이름 `_c3`→`_c4`.
   🔴 **`create table if not exists`로는 제약이 안 바뀐다.** 유호님이 이미 붙여넣은 뒤라면 그 문장은
   테이블이 있다는 이유로 통째로 건너뛰고, **스크립트는 성공한 것처럼 끝난다**(조용한 미적용은
   「통과」와 같은 모양이다). 그래서 값이 바뀌는 개정은 **명시적 ALTER**로 간다:
   ```sql
   alter table engine.learning_events drop constraint if exists learning_events_event_type_c3;
   alter table engine.learning_events add  constraint learning_events_event_type_c4 check (...);
   ```
   ⚠ **적용 여부를 모르는 채로 고치지 않는다** — 붙여넣기가 진행 중일 수 있다. 먼저 확인 쿼리로
   현재 제약 이름을 읽고(`select conname from pg_constraint where conrelid='engine.learning_events'::regclass`)
   그 결과에 맞춰 간다.
4. 양쪽 회귀: `tests/L0스키마.test.js`(제약 이름) · `tests/C0계약.test.js` · SYNK-appsscript `tests/계약.test.js`.
5. 양쪽 CI 초록 확인 후 push.

⚠ **값 추가는 하위호환이라 구 앱은 안 깨진다**(§6). 깨지는 것은 DDL을 빠뜨렸을 때뿐이다.

**L0 레인에 요청 2건** — ✅ **둘 다 반영**(2026-08-06 · 그 레인이 커밋돼 손댈 수 있게 됐다):
- §3-2의 payload 버전 표기 `choice.selected.v1` → **`payload.ver`로 정정**(근거 §4-1). ✅
- c3 `보류_유호확정대기.privacy_class` — 「보류·확정 대기」가 아니라 **유호님 기각이 이미 확정**이었다. 목록 이름을 역할대로 `필드로_만들지_않는다`로 고치고 문구를 해소로 정리(회귀도 함께). ✅

## 10. 지금 안 만드는 것 — 그리고 언제 만드나

| 안 만드는 것 | 만드는 때 |
|---|---|
| 조회 엔드포인트 실물 | S1 화면이 정해질 때(§4-3에 모양만) |
| 푸시 토큰 등록 | 알림 기능을 붙일 때 |
| 실시간 구독 | 실시간이 필요한 화면이 생길 때 |
| 삭제·철회 API | A-6 철회 절차를 배선할 때(지금은 운영이 수동) |
| 관리자 API(코드 발급·재발급) | 발급 도구를 만들 때 — **앱과 같은 통로에 두지 않는다** |
| 학생 계정 생성(`signUp`) | **영원히 안 만든다** — 계정은 학원이 만든다(L0 §4-2) |

---

관련: `docs/L0_데이터계약.md` · `docs/개발_분업.md` §2·§3 · `계약/수집_교정_계약.json` ·
SYNK-appsscript `docs/코어엔진_설계.md` §10·부록 A-2 · memory `m0-contract-freeze-2026-08-05`
