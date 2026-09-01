#!/usr/bin/env bash
# 라디오24 송출 — 사전 인코딩 팩을 -c copy 로 유튜브에 민다 (설계 §5-P1 · §7-7 확정)
#
# 사용:  bash 송출.sh <팩폴더>     (팩폴더에 playlist.txt 가 있어야 한다)
#   스트림 키는 같은 폴더 .env 의 YOUTUBE_STREAM_KEY — 인자·유닛 파일에 박지 않는다(셸 이력·ps 노출).
#
# ⛔ 이 스크립트가 도는 순간이 «송출 개시»다. systemd(radio-stream.service)가 부르는 실행이
#   정본이고, 손 실행은 시운전(P6)에서만. 구 게이트 「채널 분리 판정 ⏸유호님」은 09-01 에 닫혔다
#   (SYNK LAB @synkkorean) — 지금 남은 것은 라이브 액세스·스트림 키·VPS 셋이다.
#
# ✅ 2026-09-02 실측 — `-stream_loop -1` + `-c copy` 의 «이음매»를 재봤다.
#   16초 팩(시티팝 8s + 차분 8s)을 이 인자 그대로 50초 돌렸다 = 반복 3회 이상 · 트랙 경계 6회 이상.
#   **경고 0줄**(Non-monotonous DTS 없음) · 길이 50.17s · 2바퀴째 t=20s 는 시티팝 그림,
#   3바퀴째 t=44s 는 차분 그림이었다 ⇒ 무한 반복 뒤에도 장르별 화면 교대가 산다.
#   🔑 이게 되는 까닭이 «.ts 를 고른 이유»다 — mp4 였으면 되감긴 타임스탬프가 여기서 터진다.
# ⚠ 변수명이 영어인 이유: bash 는 비ASCII 식별자를 못 받는다(인코딩.sh 와 같은 실측).
set -euo pipefail

PACK=${1:?팩 폴더를 달라}
HERE="$(cd "$(dirname "$0")" && pwd)"

[ -f "$PACK/playlist.txt" ] || { echo "[송출] playlist.txt 가 없다 — 재생목록.js 먼저" >&2; exit 2; }

# .env 에서 키만 읽는다(export 전체 금지 — 다른 비밀이 자식 환경에 새는 통로가 된다).
KEY=$(grep -m1 '^YOUTUBE_STREAM_KEY=' "$HERE/.env" 2>/dev/null | cut -d= -f2- || true)
[ -n "${KEY:-}" ] || { echo "[송출] $HERE/.env 에 YOUTUBE_STREAM_KEY 가 없다" >&2; exit 2; }

# -re: 실시간 속도 · -stream_loop -1: 목록 무한 반복 · -c copy: 재인코딩 0(CPU ≈ 0, $6 VPS 전제)
# 끊김 복구는 ffmpeg 가 아니라 systemd Restart=always 몫이다(§6-5 — 프로세스는 깨끗이 죽는 게 낫다).
exec ffmpeg -hide_banner -loglevel warning \
  -re -f concat -safe 0 -stream_loop -1 -i "$PACK/playlist.txt" \
  -c copy -f flv "rtmp://a.rtmp.youtube.com/live2/${KEY}"
