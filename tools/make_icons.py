"""Draw the app icons (blue square, white notebook page with a check)."""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
OUT.mkdir(exist_ok=True)
BLUE, DARK, WHITE = (42, 120, 214), (24, 79, 149), (255, 255, 255)


def draw(size, pad_frac):
    s = 4 * size  # supersample, then shrink for smooth edges
    im = Image.new("RGB", (s, s), BLUE)
    d = ImageDraw.Draw(im)
    p = int(s * pad_frac)
    page = (p, int(p * 0.85), s - p, s - int(p * 0.85))
    d.rounded_rectangle(page, radius=int(s * 0.05), fill=WHITE)
    x0, y0, x1, y1 = page
    w, h = x1 - x0, y1 - y0
    for i in range(3):
        y = y0 + h * (0.28 + 0.2 * i)
        d.rounded_rectangle((x0 + w * 0.36, y - h * 0.03, x1 - w * 0.14, y + h * 0.03),
                            radius=int(h * 0.03), fill=(158, 197, 244))
        cx, cy = x0 + w * 0.2, y
        r = h * 0.055
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=BLUE)
    lw = int(h * 0.07)
    d.line([(x0 + w * 0.45, y0 + h * 0.86), (x0 + w * 0.58, y0 + h * 0.97),
            (x0 + w * 0.92, y0 + h * 0.66)], fill=DARK, width=lw, joint="curve")
    return im.resize((size, size), Image.LANCZOS)


draw(192, 0.2).save(OUT / "icon-192.png")
draw(512, 0.2).save(OUT / "icon-512.png")
draw(512, 0.28).save(OUT / "icon-maskable-512.png")
draw(180, 0.2).save(OUT / "apple-touch-icon.png")
print("icons written to", OUT)
