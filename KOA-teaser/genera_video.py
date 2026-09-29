# -*- coding: utf-8 -*-
# KOA Browser — filmato astratto 1920x1080, nessun screenshot reale, nessun dettaglio update
import math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import imageio.v2 as imageio
import imageio_ffmpeg

W, H, FPS = 1920, 1080, 30
OUT = os.path.join(os.path.dirname(__file__), "KOA-browser-teaser.mp4")

def font(size, bold=False):
    for p in ["C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
              "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/dejavu/DejaVuSans.ttf"]:
        if os.path.exists(p):
            try: return ImageFont.truetype(p, size)
            except: pass
    return ImageFont.load_default()

F_KICK = font(28, True); F_BIG = font(120, True); F_MID = font(72, True); F_SUB = font(30); F_KANJI = font(520, True)

SCENES = [
    ("TEASER UFFICIALE", "KOA", "BROWSER", "La via giapponese del web — legno, vermiglio, silenzio.", 8),
    ("01 — FILOSOFIA", "Non un browser.", "Un dojo digitale.", "Calmo, caldo, materico. Veloce all'avvio, silenzioso in background.", 8),
    ("02 — SPAZIO DI LAVORO", "Pensa su 2, 3, 4 vie", "contemporaneamente.", "Schede trascinabili e pannelli affiancati con divisori fluidi.", 8),
    ("03 — FLUIDITA'", "Un fluido,", "non una barra.", "Ricerca + indirizzi in un tubo di luce. Vetro liquido reale.", 8),
    ("04 — ZEN SUPERVISOR", "Silenzio", "protetto.", "Anti-tracciamento + anti-pubblicita' veri, con contatore live.", 8),
    ("05 — VAULT & CHAT KOA", "Cassaforte.", "E mente.", "Password cifrate con PIN e autofill. Assistente con riassunti e azioni rapide.", 8),
    ("06 — ECOSISTEMA", "Tutto.", "Senza rumore.", "Cronologia • Preferiti • Download in vetro • Trova • Turbo • Start offline", 8),
    ("07 — SEMPRE NUOVO", "Sempre nuovo.", "Sempre sicuro.", "Aggiornato e verificato in automatico. Tu non devi fare nulla.", 7),
    ("FINALE — KOA BROWSER", "La via", "del web.", "Legno. Vermiglio. Silenzio. Potenza. — KOA Browser", 8),
]

try:
    LOGO = Image.open(os.path.join(os.path.dirname(__file__), "koa-logo.png")).convert("RGBA").resize((220, 220))
except Exception:
    LOGO = None

