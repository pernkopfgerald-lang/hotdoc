"""
Generiert pwa-192.png / pwa-512.png und maskable Varianten aus dem
FF-Eberstalzell-Logo. Wird einmalig manuell aufgerufen.

- 192/512 normal: Logo zentriert, transparenter Hintergrund
- 192/512 maskable: Logo mit 10% Padding auf weissem Quadrat (Safe-Area-konform)

Aufruf:
    python apps/pwa/scripts/generate-pwa-icons.py
"""
from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "ff-eberstalzell-logo.png"
OUT = ROOT / "public"

logo = Image.open(SRC).convert("RGBA")
lw, lh = logo.size

def square_canvas(size: int, bg: tuple[int, int, int, int]) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg)
    # Logo proportional auf 80 % der Kante skalieren (10 % Padding pro Seite)
    inner = int(size * 0.80)
    scale = min(inner / lw, inner / lh)
    sw, sh = int(lw * scale), int(lh * scale)
    resized = logo.resize((sw, sh), Image.LANCZOS)
    canvas.paste(resized, ((size - sw) // 2, (size - sh) // 2), resized)
    return canvas

# Standard-Icons: transparenter Hintergrund (any-purpose)
for sz in (192, 512):
    img = square_canvas(sz, (0, 0, 0, 0))
    out = OUT / f"pwa-{sz}.png"
    img.save(out, optimize=True)
    print(f"wrote {out}")

# Maskable-Icons: weisser Quadrat-Bg, Logo mit Padding (Android-konform)
for sz in (192, 512):
    img = square_canvas(sz, (255, 255, 255, 255))
    out = OUT / f"pwa-{sz}-maskable.png"
    img.save(out, optimize=True)
    print(f"wrote {out}")
