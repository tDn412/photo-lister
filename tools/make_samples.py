#!/usr/bin/env python3
"""Generate the demo product photos bundled with Photo Lister.

These are synthetic illustrations, not real product photography, so the demo
works offline and has no licensing issues. Run: python3 tools/make_samples.py
"""

from __future__ import annotations

import json
import math
import os
import random
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

W, H = 1800, 1350
FINAL_W, FINAL_H = 1200, 900
K = 3  # supersampling factor while drawing (600x450 logical canvas)
LW, LH = 600, 450
OUT = os.path.join(os.path.dirname(__file__), "..", "samples")
os.makedirs(OUT, exist_ok=True)

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def font(size, bold=True):
    path = FONT_BOLD if bold else FONT_REG
    try:
        return ImageFont.truetype(path, int(size * K))
    except OSError:
        return ImageFont.load_default()


def hexrgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def gradient_bg(top, bottom, glow=(255, 255, 255), glow_strength=0.20, seed=1):
    small = Image.new("RGB", (8, 256))
    td = ImageDraw.Draw(small)
    a, b = hexrgb(top), hexrgb(bottom)
    for y in range(256):
        t = y / 255
        td.line([(0, y), (8, y)], fill=tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(3)))
    bg = small.resize((W, H), Image.Resampling.BICUBIC).convert("RGB")

    # Soft light from upper-left.
    radial = ImageOps.invert(Image.radial_gradient("L")).resize((W * 2, H * 2), Image.Resampling.BICUBIC)
    radial = radial.crop((W // 3, H // 6, W // 3 + W, H // 6 + H))
    tint = Image.new("RGB", (W, H), glow)
    mask = radial.point(lambda p: int(p * glow_strength))
    bg = Image.composite(tint, bg, mask)

    rng = random.Random(seed)
    noise = Image.effect_noise((W, H), 18).convert("RGB")
    bg = Image.blend(bg, noise, 0.018)

    vignette = Image.radial_gradient("L").resize((W, H), Image.Resampling.BICUBIC)
    dark = Image.new("RGB", (W, H), (12, 12, 14))
    bg = Image.composite(dark, bg, vignette.point(lambda p: int(p * 0.26)))
    return bg


def px(flat):
    return [v * K for v in flat]


def rr(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(px(box), radius=radius * K, fill=fill, outline=outline, width=max(1, int(width * K)))


def ellipse(draw, box, fill, outline=None, width=1):
    draw.ellipse(px(box), fill=fill, outline=outline, width=max(1, int(width * K)))


def polygon(draw, points, fill, outline=None):
    draw.polygon([(x * K, y * K) for x, y in points], fill=fill, outline=outline)


def line(draw, points, fill, width=1, joint="curve"):
    draw.line([(x * K, y * K) for x, y in points], fill=fill, width=max(1, int(width * K)), joint=joint)


def shadow(base, box, blur=18, alpha=70):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse(px(box), fill=(10, 10, 12, alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(blur * K / 2))
    base.alpha_composite(layer)


def screen_gradient(size, colors, radius, glow_color=(255, 255, 255)):
    w, h = size
    small = Image.new("RGB", (4, 256))
    d = ImageDraw.Draw(small)
    stops = colors
    for y in range(256):
        t = y / 255
        pos = t * (len(stops) - 1)
        i = min(int(pos), len(stops) - 2)
        f = pos - i
        c = tuple(round(stops[i][j] * (1 - f) + stops[i + 1][j] * f) for j in range(3))
        d.line([(0, y), (4, y)], fill=c)
    img = small.resize((w * K, h * K), Image.Resampling.BICUBIC).convert("RGBA")

    # Abstract wallpaper shapes.
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    ww, hh = img.size
    od.ellipse((ww * 0.52, hh * 0.42, ww * 1.25, hh * 1.25), fill=(255, 255, 255, 32))
    od.ellipse((ww * -0.35, hh * 0.62, ww * 0.65, hh * 1.4), fill=(255, 180, 120, 42))
    od.arc((ww * 0.1, hh * 0.1, ww * 0.9, hh * 0.95), 200, 340, fill=(255, 255, 255, 55), width=int(3 * K))
    img.alpha_composite(overlay)

    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, img.size[0] - 1, img.size[1] - 1), radius=radius * K, fill=255)
    img.putalpha(mask)
    return img


def add_grain(img, amount=0.02):
    noise = Image.effect_noise(img.size, 14).convert("RGB")
    return Image.blend(img, noise, amount)


def finish(img, name):
    img = img.convert("RGB").resize((FINAL_W, FINAL_H), Image.Resampling.LANCZOS)
    img = add_grain(img, 0.012)
    img.save(os.path.join(OUT, name), "JPEG", quality=90, optimize=True, progressive=True)
    print("wrote", name)


# ────────────────────────────── products ──────────────────────────────

def phone(name, body_color, screen_colors, seed):
    bg = gradient_bg("#eee7dd", "#cfc5b7", glow=(255, 250, 240), seed=seed).convert("RGBA")
    shadow(bg, [233, 384, 370, 418], blur=16, alpha=95)
    d = ImageDraw.Draw(bg)

    rr(d, [224, 62, 376, 414], 34, body_color, outline="#2b2b30", width=1)
    rr(d, [229, 67, 371, 409], 30, "#06070a")
    scr = screen_gradient((136, 334), screen_colors, 27)
    bg.alpha_composite(scr, (232 * K, 70 * K))

    # punch-hole camera + speaker
    ellipse(d, [292, 75, 308, 91], "#05060a")
    ellipse(d, [297, 80, 303, 86], "#26334f")
    rr(d, [284, 81, 316, 84], 2, "#101116")

    # buttons
    rr(d, [219, 128, 223, 166], 2, "#3d3d44")
    rr(d, [219, 178, 223, 208], 2, "#3d3d44")
    rr(d, [377, 168, 381, 228], 2, "#3d3d44")

    # glass reflection
    refl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    rd = ImageDraw.Draw(refl)
    rd.polygon([(250 * K, 74 * K), (296 * K, 74 * K), (244 * K, 402 * K), (228 * K, 402 * K)], fill=(255, 255, 255, 18))
    bg.alpha_composite(refl.filter(ImageFilter.GaussianBlur(2)))

    # small card with model text
    rr(d, [397, 357, 508, 397], 9, (250, 247, 242, 230), outline=(220, 213, 201, 255))
    d.text((409 * K, 366 * K), "256GB · LIKE NEW", font=font(8), fill="#6f6a61")

    finish(bg, name)


def laptop(name, seed):
    bg = gradient_bg("#e7e9ec", "#c6cbd1", glow=(255, 255, 255), seed=seed).convert("RGBA")
    shadow(bg, [152, 363, 450, 407], blur=18, alpha=100)
    d = ImageDraw.Draw(bg)

    # lid
    rr(d, [146, 76, 454, 332], 11, "#c8ccd2", outline="#9ca2aa", width=1)
    rr(d, [153, 83, 447, 322], 7, "#1a1c22")
    scr = screen_gradient((294, 239), [(36, 54, 94), (36, 120, 139), (238, 154, 104)], 5)
    bg.alpha_composite(scr, (156 * K, 86 * K))
    # UI bars on wallpaper for scale
    d.rectangle(px([169, 99, 437, 108]), fill=(245, 246, 248, 60))
    for i in range(4):
        d.rounded_rectangle(px([173 + i * 16, 116, 183 + i * 16, 126]), radius=2 * K, fill=(255, 255, 255, 52))

    # base
    polygon(d, [(132, 332), (468, 332), (482, 349), (118, 349)], "#b4bac2", outline="#8f969f")
    polygon(d, [(118, 349), (482, 349), (474, 357), (126, 357)], "#9ba2ab", outline="#7f8790")
    rr(d, [287, 349, 313, 353], 2, "#7f8790")
    # keyboard hint
    for i in range(9):
        x = 165 + i * 30
        line(d, [(x, 338), (x + 20, 338)], "#aab1ba", width=1)

    finish(bg, name)


def camera(name, seed):
    bg = gradient_bg("#d9ded8", "#9fa79f", glow=(252, 255, 249), seed=seed).convert("RGBA")
    shadow(bg, [178, 352, 438, 394], blur=15, alpha=100)
    d = ImageDraw.Draw(bg)

    # body
    rr(d, [176, 138, 426, 354], 16, "#26272a", outline="#111215", width=1)
    rr(d, [176, 138, 426, 175], 8, "#393a3e")
    # grip
    rr(d, [185, 172, 236, 344], 9, "#1c1d20")
    for i in range(9):
        line(d, [(192, 195 + i * 14), (229, 195 + i * 14)], "#2c2d31", width=2)
    # top dials
    rr(d, [255, 122, 300, 144], 4, "#3b3c40")
    rr(d, [316, 120, 350, 144], 4, "#3b3c40")
    rr(d, [350, 132, 388, 145], 3, "#2b2c30")
    # viewfinder
    rr(d, [300, 147, 372, 199], 4, "#1b1c1f")
    # lens rings
    for radius, color in [(92, "#111214"), (82, "#2a2b2f"), (65, "#090a0c"), (55, "#1e2024"), (44, "#08090b")]:
        ellipse(d, [300 - radius, 257 - radius, 300 + radius, 257 + radius], color, outline="#3a3b40")
    # glass
    glass = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glass)
    gd.ellipse(px([263, 220, 337, 294]), fill=(30, 44, 52, 255))
    gd.ellipse(px([272, 229, 330, 287]), fill=(19, 65, 81, 255))
    gd.ellipse(px([283, 236, 313, 266]), fill=(88, 36, 92, 255))
    gd.ellipse(px([291, 244, 305, 258]), fill=(180, 112, 62, 210))
    gd.ellipse(px([281, 233, 303, 248]), fill=(255, 255, 255, 70))
    bg.alpha_composite(glass)
    # brand text
    d.text((365 * K, 315 * K), "α7 III", font=font(11), fill="#b9bcc2")
    d.text((194 * K, 322 * K), "SONY", font=font(9), fill="#8f9299")

    finish(bg, name)


def sneaker(name, seed):
    bg = gradient_bg("#efe4d8", "#d5bfa9", glow=(255, 247, 236), seed=seed).convert("RGBA")
    shadow(bg, [130, 352, 470, 393], blur=16, alpha=100)
    d = ImageDraw.Draw(bg)

    # sole
    polygon(
        d,
        [(129, 350), (147, 363), (186, 370), (410, 370), (455, 361), (468, 344), (447, 331), (168, 331), (139, 335)],
        "#f3efe8",
        outline="#c9c1b4",
    )
    line(d, [(140, 341), (458, 341)], "#d9d2c6", width=2)
    # upper
    polygon(
        d,
        [(150, 330), (160, 270), (196, 235), (262, 224), (310, 237), (370, 288), (405, 310), (452, 327), (445, 341), (166, 341)],
        "#f7f5f1",
        outline="#cfc8bc",
    )
    # toe cap
    polygon(d, [(150, 330), (158, 277), (185, 251), (220, 260), (232, 300), (222, 336), (164, 338)], "#eeebe4")
    # heel
    polygon(d, [(393, 296), (437, 304), (455, 327), (442, 339), (399, 333)], "#e8e4dc")
    # laces
    for i in range(4):
        x = 232 + i * 27
        line(d, [(x, 252 + i * 9), (x + 34, 266 + i * 9)], "#b9b1a3", width=3)
        line(d, [(x + 4, 260 + i * 9), (x + 30, 250 + i * 9)], "#d6cec1", width=2)
    # swoosh-ish mark
    d.arc(px([278, 274, 432, 352]), 195, 325, fill="#17181c", width=int(5 * K))
    # tongue + heel tab
    rr(d, [292, 228, 345, 257], 7, "#f7f5f1", outline="#d3ccc0")
    rr(d, [422, 292, 445, 318], 4, "#17181c")
    d.text((452 * K, 377 * K), "AIR FORCE 1", font=font(8), fill="#8d8173")

    finish(bg, name)


def chair(name, seed):
    bg = gradient_bg("#e8e5df", "#c5c0b6", glow=(255, 255, 250), seed=seed).convert("RGBA")
    shadow(bg, [205, 356, 400, 400], blur=17, alpha=100)
    d = ImageDraw.Draw(bg)

    # backrest
    rr(d, [253, 64, 347, 236], 22, "#3b3d42", outline="#2a2c30")
    rr(d, [263, 76, 337, 224], 17, "#4a4c52")
    for i in range(7):
        y = 88 + i * 19
        line(d, [(267, y), (333, y)], "#3d3f45", width=2)
    # headrest
    rr(d, [276, 48, 324, 77], 11, "#414349", outline="#2a2c30")
    # seat
    rr(d, [224, 236, 376, 292], 19, "#43454b", outline="#2c2e33")
    rr(d, [232, 243, 368, 281], 14, "#4d4f56")
    # armrests
    line(d, [(246, 238), (237, 206), (247, 196)], "#2e3034", width=5)
    line(d, [(354, 238), (363, 206), (353, 196)], "#2e3034", width=5)
    rr(d, [224, 192, 262, 202], 4, "#606268")
    rr(d, [338, 192, 376, 202], 4, "#606268")
    # gas lift
    rr(d, [291, 292, 309, 337], 5, "#7d8086")
    rr(d, [286, 310, 314, 326], 4, "#56585e")
    # five-star base
    for angle in (18, 90, 162, 234, 306):
        rad = math.radians(angle)
        x2 = 300 + math.cos(rad) * 78
        y2 = 348 + math.sin(rad) * 22
        line(d, [(300, 338), (x2, y2)], "#5b5d63", width=6)
        ellipse(d, [x2 - 8, y2 - 5, x2 + 8, y2 + 7], "#2a2c30")
    # brand mark
    d.text((281 * K, 257 * K), "IKEA", font=font(8), fill="#c9c4b9")

    finish(bg, name)


def speaker(name, seed):
    bg = gradient_bg("#d8cfc3", "#a89988", glow=(255, 248, 238), seed=seed).convert("RGBA")
    shadow(bg, [218, 370, 382, 408], blur=14, alpha=105)
    d = ImageDraw.Draw(bg)

    rr(d, [222, 76, 378, 392], 20, "#171615", outline="#070707")
    rr(d, [231, 85, 369, 383], 15, "#262421")
    # gold panel
    rr(d, [242, 102, 358, 154], 5, "#c8a96a", outline="#8d7442")
    d.text((254 * K, 114 * K), "MARSHALL", font=font(14), fill="#151310")
    d.text((298 * K, 137 * K), "EST. 1962", font=font(5), fill="#3e3322")
    # knobs
    for x in (263, 300, 337):
        ellipse(d, [x - 9, 168, x + 9, 186], "#c8a96a", outline="#8d7442")
        line(d, [(x, 172), (x, 177)], "#262421", width=2)
    # mesh
    for row in range(12):
        for col in range(8):
            cx = 258 + col * 12
            cy = 210 + row * 12
            d.ellipse(px([cx, cy, cx + 4, cy + 4]), fill="#4a4741")
    # logo + brass strip
    d.text((283 * K, 363 * K), "MARSHALL", font=font(6, False), fill="#8d8578")
    line(d, [(244, 356), (356, 356)], "#6f6659", width=1)

    finish(bg, name)


def lens(name, seed):
    bg = gradient_bg("#d5d8db", "#a9afb4", glow=(255, 255, 255), seed=seed).convert("RGBA")
    shadow(bg, [197, 351, 403, 390], blur=16, alpha=100)
    d = ImageDraw.Draw(bg)

    # barrel
    rr(d, [210, 106, 390, 356], 14, "#18191b", outline="#060606")
    rr(d, [220, 116, 380, 346], 9, "#242528")
    # focus rings
    for y in (124, 132, 140, 336, 344):
        line(d, [(222, y), (378, y)], "#35363a", width=2)
    # gold ring
    rr(d, [220, 206, 380, 231], 3, "#b6975d")
    d.text((255 * K, 211 * K), "50mm  1:1.8", font=font(9), fill="#17150f")
    # front glass
    for radius, color in [(101, "#101113"), (91, "#2b2c30"), (74, "#090a0c"), (62, "#1e2025"), (48, "#08090b")]:
        ellipse(d, [300 - radius, 272 - radius, 300 + radius, 272 + radius], color, outline="#3b3c41")
    glass = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glass)
    gd.ellipse(px([258, 230, 342, 314]), fill=(18, 61, 72, 255))
    gd.ellipse(px([270, 242, 330, 302]), fill=(30, 34, 62, 255))
    gd.ellipse(px([282, 254, 318, 290]), fill=(98, 45, 32, 220))
    gd.ellipse(px([275, 240, 301, 259]), fill=(255, 255, 255, 76))
    gd.ellipse(px([296, 259, 311, 274]), fill=(201, 148, 82, 160))
    bg.alpha_composite(glass)
    # white markings
    d.text((245 * K, 155 * K), "CANON", font=font(10), fill="#9b9da2")
    d.text((262 * K, 173 * K), "EF LENS", font=font(6, False), fill="#77797e")

    finish(bg, name)


