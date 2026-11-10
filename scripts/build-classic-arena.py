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
# Floor under each shirt, past its contact shadow (the live jersey brings its own), and its pill.
floor_hole = np.zeros((H, W), bool)
seat_masks = {}
for slot, m in silhouettes.items():
    m = dilate(m, 8)
    m[SEATS[slot][1] + SEATS[slot][3] + 20:] = False
    px0, py0, px1, py1 = PILLS[slot]
    m[py0:py1, px0:px1] = True
    # The shirt's floor shadow, from the hem down to the bottom of its pill, across its width.
    sx0, sy0, sw, sh = SEATS[slot]
    m[sy0 + sh - 6:py1 + 3, sx0 + 4:sx0 + sw - 4] = True
    # PF and C sit just above the free-throw line: stop short of it so its glow isn't spread.
    if slot in ('pf', 'c'):
        m[636:] = False
    seat_masks[slot] = m
    floor_hole |= m
hole = floor_hole.copy()
for x0, y0, x1, y1 in list(PILLS.values()) + [SPIN] + HEADER:
    hole[y0:y1, x0:x1] = True
panel_hole = np.zeros((H, W), bool)
for x0, y0, x1, y1 in PANELS:
    panel_hole[y0:y1, x0:x1] = True
# The headline is drawn live (sharp at any size): its letters come out of the Jumbotron face.
hy0, hy1, hx0, hx1 = 128, 194, 76, 508
letters = np.zeros((H, W), bool)
face = img[hy0:hy1, hx0:hx1]
letters[hy0:hy1, hx0:hx1] = ((face.min(axis=2) > 150) | ((face[..., 1] > 120) & (face[..., 1] > face[..., 0] + 40)))
panel_hole |= dilate(letters, 4)


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

# ── Floor under the shirts and pills: hardwood grain and court lines, so a turning jersey only
#    ever shows clean floor behind it ─────────────────────────────────────────────────────────
soft_lum = np.asarray(Image.fromarray(np.clip(lum, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))).astype(np.float64)
line_px = (lum - soft_lum > 16) & (sat < 0.4) & ~dilate(hole, 2)
line_px[:505] = False
ys_all, xs_all = np.nonzero(line_px)


def pick(sel):
    return xs_all[sel].astype(np.float64), ys_all[sel].astype(np.float64)


def fit_line(xs, ys):
    """Total least squares: returns (nx, ny, c) with nx*x + ny*y + c = 0, |n| = 1."""
    mx_, my_ = xs.mean(), ys.mean()
    _, _, vt = np.linalg.svd(np.stack([xs - mx_, ys - my_], 1), full_matrices=False)
    nx, ny = vt[1]
    return nx, ny, -(nx * mx_ + ny * my_)


def fit_conic(xs, ys):
    """Algebraic conic through the points (the arc is a circle seen in perspective)."""
    d = np.stack([xs * xs, xs * ys, ys * ys, xs, ys, np.ones_like(xs)], 1)
    _, _, vt = np.linalg.svd(d, full_matrices=False)
    return vt[-1]


yy_f, xx_f = np.mgrid[0:H, 0:W].astype(np.float64)


def distance(kind, p, x=xx_f, y=yy_f):
    if kind == 'line':
        nx, ny, c = p
        return np.abs(nx * x + ny * y + c)
    a, b, c, d_, e, f = p
    val = a * x ** 2 + b * x * y + c * y ** 2 + d_ * x + e * y + f
    gx, gy = 2 * a * x + b * y + d_, b * x + 2 * c * y + e
    return np.abs(val) / np.maximum(np.hypot(gx, gy), 1e-9)


def robust(kind, xs, ys):
    """Fit, drop the stragglers, refit; returns the fit and the points that sit on it."""
    fit = fit_line(xs, ys) if kind == 'line' else fit_conic(xs, ys)
    keep = distance(kind, fit, xs, ys) < 2.5
    fit = fit_line(xs[keep], ys[keep]) if kind == 'line' else fit_conic(xs[keep], ys[keep])
    return fit, xs[keep], ys[keep]


def band(top_x, bottom_x, y_top, y_bottom, width):
    t = (ys_all - y_top) / (y_bottom - y_top)
    return (np.abs(xs_all - (top_x + (bottom_x - top_x) * t)) < width) & (ys_all > y_top + 4) & (ys_all < y_bottom - 6)


