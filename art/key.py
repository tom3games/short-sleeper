# 生成したシート（緑背景）を切り抜いて img/*.webp と art.js を作る。~/tools/pyimg/bin/python art/key.py
# 切り方は midnight-gamer/art/key.py と同じ。切り絵に見せるため、輪郭の外に紙の白い縁を足す
import numpy as np, os, json
from PIL import Image, ImageFilter
D = os.path.dirname(os.path.abspath(__file__)); OUT = D + '/../img/'
RIM = 7
def alpha(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    k = g - np.maximum(r, b)
    al = 1 - np.clip((k - 22) / (90 - 22), 0, 1)
    lim = np.maximum(r, b); g2 = np.where(g > lim, lim, g)
    return np.dstack([r, g2, b, al * 255]).clip(0, 255).astype(np.uint8)
def load(src):
    im = Image.fromarray(alpha(np.asarray(Image.open(D + '/raw/' + src + '.png').convert('RGB')).astype(np.float32)), 'RGBA')
    a = im.split()[3].filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7)); im.putalpha(a)
    rim = a.point(lambda v: 255 if v > 60 else 0).filter(ImageFilter.MaxFilter(RIM * 2 + 1)).filter(ImageFilter.GaussianBlur(0.8))
    paper = Image.new('RGBA', im.size, (255, 253, 246, 0)); paper.putalpha(rim)
    return Image.alpha_composite(paper, im)
# 3人（3ポーズ）の切れ目: 1/3 と 2/3 の近くで、絵の無い列を探す
def cuts(im):
    a = np.asarray(im.split()[3]).astype(np.float32).sum(0); W = len(a); res = [0]
    for f in (1/3, 2/3):
        c = int(W * f); lo, hi = c - 120, c + 120
        res.append(lo + int(np.argmin(a[lo:hi])))
    return res + [W]
SHEETS = {
  'guru_a': (['guru_talk', 'guru_doze', 'guru_deep'], 700),
  'guru_b': (['guru_excuse', 'guru_startle', 'guru_collapse'], 700),
  'journalist_a': (['jour_write', 'jour_lift', 'jour_stare'], 480),
  'journalist_b': (['jour_gotcha', 'jour_zzz', 'jour_shock'], 480),
  'assistant_a': (['asst_busy', 'asst_turn', 'asst_look'], 480),
  'assistant_b': (['asst_shock', 'asst_phone', 'asst_zzz'], 480),
  'audience_a': (['aud0_look', 'aud1_look', 'aud2_look'], 440),
  'audience_b': (['aud0_away', 'aud1_away', 'aud2_away'], 440),
  'audience_c': (['aud0_shock', 'aud1_shock', 'aud2_shock'], 440),
}
# 絵がとなりの列にはみ出していても切れないように、つながった塊ごとに「重心がどの列か」で分ける（1/4 に縮めて数える）
from collections import deque
def owners(im, cs):
    S = 4; a = np.asarray(im.split()[3].resize((im.width // S, im.height // S))) > 40
    h, w = a.shape; lab = np.full((h, w), -1, np.int32); col = []
    for y0 in range(h):
        for x0 in range(w):
            if not a[y0, x0] or lab[y0, x0] >= 0: continue
            k = len(col); q = deque([(y0, x0)]); lab[y0, x0] = k; sx = n = 0
            while q:
                y, x = q.popleft(); sx += x; n += 1
                for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                    if 0 <= yy < h and 0 <= xx < w and a[yy, xx] and lab[yy, xx] < 0: lab[yy, xx] = k; q.append((yy, xx))
            cx = sx / n * S; col.append(next(i for i in range(3) if cx < cs[i + 1]))
    m = np.where(lab >= 0, np.array(col + [0])[lab], -1)
    return np.asarray(Image.fromarray((m + 1).astype(np.uint8)).resize(im.size, Image.NEAREST)).astype(np.int32) - 1
out = {}
for src, (names, m) in SHEETS.items():
    if not os.path.exists(D + '/raw/' + src + '.png'): print('まだ無い', src); continue
    im = load(src); cs = cuts(im); own = owners(im, cs); arr = np.asarray(im)
    for i, name in enumerate(names):
        b2 = arr.copy(); b2[..., 3] = np.where(own == i, b2[..., 3], 0)
        c = Image.fromarray(b2, 'RGBA'); bb = c.split()[3].point(lambda v: 255 if v > 24 else 0).getbbox()
        c = c.crop(bb); w, h = c.size
        if max(w, h) > m:
            k = m / max(w, h); c = c.resize((round(w * k), round(h * k)), Image.LANCZOS)
        c.save(OUT + name + '.webp', quality=84, method=6, alpha_quality=85)
        out[name] = round(w / h, 4)
open(D + '/../art.js', 'w').write('// art/key.py が作る。絵の 幅/高さ\nwindow.SS_ART = ' + json.dumps(out) + '\n')
print(json.dumps(out))