def jacket(name, seed):
    bg = gradient_bg("#e9e1d7", "#c9b8a6", glow=(255, 250, 243), seed=seed).convert("RGBA")
    shadow(bg, [215, 368, 385, 406], blur=13, alpha=80)
    d = ImageDraw.Draw(bg)

    # hanger
    d.arc(px([285, 37, 315, 62]), 180, 360, fill="#8a7d6c", width=int(2 * K))
    line(d, [(300, 60), (300, 82)], "#8a7d6c", width=2)
    line(d, [(300, 82), (214, 124)], "#8a7d6c", width=2)
    line(d, [(300, 82), (386, 124)], "#8a7d6c", width=2)

    # jacket silhouette
    polygon(
        d,
        [
            (248, 112), (270, 100), (300, 110), (330, 100), (352, 112),
            (382, 180), (393, 252), (366, 262), (352, 218), (356, 366),
            (244, 366), (248, 218), (234, 262), (207, 252), (218, 180),
        ],
        "#25324d",
        outline="#182338",
    )
    # quilt panels
    for i in range(7):
        y = 182 + i * 26
        line(d, [(252, y), (348, y)], "#31405f", width=2)
    # sleeves seams
    line(d, [(248, 218), (248, 362)], "#1b2740", width=2)
    line(d, [(352, 218), (352, 362)], "#1b2740", width=2)
    # collar
    polygon(d, [(270, 100), (300, 111), (300, 148), (264, 128)], "#1d2940", outline="#152035")
    polygon(d, [(330, 100), (300, 111), (300, 148), (336, 128)], "#1d2940", outline="#152035")
    # zipper
    line(d, [(300, 148), (300, 364)], "#8d97a8", width=2)
    rr(d, [296, 168, 304, 182], 2, "#a9b2c0")
    # pockets
    line(d, [(255, 284), (283, 306), (280, 318)], "#1c2841", width=2)
    line(d, [(345, 284), (317, 306), (320, 318)], "#1c2841", width=2)
    # brand tag
    rr(d, [330, 340, 348, 354], 2, "#f4f2ed")
    d.text((332 * K, 342 * K), "UNIQLO", font=font(3, False), fill="#b33a32")

    finish(bg, name)


