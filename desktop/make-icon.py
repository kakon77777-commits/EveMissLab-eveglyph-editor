#!/usr/bin/env python3
"""Generate icon.png (256 px) and icon.ico (16-256 px) from the same mark as the website favicon:
a green hexagon outline on a dark rounded square. Needs Pillow:  python make-icon.py
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
BG, FG = (15, 23, 42, 255), (34, 197, 94, 255)      # #0F172A / #22C55E
SS = 1024                                            # supersampled canvas, downsampled with LANCZOS


def render(size):
    k = SS / 32.0                                    # the favicon is drawn on a 32 x 32 grid
    img = Image.new("RGBA", (SS, SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, SS - 1, SS - 1], radius=6 * k, fill=BG)
    pts = [(16, 6), (25, 11), (25, 21), (16, 26), (7, 21), (7, 11)]
    px = [(x * k, y * k) for x, y in pts]
    d.line(px + [px[0], px[1]], fill=FG, width=int(2 * k), joint="curve")
    for x, y in px:                                  # round the corners like stroke-linejoin="round"
        r = k
        d.ellipse([x - r, y - r, x + r, y + r], fill=FG)
    return img.resize((size, size), Image.LANCZOS)


sizes = [16, 24, 32, 48, 64, 128, 256]
master = render(256)
master.save(os.path.join(HERE, "icon.png"))
master.save(os.path.join(HERE, "icon.ico"), format="ICO", sizes=[(s, s) for s in sizes])
print("wrote icon.png and icon.ico", sizes)