def bg_frame(t):
    img = Image.new("RGB", (W, H), (13, 9, 6))
    d = ImageDraw.Draw(img, "RGBA")
    for y in range(0, H, 4):
        r = int(20 + 14 * math.sin(y * 0.01 + t * 0.4))
        d.line([(0, y), (W, y)], fill=(r + 8, 10, 6))
    d.ellipse([-500, -500, 1400, 900], fill=(46, 20, 8, 255))
    vx, vy = W * 0.78, H * 0.30
    for r in range(420, 0, -14):
        a = max(0, 26 - r // 22)
        d.ellipse([vx - r, vy - r, vx + r, vy + r], outline=(232, 68, 27, a))
    # petali
    for i in range(46):
        px = (i * 397 + int(t * (20 + i % 5 * 12))) % (W + 100) - 50
        py = (i * 631 + int(t * (30 + i % 7 * 9))) % (H + 100) - 50
        c = (232, 106, 61, 110) if i % 3 == 0 else (245, 237, 224, 60)
        d.ellipse([px, py, px + 9, py + 6], fill=c)
    return img

def draw_scene(base, si, local, alpha_in=1.0):
    img = base.copy()
    d = ImageDraw.Draw(img, "RGBA")
    kick, l1, l2, sub, _ = SCENES[si]
    cx0, cy0 = 1330, 520
    # watermark astratto (niente kanji: font di sistema senza glifi CJK -> rettangoli bianchi)
    d.ellipse([cx0 - 180, cy0 - 240, cx0 + 180, cy0 + 240], outline=(255, 255, 255, 18), width=2)
    y0 = 300
    d.text((140, y0 - 70), kick, font=F_KICK, fill=(201, 168, 106, 255))
    d.line([(140, y0 - 28), (140 + 120, y0 - 28)], fill=(232, 68, 27, 255), width=4)
    d.text((140, y0), l1, font=F_BIG, fill=(245, 237, 224, 255))
    d.text((140, y0 + 135), l2, font=F_BIG, fill=(232, 68, 27, 255))
    d.text((140, y0 + 290), sub, font=F_SUB, fill=(245, 237, 224, 200))
    # visual astratto a destra
    if si == 0 and LOGO is not None:
        img.paste(LOGO, (cx0 - 110, cy0 - 220), LOGO)
        d.text((cx0 - 140, cy0 + 20), "K  •  vermiglio  •  legno", font=F_SUB, fill=(255, 255, 255, 160))
    elif si == 2:
        for r, c in enumerate([(0, 0), (1, 0), (0, 1), (1, 1)]):
            x = cx0 - 200 + c[0] * 210; y = cy0 - 140 + c[1] * 150
            d.rounded_rectangle([x, y, x + 195, y + 135], 18, fill=(255, 255, 255, 26), outline=(232, 68, 27, 200), width=2)
    elif si == 3:
        d.rounded_rectangle([cx0 - 260, cy0 - 40, cx0 + 260, cy0 + 40], 40, fill=(255, 255, 255, 30), outline=(232, 68, 27, 255), width=3)
        off = int((local * 220) % 200)
        d.rounded_rectangle([cx0 - 240 + off - 60, cy0 - 28, cx0 - 240 + off + 60, cy0 + 28], 28, fill=(232, 68, 27, 220))
    elif si == 4:
        d.ellipse([cx0 - 130, cy0 - 130, cx0 + 130, cy0 + 130], fill=(232, 68, 27, 255), outline=(255, 255, 255, 90), width=4)
        d.ellipse([cx0 - 28, cy0 - 28, cx0 + 28, cy0 + 28], fill=(255, 255, 255, 255))
        d.ellipse([cx0 - 12, cy0 - 12, cx0 + 12, cy0 + 12], fill=(232, 68, 27, 255))
        d.text((cx0 - 110, cy0 + 150), f"+{(1284 + int(local * 40)):,} bloccati".replace(",", "."), font=F_SUB, fill=(255, 255, 255, 220))
    elif si == 5:
        d.ellipse([cx0 - 120, cy0 - 120, cx0 + 120, cy0 + 120], outline=(201, 168, 106, 255), width=10)
        d.ellipse([cx0 - 100, cy0 - 100, cx0 + 100, cy0 + 100], fill=(30, 18, 10, 255))
        d.text((cx0 - 22, cy0 - 48), "*", font=font(80, True), fill=(232, 68, 27, 255))
    elif si == 6:
        for i in range(6):
            x = cx0 - 260 + (i % 3) * 180; y = cy0 - 120 + (i // 3) * 130
            d.rounded_rectangle([x, y, x + 165, y + 110], 14, fill=(255, 255, 255, 22), outline=(255, 255, 255, 60), width=1)
    # letterbox
    d.rectangle([0, 0, W, 86], fill=(0, 0, 0, 255)); d.rectangle([0, H - 86, W, H], fill=(0, 0, 0, 255))
    d.text((60, H - 60), "KOA TEASER — rappresentazione astratta • interfaccia reale non mostrata", font=font(20), fill=(200, 180, 150, 255))
    d.text((W - 200, H - 60), f"{si+1:02d} / {len(SCENES):02d}", font=font(20, True), fill=(232, 68, 27, 255))
    if alpha_in < 1.0:
        img = Image.blend(Image.new("RGB", (W, H), (0, 0, 0)), img, alpha_in)
    return img

frames = []
tt = 0.0
for si, (_, _, _, _, dur) in enumerate(SCENES):
    n = dur * FPS
    for f in range(n):
        local = f / FPS
        g = tt + local
        base = bg_frame(g)
        a = min(1.0, f / 12.0)
        if f > n - 12: a = min(a, (n - f) / 12.0)
        frames.append(draw_scene(base, si, local, max(0.0, a)))
    tt += dur

print(f"frame: {len(frames)}, durata: {tt}s")
exe = imageio_ffmpeg.get_ffmpeg_exe()
w = imageio.get_writer(OUT, fps=FPS, codec="libx264", quality=8, macro_block_size=None,
                       ffmpeg_params=["-pix_fmt", "yuv420p", "-movflags", "+faststart"])
for im in frames:
    w.append_data(np.asarray(im))
w.close()
print("OK:", OUT, os.path.getsize(OUT))