court = {}
court['baseline'] = robust('line', *pick((ys_all >= 510) & (ys_all < 529) & (xs_all >= 90) & (xs_all < 490)))
court['lane_l'] = robust('line', *pick(band(161, 121, 519, 640, 7)))
court['lane_r'] = robust('line', *pick(band(417, 456, 519, 640, 7)))
court['ft'] = robust('line', *pick((ys_all >= 632) & (ys_all < 650) & (xs_all >= 125) & (xs_all < 452)))
arc_sel = (ys_all > 560) & (ys_all < 790) & ~((ys_all > 630) & (ys_all < 725) & (xs_all > 140) & (xs_all < 440))
arc_sel &= ~((ys_all < 652) & (xs_all > 100) & (xs_all < 480))
court['arc'] = robust('conic', *pick(arc_sel))


def line_x(p, y):
    nx, ny, c = p
    return -(ny * y + c) / nx


def line_y(p, x):
    nx, ny, c = p
    return -(nx * x + c) / ny


# Where each line really runs (the free-throw line stops at the lanes, the lanes at the two
# horizontal lines, the arc stays on its lower branch).
spans = {
    'baseline': np.ones((H, W), bool),
    'ft': (xx_f >= line_x(court['lane_l'][0], yy_f) - 1) & (xx_f <= line_x(court['lane_r'][0], yy_f) + 1),
    'lane_l': (yy_f >= line_y(court['baseline'][0], xx_f) - 1) & (yy_f <= line_y(court['ft'][0], xx_f) + 1),
    'lane_r': (yy_f >= line_y(court['baseline'][0], xx_f) - 1) & (yy_f <= line_y(court['ft'][0], xx_f) + 1),
    'arc': yy_f > 600,
}


# Real hardwood, not a smooth fill: the hidden floor is rebuilt from patches of the floor around
# it, with the court lines painted out first (they are redrawn below). A smooth offset then makes
# it meet the visible floor exactly at every edge.
lines_band = dilate(line_px, 2)
line_free = np.where(lines_band[..., None], inpaint(img, lines_band | hole, iters=300), img)


