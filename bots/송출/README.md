# 라디오24 송출층 — VPS 준비물 (P1 · 설계 §5-P1 승계)

> **⏳ 09-02 22:21 KST 부터 켤 수 있다.** 채널 분리 판정은 09-01 에 닫혔고(SYNK LAB · @synkkorean),
> 남은 것은 유튜브 «라이브 액세스 24시간»뿐이다. VPS 결제·서버 개설은 「P0 완료 후 송출 직전 + 실행 직전 재보고」가
> 유호님 확정(§7-6)이다. 이 디렉터리는 그 날 **한 번에 서게** 준비물을 미리 두는 자리다 —
> 여기 있는 것은 전부 코드·문서라 게이트를 건드리지 않는다.

## 확정 스펙 (전부 유호님 판정에서 상속 — 여기서 다시 정하지 않는다)

| 축 | 확정 | 출처 |
|---|---|---|
| 해상도 | **720p 단일 규격 사전 인코딩 + `-c copy` 송출** — 재인코딩·1080p 없음 | §7-7 |
| 음원 | 🔄**자체 생성곡(Lyria 3 Pro)** — 남의 음원 0곡 · 생산 `tools/라디오곡생산.js` | 유호 확정 09-01 (구 §7-4 「무료 라이브러리」를 대체) |
| 곡 물량 | **첫 판은 1시간 분량(방송 판 8벌)** 을 24시간 무한 반복 · 늘리는 것은 목록에 파일만 더한다 | 유호 확정 09-02 |
| 음량·비트레이트 | `lib/곡판규격.js` «방송» 판 하나가 주인 — **−14 LUFS · 192k** · 인코딩.sh 는 다시 안 깎는다 | 09-02 전수조사 수리 |
| 강사 라이브 | **A안** — 별도 방송 + 오버레이 배너(자동 스위칭 계층 없음) | §7-1 |
| 예산 | VPS 월 $6~12 (봇 런타임 포함 ✅승인 08-11) | §7-6 |
| 홍보 링크 | `youtube.com/@채널/live` 영구 링크만(videoId 고정 URL 금지) | §5 봇 신원·수명 |
| 채널 시청자층 | 「아동용 아님」 설정 확인(라이브 채팅이 죽는 자리) | §5-P1 |

## 그날의 순서 (VPS 개설 뒤 — 전부 AI 가 원격으로)

1. **곡 만들기 → 팩 만들기** (로컬 · `ffmpeg` 필요)
   - `node tools/라디오곡생산.js --벌 8 --낼곳 <폴더>` — Lyria 3 Pro 로 방송 판 8벌(≈1시간)을 굽는다.
     3생성을 크로스페이드로 잇고 곡판규격의 **2패스 loudnorm** 으로 −14 LUFS 에 앉힌 뒤,
     `크레딧.md` 에 «결·모델·만든 날»을 **자동으로** 적는다(그 표가 비면 인코딩이 멈춘다 · §6-1).
   - `bash 인코딩.sh <음원폴더> <출력폴더>` — 트랙별 정규화(EBU R128 loudnorm, 밤새 볼륨이
     널뛰면 자습 배경으로 실격) → 720p 정지 화면 + AAC → **송출 규격 .ts** 사전 인코딩.
2. **재생목록 만들기** — `node 재생목록.js <출력폴더>` → `playlist.txt`(ffconcat) 생성.
   시간대 편성(주간/심야 ASMR)은 폴더를 나눠 목록 둘로 — v1 은 단일 목록으로 시작.
3. **송출** — `송출.sh` 가 `-stream_loop -1 -c copy` 로 무한 루프를 민다(재인코딩 0 = CPU 최저).
   스트림 키는 `.env`(`YOUTUBE_STREAM_KEY`)에만 — 유닛 파일·스크립트에 박지 않는다.
4. **systemd 등록** — `radio-stream.service`(송출)·`radio-bot.service`(수집봇) 둘 다
   `Restart=always`. 설치: `sudo cp *.service /etc/systemd/system/ && sudo systemctl enable --now radio-stream radio-bot`.
5. **수집봇** — `bots/라디오수집봇.js` 를 VPS 에 올리고 아래 표대로 환경을 채운다.

### 🔴 `.env` 가 **두 개**다 — 한 곳에 몰면 안 돈다

| 파일 | 누가 읽나 | 든 것 |
|---|---|---|
| `/opt/synk-radio/.env` | **봇** (systemd `EnvironmentFile`) | 아래 표 여덟 칸 |
| `/opt/synk-radio/송출/.env` | **송출.sh** (`$HERE/.env` — 제 폴더 옆만 본다) | `YOUTUBE_STREAM_KEY=…` 한 줄 |

봇은 `.env` 를 **스스로 안 읽는다**(프로세스 env 만) — `EnvironmentFile` 이 없으면 첫 `환경()`에서
exit 1 이고 systemd 가 그것을 5초마다 반복한다. 둘 다 `chmod 600`.

### 봇 환경 여덟 칸 (2026-09-02 소스 실측 — 옛 README·유닛 주석은 이름이 틀렸었다)

| 칸 | 없으면 | 어디서 오나 |
|---|---|---|
| `RADIO_CHANNEL_ID` | exit 1 | ✅ 있다 — `UCmZplYKuNHLPng4iL2AbLLg` |
| `RADIO_YT_CLIENT_ID` | exit 1 | ⏳ OAuth 프로덕션 게시 |
| `RADIO_YT_CLIENT_SECRET` | exit 1 | ⏳ 〃 |
| `RADIO_YT_REFRESH_TOKEN` | exit 1 | ⏳ 〃 ⚠**채널 확정 뒤 그 계정으로** · 앱이 「테스트」면 7일마다 죽는다 |
| `SUPABASE_URL` | exit 1 | 운영 프로젝트 URL — Fn 주소를 여기서 조립한다 |
| `SUPABASE_ANON_KEY` | exit 1 | 비밀 아님(verify_jwt 통과용) |
| `RADIO_INGEST_SECRET` | exit 1 | ✅ 착지 완료 — 로컬 `.env` 의 `RADIO_INGEST_SECRET_PROD` |
| `RADIO_ROUND_SECRET` | **조용히 수집만** 돈다 | ✅ 착지 완료(09-02) — 로컬 `.env` 의 `RADIO_ROUND_SECRET_PROD` |

🚫 옛 이름 `YOUTUBE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN`·`RADIO_INGEST_URL` 은 **봇 소스에 없다**
(`RADIO_INGEST_URL` 은 0회 — URL 은 `SUPABASE_URL` + `/functions/v1/radio-ingest` 로 만든다).
그 이름으로 채우면 봇이 그 자리에서 죽는다.

## 왜 「한 파일 루프」가 아니라 「목록 루프」인가

원안은 긴 믹스 1개를 돌리는 그림이었다. 목록(ffconcat)으로 두면 ①트랙 추가·교체가 파일
1개 단위(재인코딩 없이 목록만 갱신) ②`broadcast_segment` 에 「지금 무엇이 나가나」를 적을
재료(트랙 경계)가 생긴다 — 오버레이 「지금 나오는 곡」(P3)과 §2-A 맥락 축이 같은 재료를 쓴다.

## 이 디렉터리가 안 하는 것

- 오버레이(P3)·Nightbot(P5)·텔레그램 경보(P5)는 각자의 단계 몫.
- OBS·강사 라이브는 A안이라 여기 없다(별도 방송).
