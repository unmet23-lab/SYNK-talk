#!/usr/bin/env bash
# 라디오24 BGM 사전 인코딩 — 음원 폴더 → 송출 규격 .ts 팩 (설계 §7-7 확정: 720p 단일 규격 · 송출은 -c copy)
#
# 사용:  bash 인코딩.sh <음원폴더> <출력폴더> [배경이미지.png | 배경폴더]
#   · 배경에 «폴더»를 주면 곡 이름에서 장르를 읽어 그 장르의 배경을 고른다:
#       synk-radio-01-citypop-air.mp3 → <배경폴더>/citypop.png
#     🔑 이것이 「장르마다 마스코트가 바뀐다」(유호 확정 09-02)의 실체다 — 화면이 곡에 «박혀» 있어
#       송출은 -c copy 그대로다(재인코딩 0). 곡이 넘어가면 마스코트도 넘어간다.
#   · 음원: **SYNK 자체 생성**(Lyria 3 Pro · `tools/라디오곡생산.js`). 09-01 확정으로
#     「무료 소스만(YouTube 오디오 라이브러리)」을 대체했다 — 출처 장부는 크레딧.md.
#   · 배경이미지를 안 주면 단색(킷 Ink Deep) 정지 화면. 옛 머리말의 «브랜드 Navy»는
#     08-20 킷 개편의 퇴역색이다(09-02 에 실물과 함께 갈았다).
#   · 배경판 자체는 형제 저장소가 굽는다 — `SYNK-appsscript` `tools/라디오무대굽기.js`(무대 생성)
#     → `tools/라디오배경굽기.js`(정본 마스코트 합성) → `docs/라디오/배경/<장르>.png`.
#
# 음량은 여기서 안 만진다 — 주인은 lib/곡판규격.js 의 «방송» 판 하나다(09-02 수리).
# 예전 머리말의 「트랙별 loudnorm」은 남의 음원을 쓰던 시절의 까닭이고,
# 자습 배경음이 트랙 경계마다 널뛴다(새벽 자습 표면에서 그건 기능 결함이다).
# 왜 .ts 인가 — concat demuxer 로 이을 때 타임스탬프 연속 처리가 mp4 보다 단순하고(§5-P1
# 「concat 타임스탬프 처리」), 송출이 -c copy 라 컨테이너가 곧 송출 규격이다.
# ⚠ 변수명이 영어인 이유: bash 는 비ASCII 식별자를 못 받는다(2026-08-13 bash -n 실측).
set -euo pipefail

SRC=${1:?음원 폴더를 달라}
OUT=${2:?출력 폴더를 달라}
BG=${3:-}

HERE="$(cd "$(dirname "$0")" && pwd)"

# 곡 장부 게이트 — 비어 있으면 멈춘다. 장부가 비었다는 것은 «팩에 들 곡이 어디서 왔는지
# 아무도 모른다»는 뜻이고, 허위 클레임(§6-1 Lofi Girl 사례)이 오는 날 대응 자료가 없다.
CREDITS="$HERE/크레딧.md"
# 🔴 09-02 — 옛 조건 `^| [^-|]` 는 **표 머리줄(`| 트랙 파일 | …`)에도 걸렸다.**
#    즉 곡이 한 벌도 없어도 게이트가 초록이었다(「0건이 성공 얼굴」의 그 무늬).
#    이제 «트랙 줄»만 센다 — 첫 칸이 백틱으로 감싼 .mp3 인 줄.
if [ ! -s "$CREDITS" ] || ! grep -qE '^\| `[^|]+\.mp3`' "$CREDITS"; then
  echo "[인코딩] ⛔ 크레딧.md 에 트랙 줄이 없다 — 곡을 먼저 만든다(node tools/라디오곡생산.js). 그 도구가 장부를 적는다." >&2
  exit 2
fi

mkdir -p "$OUT"
N=0
for f in "$SRC"/*.{mp3,m4a,wav,flac,ogg}; do
  [ -e "$f" ] || continue
  NAME=$(basename "${f%.*}" | tr ' ' '_')
  DEST="$OUT/${NAME}.ts"
  if [ -e "$DEST" ]; then echo "  · $NAME — 이미 있다(건너뜀)"; continue; fi
  # 곡 이름 꼬리에서 장르를 읽는다 — `…-<장르>-air` 꼴(생산 도구가 그렇게 짓는다).
  GENRE=$(printf %s "$NAME" | sed -n 's/.*-\([a-z][a-z]*\)-air$/\1/p')
  if [ -d "$BG" ] && [ -n "$GENRE" ] && [ -e "$BG/$GENRE.png" ]; then
    VIN=(-loop 1 -i "$BG/$GENRE.png")
  elif [ -d "$BG" ] && [ -e "$BG/기본.png" ]; then
    VIN=(-loop 1 -i "$BG/기본.png")        # 장르 배경이 없으면 기본으로 — 조용히 단색으로 안 떨어진다
  elif [ -n "$BG" ] && [ -f "$BG" ]; then
    VIN=(-loop 1 -i "$BG")                 # 파일 하나를 주면 팩 전체 공통(옛 통로)
  else
    VIN=(-f lavfi -i "color=c=0x1A1512:s=1280x720:r=30")   # 킷 Ink Deep 단색(구 Navy 는 킷 퇴역색)
  fi
  # 영상은 정지 화면이라 초저비트레이트로 충분 — 오디오가 본체다.
  #
  # 🔴 여기서 «정규화를 하지 않는다»(09-02 전수조사에서 걷어낸 결함).
  #   예전 판은 loudnorm=I=-16:TP=-1.5 를 걸었는데, 들어오는 곡이 이미 lib/곡판규격.js 의
  #   «방송» 판(-14 LUFS · 192k)에 맞춰 **2패스로** 구워진 것이라 여기서 다시 깎으면 두 번 눌린다.
  #   ⇒ 자를 하나로: 음량의 주인은 곡판규격 하나이고, 이 스크립트는 «영상을 붙이는» 일만 한다.
  #   ⚠ 남의 음원(음량 제각각)을 다시 쓰게 되는 날엔 그 앞단에서 규격에 맞춰 굽고 들여온다.
  #
  # 🔴 오디오 192k (예전 128k) — 2026 음악 채널 권고가 192~320k 이고 원본이 192k 라
  #   128k 로 내보내면 다운그레이드가 된다. 음악이 본체인 방송에서 체감되는 자리다.
  ffmpeg -hide_banner -y "${VIN[@]}" -i "$f" \
    -shortest -r 30 -g 60 -pix_fmt yuv420p \
    -c:v libx264 -preset veryfast -tune stillimage -b:v 400k -maxrate 600k -bufsize 1200k \
    -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2" \
    -c:a aac -b:a 192k -ar 44100 -ac 2 \
    -f mpegts "$DEST"
  N=$((N+1))
  echo "  ✅ $NAME"
done

echo "[인코딩] 새로 인코딩 $N 벌 → $OUT  (분모: 입력 폴더의 원본 수와 대조하라 — 0벌이면 통과가 아니라 미실행이다)"