def shift_map(rgb, unknown):
    """OpenCV's shift-map inpainting: fills the unknown area with patches of the real floor."""
    import cv2
    bgr = cv2.cvtColor(np.clip(rgb, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR)
    out = np.zeros_like(bgr)
    cv2.xphoto.inpaint(bgr, (~unknown).astype(np.uint8), out, cv2.xphoto.INPAINT_SHIFTMAP)
    return cv2.cvtColor(out, cv2.COLOR_BGR2RGB).astype(np.float64)


# Each seat is rebuilt from the floor (and wall) right around it, so patches come from nearby.
CROWD_END, FLOOR_TOP = 476, 506
yy, xx = np.mgrid[0:H, 0:W]
stanchion = ((xx >= 262) & (xx <= 314) & (yy >= 476) & (yy <= 530)
             & (plate[..., 2] > plate[..., 0] + 15))
copied = plate.copy()
for slot, (sx0, sy0, sw, sh) in SEATS.items():
    # Each band is filled from its own surroundings only, so crowd never lands on the hardwood
    # and the stanchion pad is never stretched sideways.
    x0, x1 = max(0, sx0 - 110), min(W, sx0 + sw + 110)
    for y0, y1, unknown_extra in ((max(0, sy0 - 60), CROWD_END, None),
                                  (FLOOR_TOP, min(H, sy0 + sh + 110), stanchion)):
        if y1 <= y0 or not seat_masks[slot][y0:y1].any():
            continue
        unknown = hole[y0:y1, x0:x1].copy()
        if unknown_extra is not None:
            unknown |= unknown_extra[y0:y1, x0:x1]
        filled = shift_map(line_free[y0:y1, x0:x1], unknown)
        own = seat_masks[slot][y0:y1, x0:x1]
        copied[y0:y1, x0:x1][own] = filled[own]

# The wall and far floor behind the tops of PF and C are the same all along each row: copy each
# row's hidden run from just beyond it on the outer side (PF from its left, C from its right).
for y in range(CROWD_END, FLOOR_TOP):
    row = floor_hole[y]
    if not row.any():
        continue
    xs_run = np.nonzero(row)[0]
    for run in np.split(xs_run, np.nonzero(np.diff(xs_run) > 1)[0] + 1):
        length = run[-1] - run[0] + 3
        shift = -length if run.mean() < W / 2 else length
        src = np.clip(run + shift, 0, W - 1)
        copied[y, run] = line_free[y, src]
if os.environ.get('DUMP'):
    np.save('/tmp/ref2/floor_hole.npy', floor_hole)
    np.save('/tmp/ref2/hole.npy', hole)
    np.save('/tmp/ref2/line_free.npy', line_free)
rim = floor_hole & ~erode(floor_hole, 1)
# Matched against the line-free floor, so a court line touching the edge can't bleed in as haze.
edge_target = inpaint(line_free, hole, iters=400)
offset = np.zeros_like(plate)
offset[rim] = edge_target[rim] - copied[rim]
offset = inpaint(offset, erode(floor_hole, 1), iters=500)
plate[floor_hole] = (copied + offset)[floor_hole]

# Court lines drawn through, lit like the floor around them, at their own measured width.
plate_lum = plate @ np.array([0.299, 0.587, 0.114])
for name, (p, xs, ys) in court.items():
    kind = 'conic' if name == 'arc' else 'line'
    xi, yi = xs.astype(int), ys.astype(int)
    # The paint's own color, brightened or dimmed with the floor light where it is drawn.
    paint = np.median(img[yi, xi], axis=0)
    around = np.median(soft_lum[yi, xi])
    light = np.clip(plate_lum / max(around, 1), 0.7, 1.25)[..., None]
    half = float(np.clip(np.percentile(distance(kind, p, xs, ys), 92) + 0.35, 1.0, 3.2))
    cover = (np.clip(half + 0.5 - distance(kind, p), 0, 1) * floor_hole * spans[name])[..., None]
    plate = plate * (1 - cover) + paint[None, None, :] * light * cover
    print(f'  court {name}: {len(xs)} px, half width {half:.1f}, paint {np.round(paint)}')

# The free-throw circle's dashed half runs on under PG at the same dash length and spacing.
dash_sel = (ys_all > 646) & (ys_all < 702) & (xs_all > 140) & (xs_all < 440)
dxs, dys = pick(dash_sel)
dxs, dys = dxs[distance('conic', court['arc'][0], dxs, dys) > 6], dys[distance('conic', court['arc'][0], dxs, dys) > 6]
# The circle is centred on the free-throw line, midway between the lanes; seen in perspective it is
# an axis-aligned ellipse, so only its two radii are fitted.
cy_line = float(np.median(court['ft'][2]))
cx_ = (line_x(court['lane_l'][0], cy_line) + line_x(court['lane_r'][0], cy_line)) / 2
cy_ = cy_line
# Only the dashes near the ends are visible, so: the horizontal radius from where the dashes meet
# the free-throw line, then the vertical radius solved from every visible dash pixel.
rx_ = float(np.percentile(np.abs(dxs - cx_), 98))
ratio = np.abs(dxs - cx_) / rx_
usable = (ratio < 0.93) & (dys > cy_ + 3)
ry_ = float(np.median(np.abs(dys[usable] - cy_) / np.sqrt(1 - ratio[usable] ** 2)))
dash_p = (1 / rx_ ** 2, 0.0, 1 / ry_ ** 2, -2 * cx_ / rx_ ** 2, -2 * cy_ / ry_ ** 2, cx_ ** 2 / rx_ ** 2 + cy_ ** 2 / ry_ ** 2 - 1)
theta = np.arctan2((dys - cy_) / ry_, (dxs - cx_) / rx_)
# Group the visible pixels into dashes by angle.
order_ = np.sort(theta)
breaks = np.nonzero(np.diff(order_) > 0.035)[0]
starts = np.concatenate([[order_[0]], order_[breaks + 1]])
ends = np.concatenate([order_[breaks], [order_[-1]]])
keep_ = (ends - starts) > 0.01
starts, ends = starts[keep_], ends[keep_]
if len(starts) >= 4:
    centres = (starts + ends) / 2
    period = float(np.median(np.diff(centres)))
    dash_len = float(np.median(ends - starts))
    phase = centres[0]
    t_all = np.arctan2((yy_f - cy_) / ry_, (xx_f - cx_) / rx_)
    on = np.abs(((t_all - phase + period / 2) % period) - period / 2) < dash_len / 2
    xi, yi = dxs.astype(int), dys.astype(int)
    paint = np.median(img[yi, xi], axis=0)
    light = np.clip(plate_lum / max(np.median(soft_lum[yi, xi]), 1), 0.7, 1.25)[..., None]
    half = 1.3
    cover = (np.clip(half + 0.5 - distance('conic', dash_p), 0, 1) * floor_hole * on * (yy_f > cy_))[..., None]
    plate = plate * (1 - cover) + paint[None, None, :] * light * cover
    print(f'  court dashes: {len(starts)} visible, period {period:.3f} rad, dash {dash_len:.3f} rad')

rng = np.random.default_rng(7)
other = hole & ~floor_hole
plate[other] += rng.normal(0, 1.6, size=(other.sum(), 3))
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