def airpods(name, seed):
    bg = gradient_bg("#dfe7df", "#b6c3b7", glow=(252, 255, 250), seed=seed).convert("RGBA")
    shadow(bg, [230, 344, 370, 384], blur=14, alpha=85)
    d = ImageDraw.Draw(bg)

    # case
    rr(d, [242, 156, 358, 345], 38, "#f6f5f2", outline="#c8c8c4")
    rr(d, [242, 156, 358, 216], 34, "#fbfaf8", outline="#c8c8c4")
    line(d, [(244, 215), (356, 215)], "#d2d1cc", width=2)
    ellipse(d, [294, 231, 306, 243], "#d9e3d5", outline="#b8c5b3")
    # buds
    for cx, flip in ((178, 1), (422, -1)):
        rr(d, [cx - 18, 210, cx + 18, 300], 15, "#f8f7f4", outline="#c9c9c5")
        rr(d, [cx - 12, 300, cx + 12, 352], 11, "#f3f2ef", outline="#c9c9c5")
        ellipse(d, [cx - 8, 220, cx + 8, 238], "#4b4b4b")
    # soft highlights
    refl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    rd = ImageDraw.Draw(refl)
    rd.ellipse(px([258, 172, 286, 330]), fill=(255, 255, 255, 80))
    bg.alpha_composite(refl.filter(ImageFilter.GaussianBlur(5)))
    d.text((270 * K, 360 * K), "AIRPODS PRO", font=font(7), fill="#6d7a6c")

    finish(bg, name)


