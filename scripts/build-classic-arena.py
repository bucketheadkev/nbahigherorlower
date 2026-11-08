"""
Builds the Classic arena plate from the approved reference (design/classic-reference-v2.png, 577x1024).

Everything static in the reference (arena, crowd, lights, backboard, hardwood, court lines,
Jumbotron, 1B RUN plate, headline) is kept. Everything the game draws live (TEAM/ERA panels,
jerseys, position pills, SPIN, the top bar text) is filled out of the plate so the live versions
sit on clean art and nothing is ever drawn twice.

The plate is enlarged with the EDSR super-resolution network rather than resampled, so it stays
sharp on 3x phone screens. That needs OpenCV contrib and the model file:

    python3 -m venv /tmp/sr && /tmp/sr/bin/pip install opencv-contrib-python-headless numpy pillow
    curl -L -o /tmp/srm/EDSR_x2.pb https://github.com/Saafke/EDSR_Tensorflow/raw/master/models/EDSR_x2.pb
    /tmp/sr/bin/python scripts/build-classic-arena.py

Outputs public/images/classic/arena-plate.webp and prints the measured jersey boxes plus the
traced jersey outline used by components/tradeup/draft/ArenaJersey.tsx.
"""

import os
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

REF = 'design/classic-reference-v2.png'
OUT = 'public/images/classic'
MODEL = os.environ.get('EDSR_MODEL', '/tmp/srm/EDSR_x2.pb')

# Approximate boxes (reference px); segmentation refines the jerseys.
JERSEYS = {
    'pf': (154, 467, 274, 616),
    'c': (302, 467, 422, 616),
    'sg': (24, 594, 148, 754),
    'sf': (428, 594, 552, 754),
    'pg': (222, 640, 354, 806),
}
# Each pill's detected outline + 2 px (no further: the court line just below must not bleed in).
PILLS = {
    'pf': (177, 608, 252, 638),
    'c': (328, 608, 400, 638),
    'sg': (47, 750, 126, 779),
    'sf': (452, 749, 530, 779),
    'pg': (250, 797, 328, 827),
}
PANELS = [(98, 178, 281, 313), (298, 178, 481, 313)]
SPIN = (44, 882, 534, 982)
HEADER = [(6, 2, 150, 36), (514, 2, 572, 36)]

PAD_X, PAD_TOP, PAD_BOTTOM = 160, 220, 320

img = np.asarray(Image.open(REF).convert('RGB')).astype(np.float64)
H, W, _ = img.shape
lum = img[..., 0] * 0.299 + img[..., 1] * 0.587 + img[..., 2] * 0.114
mx = img.max(axis=2)
sat = (mx - img.min(axis=2)) / np.maximum(mx, 1)


