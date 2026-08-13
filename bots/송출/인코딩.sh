#!/usr/bin/env bash
# 라디오24 BGM 사전 인코딩 — 음원 폴더 → 송출 규격 .ts 팩 (설계 §7-7 확정: 720p 단일 규격 · 송출은 -c copy)
#
# 사용:  bash 인코딩.sh <음원폴더> <출력폴더> [배경이미지.png]
#   · 음원: YouTube 오디오 라이브러리 등 «라이브 허용 명시» 무료 소스만(§7-4 확정 · 월 0원).
#   · 배경이미지를 안 주면 단색(브랜드 Navy) 정지 화면.
#
# 왜 트랙별 loudnorm 인가 — 라이브러리 트랙은 음량이 제각각이라, 정규화 없이 이으면
# 자습 배경음이 트랙 경계마다 널뛴다(새벽 자습 표면에서 그건 기능 결함이다).
# 왜 .ts 인가 — concat demuxer 로 이을 때 타임스탬프 연속 처리가 mp4 보다 단순하고(§5-P1
# 「concat 타임스탬프 처리」), 송출이 -c copy 라 컨테이너가 곧 송출 규격이다.
# ⚠ 변수명이 영어인 이유: bash 는 비ASCII 식별자를 못 받는다(2026-08-13 bash -n 실측).
set -euo pipefail

SRC=${1:?음원 폴더를 달라}
OUT=${2:?출력 폴더를 달라}
BG=${3:-}

HERE="$(cd "$(dirname "$0")" && pwd)"

# 크레딧 게이트 — 비어 있으면 멈춘다. 저작자 표시 조건 트랙의 크레딧을 「나중에」로 미루면
# 허위 클레임(§6-1 Lofi Girl 사례)이 오는 날 대응 자료가 없다. 팩을 만드는 그 자리에서 적는다.
CREDITS="$HERE/크레딧.md"
if [ ! -s "$CREDITS" ] || ! grep -q '^| [^-|]' "$CREDITS"; then
  echo "[인코딩] ⛔ 크레딧.md 에 트랙 줄이 없다 — 내려받은 트랙마다 한 줄(제목·아티스트·출처·표시의무)을 먼저 적는다." >&2
  exit 2
fi

mkdir -p "$OUT"
N=0
for f in "$SRC"/*.{mp3,m4a,wav,flac,ogg}; do
  [ -e "$f" ] || continue
  NAME=$(basename "${f%.*}" | tr ' ' '_')
  DEST="$OUT/${NAME}.ts"
  if [ -e "$DEST" ]; then echo "  · $NAME — 이미 있다(건너뜀)"; continue; fi
  if [ -n "$BG" ]; then
    VIN=(-loop 1 -i "$BG")
  else
    VIN=(-f lavfi -i "color=c=0x0B1F3A:s=1280x720:r=30")   # 브랜드 Navy 단색
  fi
  # 영상은 정지 화면이라 초저비트레이트로 충분 — 오디오가 본체다(loudnorm -16LUFS/-1.5dBTP).
  ffmpeg -hide_banner -y "${VIN[@]}" -i "$f" \
    -shortest -r 30 -g 60 -pix_fmt yuv420p \
    -c:v libx264 -preset veryfast -tune stillimage -b:v 400k -maxrate 600k -bufsize 1200k \
    -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2" \
    -af "loudnorm=I=-16:TP=-1.5:LRA=11" \
    -c:a aac -b:a 128k -ar 44100 -ac 2 \
    -f mpegts "$DEST"
  N=$((N+1))
  echo "  ✅ $NAME"
done

echo "[인코딩] 새로 인코딩 $N 벌 → $OUT  (분모: 입력 폴더의 원본 수와 대조하라 — 0벌이면 통과가 아니라 미실행이다)"
