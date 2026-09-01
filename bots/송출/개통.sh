#!/usr/bin/env bash
# 라디오24 VPS 개통 — 준비물을 «재고», 자리에 놓고, systemd 에 올린다. (2026-09-02 신설)
#
# 사용:
#   bash 개통.sh --점검            아무것도 안 바꾸고 «무엇이 모자란가»만 센다(어디서나 돈다)
#   sudo bash 개통.sh --설치       /opt/synk-radio 를 세우고 유닛을 올린다(VPS · root)
#
# ⛔ 이 스크립트는 **송출을 시작하지 않는다.** `radio-stream` 은 enable 만 하고 start 는 안 한다 —
#   첫 화면은 눈으로 확인하고 켠다(유호 확정: 스트림 「자동 시작」도 끔).
#   `radio-bot` 은 --now 로 켠다: 방송이 없으면 물러서며 찾으므로(재발견 물러섬 · 09-02) 안전하다.
#
# ⚠ 변수명이 영어인 이유: bash 는 비ASCII 식별자를 못 받는다(인코딩.sh 와 같은 실측).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
ROOT=/opt/synk-radio
MODE=${1:-}

BOT_KEYS="RADIO_CHANNEL_ID RADIO_YT_CLIENT_ID RADIO_YT_CLIENT_SECRET RADIO_YT_REFRESH_TOKEN SUPABASE_URL SUPABASE_ANON_KEY RADIO_INGEST_SECRET"
BOT_OPTIONAL="RADIO_ROUND_SECRET"

ok=0; bad=0
say_ok()  { echo "  ✅ $1"; ok=$((ok+1)); }
say_bad() { echo "  ❌ $1"; bad=$((bad+1)); }

# .env 에 «이름»이 값과 함께 있는지만 본다 — 값은 절대 찍지 않는다.
has_key() { [ -f "$1" ] && grep -qE "^$2=.+" "$1"; }

check() {
  echo "[개통] 준비물 점검 — 값은 안 찍는다"

  echo " · 프로그램"
  command -v ffmpeg >/dev/null && say_ok "ffmpeg $(ffmpeg -version 2>/dev/null | head -1 | cut -d' ' -f3)" || say_bad "ffmpeg 없음 — apt install ffmpeg"
  command -v node   >/dev/null && say_ok "node $(node -v)" || say_bad "node 없음"

  echo " · 팩 (화면과 소리가 이미 박혀 있는 .ts)"
  if [ -f "$ROOT/팩/playlist.txt" ]; then
    n=$(find "$ROOT/팩" -maxdepth 1 -name '*.ts' | wc -l | tr -d ' ')
    m=$(grep -c "^file " "$ROOT/팩/playlist.txt" || true)
    if [ "$n" = "$m" ] && [ "$n" != "0" ]; then say_ok "팩 $n 벌 · 목록 $m 줄 (같다)"
    else say_bad "팩 $n 벌 ≠ 목록 $m 줄 — 재생목록.js 를 다시 돌린다(어긋나면 없는 파일을 튼다)"; fi
  else
    say_bad "$ROOT/팩/playlist.txt 없음 — 팩을 올리고 재생목록.js 를 돌린다"
  fi

  echo " · 봇 환경 ($ROOT/.env · systemd EnvironmentFile)"
  for k in $BOT_KEYS; do
    has_key "$ROOT/.env" "$k" && say_ok "$k" || say_bad "$k — 없으면 봇이 exit 1 을 10초마다 반복한다"
  done
  for k in $BOT_OPTIONAL; do
    has_key "$ROOT/.env" "$k" && say_ok "$k (선택)" || echo "  ⚠ $k 없음 — 켜지긴 하는데 «수집만» 돌고 퀴즈를 안 연다"
  done

  echo " · 송출 환경 ($ROOT/송출/.env · 봇 것과 **다른 파일**이다)"
  has_key "$ROOT/송출/.env" YOUTUBE_STREAM_KEY && say_ok "YOUTUBE_STREAM_KEY" || say_bad "YOUTUBE_STREAM_KEY — 스트림 만들기에서 나온다"

  echo
  echo "[개통] 합계 = 찬 것 $ok + 빈 것 $bad"
  [ "$bad" = "0" ] || { echo "[개통] 빈 것이 있어 설치를 권하지 않는다."; return 1; }
  echo "[개통] 다 찼다 — sudo bash 개통.sh --설치"
}

install() {
  [ "$(id -u)" = "0" ] || { echo "[개통] --설치 는 root 가 필요하다(sudo)" >&2; exit 1; }

  echo "[개통] 자리 만들기"
  mkdir -p "$ROOT/bots" "$ROOT/lib" "$ROOT/송출" "$ROOT/팩"

  echo "[개통] 코드 놓기 (팩·.env 는 건드리지 않는다)"
  cp -f  "$REPO/bots/라디오수집봇.js"        "$ROOT/bots/"
  cp -f  "$REPO"/lib/라디오*.js              "$ROOT/lib/"
  cp -f  "$HERE/송출.sh" "$HERE/인코딩.sh" "$HERE/재생목록.js" "$ROOT/송출/"
  chmod +x "$ROOT/송출/송출.sh" "$ROOT/송출/인코딩.sh"

  echo "[개통] 비밀 파일 잠그기"
  for f in "$ROOT/.env" "$ROOT/송출/.env"; do
    [ -f "$f" ] && { chmod 600 "$f"; chown root:root "$f"; echo "  600 $f"; }
  done

  echo "[개통] systemd 유닛"
  cp -f "$HERE/radio-bot.service" "$HERE/radio-stream.service" /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable --now radio-bot
  systemctl enable radio-stream        # ⛔ --now 아님: 송출 개시는 사람이 눈으로 보고 켠다

  echo
  echo "[개통] 섰다. 다음 셋:"
  echo "  1) journalctl -u radio-bot -f     ← 봇이 방송을 찾는 로그(아직 방송이 없으면 물러서며 찾는다)"
  echo "  2) 유튜브에서 스트림을 시작할 준비가 되면:  systemctl start radio-stream"
  echo "  3) 첫 화면을 눈으로 확인한 뒤 유튜브 스튜디오에서 «라이브 시작»"
}

case "$MODE" in
  --점검)  check ;;
  --설치)  check && install ;;
  *) echo "사용: bash 개통.sh --점검 | sudo bash 개통.sh --설치" >&2; exit 1 ;;
esac