def flood(passable, seeds):
    h, w = passable.shape
    seen = np.zeros((h, w), bool)
    q = deque()
    for y, x in seeds:
        if passable[y, x] and not seen[y, x]:
            seen[y, x] = True
            q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and passable[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    return seen


def border(h, w):
    return [(y, x) for y in range(h) for x in range(w) if y in (0, h - 1) or x in (0, w - 1)]


def erode(m, r):
    out = m.copy()
    for _ in range(r):
        o = out.copy()
        o[1:, :] &= out[:-1, :]
        o[:-1, :] &= out[1:, :]
        o[:, 1:] &= out[:, :-1]
        o[:, :-1] &= out[:, 1:]
        out = o
    return out


def dilate(m, r):
    out = m.copy()
    for _ in range(r):
        o = out.copy()
        o[1:, :] |= out[:-1, :]
        o[:-1, :] |= out[1:, :]
        o[:, 1:] |= out[:, :-1]
        o[:, :-1] |= out[:, 1:]
        out = o
    return out


def largest_component(m):
    h, w = m.shape
    seen = np.zeros_like(m)
    best, best_n = None, 0
    for sy in range(h):
        for sx in range(w):
            if m[sy, sx] and not seen[sy, sx]:
                comp = flood(m & ~seen, [(sy, sx)])
                seen |= comp
                n = comp.sum()
                if n > best_n:
                    best, best_n = comp, n
    return best


silhouettes = {}
crops = {}
print('jersey boxes (x, y, w, h):')
for slot, box in JERSEYS.items():
    x0, y0, x1, y1 = box
    # The hardwood is warm and saturated; the gray mesh, its shading and the white trim are not.
    passable = (sat[y0:y1, x0:x1] > 0.28) | (lum[y0:y1, x0:x1] < 36)
    h, w = passable.shape
    inside = ~flood(passable, border(h, w))
    closed = erode(dilate(inside, 3), 3)
    inside = ~flood(~closed, border(h, w))
    # Court lines touching a shirt are not shirt: open, keep the main body.
    inside = dilate(erode(inside, 4), 4)
    inside = largest_component(inside)
    crops[slot] = (x0, y0, inside.copy())
    rows = np.nonzero(inside.any(axis=1))[0]
    for y in rows[: int(len(rows) * 0.4)]:
        xs_row = np.nonzero(inside[y])[0]
        inside[y, xs_row.min():xs_row.max() + 1] = True
    full = np.zeros((H, W), bool)
    full[y0:y1, x0:x1] = inside
    silhouettes[slot] = full
    ys, xs = np.nonzero(full)
    print(f'  {slot}: {xs.min()}, {ys.min()}, {xs.max() - xs.min() + 1}, {ys.max() - ys.min() + 1}')

if os.environ.get('PREVIEW'):
    prev = img.copy()
    for m in silhouettes.values():
        prev[m] = prev[m] * 0.4 + np.array([255, 0, 200]) * 0.6
    Image.fromarray(prev.astype(np.uint8)).save('/tmp/ref2/sil-preview.png')
    if os.environ.get('PREVIEW') == 'only':
        raise SystemExit

# ── Plate: fill every live element out of the reference ──────────────────────────────────────
# Each shirt's box (x, y, w, h) as drawn live; below the hem the reference's own floor shadow stays.
SEATS = {
    'pf': (161, 468, 109, 136),
    'c': (307, 468, 110, 136),
    'sg': (30, 603, 112, 141),
    'sf': (434, 603, 112, 141),
    'pg': (231, 649, 115, 145),
}
hole = np.zeros((H, W), bool)
for slot, m in silhouettes.items():
    m = dilate(m, 3)
    m[SEATS[slot][1] + SEATS[slot][3] + 1:] = False
    hole |= m
for x0, y0, x1, y1 in list(PILLS.values()) + [SPIN] + HEADER:
    hole[y0:y1, x0:x1] = True
panel_hole = np.zeros((H, W), bool)
for x0, y0, x1, y1 in PANELS:
    panel_hole[y0:y1, x0:x1] = True


def inpaint(rgb, mask, iters=600):
    """Membrane fill: coarse-to-fine diffusion from the surrounding pixels."""
    levels = []
    m, r = mask.copy(), rgb.copy()
    while min(m.shape) > 32:
        levels.append((m, r))
        h, w = m.shape
        h2, w2 = h // 2, w // 2
        r = r[: h2 * 2, : w2 * 2].reshape(h2, 2, w2, 2, 3).mean(axis=(1, 3))
        m = m[: h2 * 2, : w2 * 2].reshape(h2, 2, w2, 2).any(axis=(1, 3))
    levels.append((m, r))
    guess = None
    for m, r in reversed(levels):
        r = r.copy()
        if guess is not None:
            up = np.asarray(Image.fromarray(np.clip(guess, 0, 255).astype(np.uint8)).resize((r.shape[1], r.shape[0]), Image.BILINEAR)).astype(np.float64)
            r[m] = up[m]
        else:
            r[m] = r[~m].mean(axis=0)
        for _ in range(iters if m.shape[0] < 200 else iters // 3):
            p = np.pad(r, ((1, 1), (1, 1), (0, 0)), mode='edge')
            avg = (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:]) / 4
            r[m] = avg[m]
        guess = r
    return guess


plate = inpaint(img, hole | panel_hole)
plate = np.where((hole | panel_hole)[..., None], plate, img)
rng = np.random.default_rng(7)
plate[hole] += rng.normal(0, 1.6, size=(hole.sum(), 3))
if os.environ.get('QUICK'):
    Image.fromarray(np.clip(plate, 0, 255).astype(np.uint8)).save('/tmp/ref2/plate1x.png')
    raise SystemExit


def extend(rgb):
    """Pads the plate so any screen shape stays inside the arena: edges stretch, blur and darken."""
    h, w, _ = rgb.shape
    canvas = np.zeros((h + PAD_TOP + PAD_BOTTOM, w + 2 * PAD_X, 3))
    canvas[PAD_TOP:PAD_TOP + h, PAD_X:PAD_X + w] = rgb
    for i in range(PAD_TOP):
        t = (PAD_TOP - i) / PAD_TOP
        canvas[i, PAD_X:PAD_X + w] = rgb[0] * (1 - 0.6 * t)
    for i in range(PAD_BOTTOM):
        t = (i + 1) / PAD_BOTTOM
        canvas[PAD_TOP + h + i, PAD_X:PAD_X + w] = rgb[-1] * (1 - 0.55 * t)
    for j in range(PAD_X):
        t = (PAD_X - j) / PAD_X
        canvas[:, j] = canvas[:, PAD_X] * (1 - 0.7 * t)
        canvas[:, PAD_X + w + j] = canvas[:, PAD_X + w - 1] * (1 - 0.7 * (j + 1) / PAD_X)
    pil = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8))
    ext = np.asarray(pil.filter(ImageFilter.GaussianBlur(10))).astype(np.float64)
    inner = np.zeros(canvas.shape[:2], bool)
    inner[PAD_TOP:PAD_TOP + h, PAD_X:PAD_X + w] = True
    yy, xx = np.mgrid[0:canvas.shape[0], 0:canvas.shape[1]]
    dx = np.minimum(xx - PAD_X, PAD_X + w - 1 - xx)
    dy = np.minimum(yy - PAD_TOP, PAD_TOP + h - 1 - yy)
    dist = np.clip(np.minimum(dx, dy) / 6.0, 0, 1)
    dist[~inner] = 0
    return canvas * dist[..., None] + ext * (1 - dist[..., None])


