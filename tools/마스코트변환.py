# 마스코트 렌더 누끼 + WebP 변환 — 그림 정본(docs/캐릭터/마스코트_렌더) → talk 앱 자산.
# 방법: 후보(저채도·밝음) 마스크를 가장자리에서 스캔라인 플러드필 → 배경만 제거.
#   · 유리 몸 안의 흰 하이라이트는 후보라도 가장자리와 안 이어져 살아남는다.
#   · 바닥 그림자(회색 그라데이션)는 배경과 이어져 함께 걷힌다(앱은 부유라 그림자 불필요).
#   · SVG 변환 금지(README 조립 규칙) — 이것은 포맷 변환+축소라 허용 범위.
import sys, os, io
import numpy as np
from PIL import Image, ImageFilter
from collections import deque

SRC = r"C:\Users\q1212\Documents\SYNK-appsscript\docs\캐릭터\마스코트_렌더"
DST = r"C:\Users\q1212\Documents\SYNK-talk\assets\마스코트"
SHEET = os.path.join(os.path.dirname(os.path.abspath(__file__)), "마스코트_시트.png")

컷들 = ["본체", "본채깜찍", "본체별눈", "본체놀람", "본체눈감음", "본체눈감음2"]

def 배경플러드(cand):
    """cand(HxW bool)에서 가장자리와 이어진 True 영역만 True 로 돌려준다 (스캔라인)."""
    H, W = cand.shape
    bg = np.zeros_like(cand)
    stack = deque()
    for yy in (0, H - 1):
        xs = np.nonzero(cand[yy])[0]
        if xs.size:
            for x in xs[np.concatenate(([True], np.diff(xs) > 1))]:
                stack.append((yy, int(x)))
    for y in range(H):
        if cand[y, 0]: stack.append((y, 0))
        if cand[y, W-1]: stack.append((y, W-1))
    while stack:
        y, x = stack.pop()
        if bg[y, x] or not cand[y, x]:
            continue
        row = cand[y] & ~bg[y]
        # 왼쪽 span 끝: x 에서 왼쪽으로 이어진 True 의 시작
        left_false = np.nonzero(~row[:x+1])[0]
        l = int(left_false[-1]) + 1 if left_false.size else 0
        right_false = np.nonzero(~row[x:])[0]
        r = x + int(right_false[0]) - 1 if right_false.size else W - 1
        bg[y, l:r+1] = True
        for ny in (y - 1, y + 1):
            if 0 <= ny < H:
                seg = cand[ny, l:r+1] & ~bg[ny, l:r+1]
                xs = np.nonzero(seg)[0]
                if xs.size:
                    starts = xs[np.concatenate(([True], np.diff(xs) > 1))]
                    for sx in starts:
                        stack.append((ny, l + int(sx)))
    return bg

def 변환(이름):
    im = Image.open(os.path.join(SRC, 이름 + ".png")).convert("RGB")
    a = np.asarray(im).astype(np.int32)  # int16 이면 230*299 가 오버플로해 lum 이 깨진다(실측)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    lum = (R * 299 + G * 587 + B * 114) // 1000
    sat = a.max(axis=2) - a.min(axis=2)
    cand = (sat < 30) & (lum > 140)          # 저채도·밝음 = 배경 후보(그림자 포함)
    bg = 배경플러드(cand)
    fg = ~bg
    mask = Image.fromarray((fg * 255).astype(np.uint8), "L")
    mask = mask.filter(ImageFilter.MedianFilter(5))       # 배경 티끌 제거
    mask = mask.filter(ImageFilter.GaussianBlur(2))       # 경계 페더
    m = np.asarray(mask).astype(np.float32) / 255.0
    m = np.power(m, 1.6)                                   # 초크 — 회색 헤일로 죄기
    alpha = (m * 255).astype(np.uint8)

    rgba = np.dstack([np.asarray(im), alpha])
    ys, xs = np.nonzero(alpha > 8)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    pad = 24
    y0, y1 = max(0, y0 - pad), min(rgba.shape[0], y1 + pad)
    x0, x1 = max(0, x0 - pad), min(rgba.shape[1], x1 + pad)
    crop = rgba[y0:y1, x0:x1]
    h, w = crop.shape[:2]
    side = max(h, w)
    sq = np.zeros((side, side, 4), dtype=np.uint8)
    oy, ox = (side - h) // 2, (side - w) // 2
    sq[oy:oy+h, ox:ox+w] = crop
    out = Image.fromarray(sq, "RGBA").resize((512, 512), Image.LANCZOS)
    os.makedirs(DST, exist_ok=True)
    out.save(os.path.join(DST, 이름 + ".webp"), "WEBP", quality=95, method=6)

    # 실측 — 모서리 투명·코어 색
    oa = np.asarray(out)
    corners = [oa[0, 0, 3], oa[0, -1, 3], oa[-1, 0, 3], oa[-1, -1, 3]]
    body = oa[(oa[..., 3] == 255)]
    sat_b = body[:, :3].max(axis=1).astype(int) - body[:, :3].min(axis=1).astype(int)
    vivid = body[sat_b > 60][:, :3]
    core = np.median(vivid, axis=0).astype(int) if len(vivid) else [0, 0, 0]
    kb = os.path.getsize(os.path.join(DST, 이름 + ".webp")) // 1024
    print(f"{이름}: 모서리α={corners} 몸px={len(body)} 코어중앙값=#{core[0]:02X}{core[1]:02X}{core[2]:02X} {kb}KB")
    return out

def main():
    outs = [변환(n) for n in 컷들]
    # 검증 시트 — Navy 바탕 위 6컷
    navy = (15, 23, 48)
    sheet = Image.new("RGB", (256 * 3, 256 * 2), navy)
    for i, o in enumerate(outs):
        small = o.resize((256, 256), Image.LANCZOS)
        sheet.paste(small, ((i % 3) * 256, (i // 3) * 256), small)
    sheet.save(SHEET)
    print("시트:", SHEET)

if __name__ == "__main__":
    main()
