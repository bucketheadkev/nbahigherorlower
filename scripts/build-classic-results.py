"""
Builds the Classic results background from the approved reference (design/classic-results-reference.png,
580x1024): the arena, its lights and the hardwood stay; the title, team total, player rows and both
buttons are taken out so the live versions sit on clean art. Under the buttons the floor is continued
from the band just above it (real grain, not a smear).

The art is enlarged 4x with the EDSR super-resolution network (2320x4096), so it stays sharp on any
phone. Same setup as scripts/build-classic-arena.py:

    python3 -m venv /tmp/sr && /tmp/sr/bin/pip install opencv-contrib-python-headless numpy pillow
    curl -L -o /tmp/srm/EDSR_x4.pb https://github.com/Saafke/EDSR_Tensorflow/raw/master/models/EDSR_x4.pb
    /tmp/sr/bin/python scripts/build-classic-results.py

Output: public/images/classic/results-bg.webp
"""

import hashlib
import os

import numpy as np
from PIL import Image

REF = 'design/classic-results-reference.png'
OUT = 'public/images/classic/results-bg.webp'
MODEL = os.environ.get('EDSR_MODEL', '/tmp/srm/EDSR_x4.pb')
SCALE = 4
TILE, OVERLAP = 96, 8

# Live elements (reference px, x0 y0 x1 y1), each with its glow.
TITLE = (190, 16, 392, 52)
TOTAL = (22, 62, 562, 192)
ROWS = (10, 204, 570, 556)
BUTTONS_TOP, BUTTONS_BOTTOM = 780, 998

img = np.asarray(Image.open(REF).convert('RGB')).astype(np.float64)
H, W, _ = img.shape


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


# Upper part: title, total and rows sit on dark arena, a smooth fill is right there.
hole = np.zeros((H, W), bool)
for x0, y0, x1, y1 in (TITLE, TOTAL, ROWS):
    hole[y0:y1, x0:x1] = True
plate = inpaint(img, hole)
plate = np.where(hole[..., None], plate, img)
rng = np.random.default_rng(11)
plate[hole] += rng.normal(0, 1.2, size=(hole.sum(), 3))

# Buttons: continue the hardwood from the band just above, darkening toward the original bottom
# edge, and feathered at both seams into a smooth fill of the band.
band = BUTTONS_BOTTOM - BUTTONS_TOP
button_hole = np.zeros((H, W), bool)
button_hole[BUTTONS_TOP:BUTTONS_BOTTOM] = True
smooth = inpaint(img, button_hole)[BUTTONS_TOP:BUTTONS_BOTTOM]
# Hardwood planks over the smooth light: boards radiate from the court's vanishing point, each with
# its own tone and a faint grain along its length.
VX, VY = 290.0, 300.0
yy, xx = np.mgrid[BUTTONS_TOP:BUTTONS_BOTTOM, 0:W].astype(np.float64)
angle = np.arctan2(xx - VX, yy - VY)
radius = np.hypot(xx - VX, yy - VY)
PLANK = 0.0145
board = np.floor(angle / PLANK).astype(int)
board -= board.min()
plank_rng = np.random.default_rng(23)
tone = plank_rng.normal(1.0, 0.075, board.max() + 1)
phase = plank_rng.uniform(0, 2 * np.pi, board.max() + 1)
grain = 1 + 0.035 * np.sin(radius / 9.0 + phase[board]) + 0.02 * np.sin(radius / 2.7 + 2 * phase[board])
seam = np.abs((angle / PLANK) % 1 - 0.5) * 2
joint = 1 - 0.16 * np.clip((seam - 0.9) / 0.1, 0, 1)
fill = smooth * (tone[board] * grain * joint)[..., None]
feather = 10
w = np.ones((band, 1, 1))
w[:feather, 0, 0] = np.linspace(0, 1, feather)
w[-feather:, 0, 0] = np.linspace(1, 0, feather)
plate[BUTTONS_TOP:BUTTONS_BOTTOM] = fill * w + smooth * (1 - w)

if os.environ.get('QUICK'):
    Image.fromarray(np.clip(plate, 0, 255).astype(np.uint8)).save('/tmp/res/results-plate1x.png')
    raise SystemExit


def super_resolve(rgb):
    """EDSR in overlapping tiles (cached, it is slow on a CPU), blended across the overlaps."""
    import cv2
    sr = cv2.dnn_superres.DnnSuperResImpl_create()
    sr.readModel(MODEL)
    sr.setModel('edsr', SCALE)
    src = np.clip(rgb, 0, 255).astype(np.uint8)
    h, w, _ = src.shape
    acc = np.zeros((h * SCALE, w * SCALE, 3))
    wsum = np.zeros((h * SCALE, w * SCALE, 1))
    cache = '/tmp/srtiles4'
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
            ramp_y = np.minimum(np.arange(th) + 1, th - np.arange(th)).astype(np.float64)
            ramp_x = np.minimum(np.arange(tw) + 1, tw - np.arange(tw)).astype(np.float64)
            wt = np.minimum(np.minimum(ramp_y[:, None], ramp_x[None, :]), OVERLAP * SCALE * 2)[..., None]
            acc[y0 * SCALE:y1 * SCALE, x0 * SCALE:x1 * SCALE] += out * wt
            wsum[y0 * SCALE:y1 * SCALE, x0 * SCALE:x1 * SCALE] += wt
    return acc / np.maximum(wsum, 1e-6)


up = super_resolve(plate)
out = Image.fromarray(np.clip(up, 0, 255).astype(np.uint8))
out.save(OUT, quality=86, method=6)
print(f'results background: {out.width}x{out.height}')