SCALE = 2
TILE, OVERLAP = 96, 8


def super_resolve(rgb):
    """EDSR x2 in overlapping tiles (cached, it is slow on a CPU), blended across the overlaps."""
    import hashlib

    import cv2
    sr = cv2.dnn_superres.DnnSuperResImpl_create()
    sr.readModel(MODEL)
    sr.setModel('edsr', SCALE)
    src = np.clip(rgb, 0, 255).astype(np.uint8)
    h, w, _ = src.shape
    acc = np.zeros((h * SCALE, w * SCALE, 3))
    wsum = np.zeros((h * SCALE, w * SCALE, 1))
    cache = '/tmp/srtiles'
    os.makedirs(cache, exist_ok=True)
    for ty in range(0, h, TILE):
        for tx in range(0, w, TILE):
            y0, x0 = max(ty - OVERLAP, 0), max(tx - OVERLAP, 0)
            y1, x1 = min(ty + TILE + OVERLAP, h), min(tx + TILE + OVERLAP, w)
            tile = src[y0:y1, x0:x1]
            key = hashlib.sha1(tile.tobytes() + MODEL.encode()).hexdigest()
            path = f'{cache}/{key}.png'
            if os.path.exists(path):
                out = np.asarray(Image.open(path)).astype(np.float64)
            else:
                out = cv2.cvtColor(sr.upsample(cv2.cvtColor(tile, cv2.COLOR_RGB2BGR)), cv2.COLOR_BGR2RGB)
                Image.fromarray(out).save(path)
                out = out.astype(np.float64)
                print(f'  sr tile {ty},{tx}', flush=True)
            th, tw = out.shape[:2]
            # Feathered weights so neighbouring tiles meet without seams.
            ramp_y = np.minimum(np.arange(th) + 1, th - np.arange(th)).astype(np.float64)
            ramp_x = np.minimum(np.arange(tw) + 1, tw - np.arange(tw)).astype(np.float64)
            wt = np.minimum(np.minimum(ramp_y[:, None], ramp_x[None, :]), OVERLAP * SCALE * 2)[..., None]
            acc[y0 * SCALE:y1 * SCALE, x0 * SCALE:x1 * SCALE] += out * wt
            wsum[y0 * SCALE:y1 * SCALE, x0 * SCALE:x1 * SCALE] += wt
    return acc / np.maximum(wsum, 1e-6)


big = extend(plate)
up = np.asarray(Image.fromarray(np.clip(big, 0, 255).astype(np.uint8)).resize(
    (big.shape[1] * SCALE, big.shape[0] * SCALE), Image.LANCZOS)).astype(np.float64)
sharp = super_resolve(np.clip(plate, 0, 255))
# The reference area itself is the super-resolved art; feather 12 px into the soft extension.
sh, sw = sharp.shape[:2]
oy, ox = PAD_TOP * SCALE, PAD_X * SCALE
yy, xx = np.mgrid[0:sh, 0:sw]
edge = np.minimum(np.minimum(xx, sw - 1 - xx), np.minimum(yy, sh - 1 - yy))
a = np.clip(edge / 12.0, 0, 1)[..., None]
up[oy:oy + sh, ox:ox + sw] = sharp * a + up[oy:oy + sh, ox:ox + sw] * (1 - a)
out = Image.fromarray(np.clip(up, 0, 255).astype(np.uint8))
out.save(f'{OUT}/arena-plate.webp', quality=88, method=6)
print(f'plate: {out.width}x{out.height} (pad x {PAD_X}, top {PAD_TOP}, bottom {PAD_BOTTOM}, scale {SCALE})')
