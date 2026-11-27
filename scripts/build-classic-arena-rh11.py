"""
rh11 Classic arena plate: design/classic-rh11/arena-rh11.jpg (720x1280, same composition as the
reference) -> public/images/classic/arena-plate-rh11.webp.

The art maps 1:1 onto the 576x1024 reference space used by app/classic-arena.css, enlarged with
EDSR x2 (see build-classic-arena.py for the model), then extended by 160 units per side, 220 above
and 320 below with blurred mirrored edges that fall off to the arena navy.

    /tmp/sr/bin/python scripts/build-classic-arena-rh11.py
"""

import os
import cv2
import numpy as np
from PIL import Image, ImageFilter

SRC = 'design/classic-rh11/arena-rh11.jpg'
OUT = 'public/images/classic/arena-plate-rh11.webp'
MODEL = os.environ.get('EDSR_MODEL', '/tmp/srm/EDSR_x2.pb')
K = 2.5  # plate px per reference unit
PAD_X, PAD_TOP, PAD_BOTTOM = 160, 220, 320
NAVY = np.array([2, 8, 21], dtype=np.float64)

sr = cv2.dnn_superres.DnnSuperResImpl_create()
sr.readModel(MODEL)
sr.setModel('edsr', 2)
bgr = cv2.imread(SRC)
up = sr.upsample(bgr)
rw, rh = round(576 * K), round(1024 * K)
up = cv2.resize(up, (rw, rh), interpolation=cv2.INTER_AREA)
ref = cv2.cvtColor(up, cv2.COLOR_BGR2RGB).astype(np.float64)

px, pt, pb = round(PAD_X * K), round(PAD_TOP * K), round(PAD_BOTTOM * K)
padded = cv2.copyMakeBorder(ref, pt, pb, px, px, cv2.BORDER_REFLECT_101)
H, W, _ = padded.shape

# Blur the extension (not the art), strongest far from the stage.
blur = np.asarray(Image.fromarray(padded.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(28))).astype(np.float64)
yy, xx = np.mgrid[0:H, 0:W]
dx = np.maximum(np.maximum(px - xx, xx - (px + rw - 1)), 0) / px
dy_top = np.maximum(pt - yy, 0) / pt
dy_bot = np.maximum(yy - (pt + rh - 1), 0) / pb
d = np.clip(np.maximum(np.maximum(dx, dy_top), dy_bot), 0, 1)[..., None]
mix = np.clip(d * 6, 0, 1)
out = padded * (1 - mix) + blur * mix
# Fall off to the arena navy toward the plate's outer edge.
fall = np.clip((d - 0.15) / 0.85, 0, 1) ** 1.2
out = out * (1 - fall * 0.92) + NAVY * (fall * 0.92)

img = Image.fromarray(out.clip(0, 255).astype(np.uint8))
img.save(OUT, 'WEBP', quality=86, method=6)
print(OUT, img.size, os.path.getsize(OUT) // 1024, 'KB')
