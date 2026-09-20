#!/usr/bin/env python3
"""
generate_blue_icons.py
Transforme le logo rouge Orvix (#E50914) en bleu électrique officiel (#2563EB / #3B82F6)
et régénère tous les formats d'icônes, favicons et assets du projet.
"""

import os
import numpy as np
from PIL import Image

PROJECT_ROOT = "/home/admin/Projects/movix"
SOURCE_LOGO = "/tmp/orvix_original.png"
SOURCE_THUMBNAIL = "/tmp/thumbnail_original.png"

def shift_red_to_blue(im: Image.Image) -> Image.Image:
    """
    Convertit avec précision les teintes rouges vers le bleu électrique (#2563EB).
    Préserve 100% du fond sombre, du vignettage, du grain et de l'anti-aliasing des contours.
    """
    orig_mode = im.mode
    im_rgba = im.convert('RGBA')
    arr = np.array(im_rgba, dtype=np.float32)
    r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]

    v = np.maximum(np.maximum(r, g), b)
    m = np.minimum(np.minimum(r, g), b)
    chroma = v - m
    safe_chroma = np.where(chroma == 0, 1.0, chroma)

    hue = np.zeros_like(v)
    mask_r = (v == r) & (chroma > 0)
    mask_g = (v == g) & (chroma > 0)
    mask_b = (v == b) & (chroma > 0)

    hue[mask_r] = ((g[mask_r] - b[mask_r]) / safe_chroma[mask_r]) % 6.0
    hue[mask_g] = ((b[mask_g] - r[mask_g]) / safe_chroma[mask_g]) + 2.0
    hue[mask_b] = ((r[mask_b] - g[mask_b]) / safe_chroma[mask_b]) + 4.0
    hue = hue * 60.0

    # Distance angulaire à la teinte rouge (0° ou 360°)
    dist_to_red = np.minimum(hue, 360.0 - hue)
    hue_weight = np.clip(1.0 - (dist_to_red / 40.0), 0.0, 1.0)
    # Courbe douce smoothstep pour transition fluide
    hue_weight = hue_weight * hue_weight * (3.0 - 2.0 * hue_weight)

    chroma_weight = np.clip((chroma - 10.0) / 20.0, 0.0, 1.0)
    weight = hue_weight * chroma_weight

    # Teinte cible : bleu électrique officiel (~217°)
    h_prime = 217.0 / 60.0
    x = chroma * (1.0 - abs((h_prime % 2.0) - 1.0))

    new_r = m
    new_g = m + x
    new_b = v

    out_r = r * (1.0 - weight) + new_r * weight
    out_g = g * (1.0 - weight) + new_g * weight
    out_b = b * (1.0 - weight) + new_b * weight

    out_arr = np.stack([out_r, out_g, out_b, a], axis=-1)
    out_arr = np.clip(out_arr, 0, 255).astype(np.uint8)

    out_img = Image.fromarray(out_arr, mode='RGBA')
    if orig_mode == 'RGB':
        return out_img.convert('RGB')
    return out_img

def main():
    print(f"Chargement du logo source: {SOURCE_LOGO}")
    src_logo = Image.open(SOURCE_LOGO)
    blue_logo = shift_red_to_blue(src_logo)

    # 1. Master orvix.png 1024x1024
    p_orvix = os.path.join(PROJECT_ROOT, "public/orvix.png")
    blue_logo.save(p_orvix, format="PNG", optimize=True)
    print(f"✓ Écrit: {p_orvix} ({blue_logo.size})")

    # 2. orvix512.png
    p_512 = os.path.join(PROJECT_ROOT, "public/orvix512.png")
    img_512 = blue_logo.resize((512, 512), Image.Resampling.LANCZOS)
    img_512.save(p_512, format="PNG", optimize=True)
    print(f"✓ Écrit: {p_512} (512x512)")

    # 3. orvix-192.png
    p_192 = os.path.join(PROJECT_ROOT, "public/orvix-192.png")
    img_192 = blue_logo.resize((192, 192), Image.Resampling.LANCZOS)
    img_192.save(p_192, format="PNG", optimize=True)
    print(f"✓ Écrit: {p_192} (192x192)")

    # 4. apple-touch-icon-180.png
    p_180 = os.path.join(PROJECT_ROOT, "public/apple-touch-icon-180.png")
    img_180 = blue_logo.resize((180, 180), Image.Resampling.LANCZOS)
    img_180.save(p_180, format="PNG", optimize=True)
    print(f"✓ Écrit: {p_180} (180x180)")

    # 5. favicon-48.png
    p_48 = os.path.join(PROJECT_ROOT, "public/favicon-48.png")
    img_48 = blue_logo.resize((48, 48), Image.Resampling.LANCZOS)
    img_48.save(p_48, format="PNG", optimize=True)
    print(f"✓ Écrit: {p_48} (48x48)")

    # 6. favicon.ico multi-tailles
    p_ico = os.path.join(PROJECT_ROOT, "public/favicon.ico")
    ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    blue_logo.save(p_ico, format="ICO", sizes=ico_sizes)
    print(f"✓ Écrit: {p_ico} (ICO multi-résolutions: {ico_sizes})")

    # 7. Extension Chrome et Firefox
    p_chrome = os.path.join(PROJECT_ROOT, "extension/Chrome/orvix.png")
    p_firefox = os.path.join(PROJECT_ROOT, "extension/Firefox/orvix.png")
    blue_logo.save(p_chrome, format="PNG", optimize=True)
    blue_logo.save(p_firefox, format="PNG", optimize=True)
    print(f"✓ Écrit: {p_chrome}")
    print(f"✓ Écrit: {p_firefox}")

    # 8. Thumbnail
    if os.path.exists(SOURCE_THUMBNAIL):
        src_thumb = Image.open(SOURCE_THUMBNAIL)
        blue_thumb = shift_red_to_blue(src_thumb)
        p_thumb = os.path.join(PROJECT_ROOT, "public/thumbnail.png")
        blue_thumb.save(p_thumb, format="PNG", optimize=True)
        print(f"✓ Écrit: {p_thumb} ({blue_thumb.size})")

    print("\nTous les assets d'icônes et logos ont été régénérés avec succès en bleu électrique !")

if __name__ == "__main__":
    main()