def main():
    rng = random.Random(42)
    phone("iphone-13-pro-256gb.jpg", "#4c5564", [(64, 42, 112), (118, 80, 158), (211, 138, 141)], 11)
    phone("xiaomi-redmi-note-12.jpg", "#26313d", [(20, 46, 72), (29, 117, 126), (126, 201, 163)], 12)
    laptop("macbook-air-m2-8-256.jpg", 13)
    camera("sony-a7iii-camera-body.jpg", 14)
    sneaker("nike-air-force-1-size-42.jpg", 15)
    chair("ikea-office-chair.jpg", 16)
    speaker("marshall-bluetooth-speaker.jpg", 17)
    lens("canon-ef-50mm-lens.jpg", 18)
    jacket("uniqlo-ultralight-down-jacket.jpg", 19)
    airpods("airpods-pro-2.jpg", 20)

    files = [
        "iphone-13-pro-256gb.jpg",
        "macbook-air-m2-8-256.jpg",
        "sony-a7iii-camera-body.jpg",
        "nike-air-force-1-size-42.jpg",
        "ikea-office-chair.jpg",
        "marshall-bluetooth-speaker.jpg",
        "canon-ef-50mm-lens.jpg",
        "uniqlo-ultralight-down-jacket.jpg",
        "airpods-pro-2.jpg",
        "xiaomi-redmi-note-12.jpg",
    ]
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump({"files": files}, f, indent=2)
    print("wrote manifest.json")


if __name__ == "__main__":
    main()
