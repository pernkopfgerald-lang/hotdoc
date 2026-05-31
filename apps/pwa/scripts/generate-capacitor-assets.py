"""
Generiert die Source-Assets fuer @capacitor/assets aus dem FF-Eberstalzell-
Logo. Wird einmalig manuell aufgerufen.

Output:
    resources/icon.png         1024x1024  — Logo auf weissem Hintergrund (Foreground+Background)
    resources/icon-foreground.png 1024x1024 — nur Logo (transparenter Bg, Safe-Area)
    resources/icon-background.png 1024x1024 — voll-flaechiges Weiss (oder Farbe)
    resources/splash.png       2732x2732  — Logo auf Brand-Hintergrund

Aufruf:
    python apps/pwa/scripts/generate-capacitor-assets.py
"""
from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOGO = ROOT / "public" / "ff-eberstalzell-logo.png"
OUT = ROOT / "resources"
OUT.mkdir(parents=True, exist_ok=True)

logo = Image.open(LOGO).convert("RGBA")
lw, lh = logo.size

def square(size: int, bg: tuple, scale_fraction: float) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg)
    inner = int(size * scale_fraction)
    scale = min(inner / lw, inner / lh)
    sw, sh = int(lw * scale), int(lh * scale)
    resized = logo.resize((sw, sh), Image.LANCZOS)
    canvas.paste(resized, ((size - sw) // 2, (size - sh) // 2), resized)
    return canvas

# Standard-Icon: 1024x1024, weisser BG, 70% Logo
icon = square(1024, (255, 255, 255, 255), 0.70)
icon.save(OUT / "icon.png", optimize=True)
print(f"wrote {OUT / 'icon.png'}")

# Foreground-Layer fuer Android-Adaptive-Icons: 1024x1024, transparent,
# 60% Logo (Safe-Area fuer Android-Mask)
fg = square(1024, (0, 0, 0, 0), 0.60)
fg.save(OUT / "icon-foreground.png", optimize=True)
print(f"wrote {OUT / 'icon-foreground.png'}")

# Background-Layer fuer Android-Adaptive-Icons: voll-weiss
bg = Image.new("RGBA", (1024, 1024), (255, 255, 255, 255))
bg.save(OUT / "icon-background.png", optimize=True)
print(f"wrote {OUT / 'icon-background.png'}")

# Splash-Screen: 2732x2732, brand-dunkelblau, Logo zentriert
splash = square(2732, (11, 18, 32, 255), 0.30)  # #0B1220, kleiner Logo
splash.save(OUT / "splash.png", optimize=True)
print(f"wrote {OUT / 'splash.png'}")

# Splash-Dark: identisch (Tablets werden meist im Dark verwendet)
splash.save(OUT / "splash-dark.png", optimize=True)
print(f"wrote {OUT / 'splash-dark.png'}")
