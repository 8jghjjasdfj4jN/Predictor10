from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

SIZE = 1024
out_dir = Path('/home/ubuntu/predictor10/client/public')
out_dir.mkdir(parents=True, exist_ok=True)

canvas = Image.new('RGBA', (SIZE, SIZE), (7, 20, 14, 255))
draw = ImageDraw.Draw(canvas)

# Background gradient and app-tile shape.
for y in range(SIZE):
    t = y / (SIZE - 1)
    r = int(8 + (18 - 8) * t)
    g = int(34 + (24 - 34) * t)
    b = int(21 + (34 - 21) * t)
    draw.line((0, y, SIZE, y), fill=(r, g, b, 255))

# Rounded tile mask.
mask = Image.new('L', (SIZE, SIZE), 0)
mask_draw = ImageDraw.Draw(mask)
mask_draw.rounded_rectangle((56, 56, SIZE - 56, SIZE - 56), radius=220, fill=255)
base = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
base.paste(canvas, (0, 0), mask)
canvas = base

# Subtle green glow.
glow = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
glow_draw = ImageDraw.Draw(glow)
glow_draw.ellipse((120, 140, SIZE - 120, SIZE - 80), fill=(32, 180, 92, 110))
glow = glow.filter(ImageFilter.GaussianBlur(90))
canvas = Image.alpha_composite(canvas, glow)

# Pitch-style geometry.
pitch = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
pitch_draw = ImageDraw.Draw(pitch)
pitch_color = (170, 255, 215, 38)
pitch_draw.rounded_rectangle((160, 160, SIZE - 160, SIZE - 160), radius=160, outline=pitch_color, width=12)
pitch_draw.line((SIZE // 2, 170, SIZE // 2, SIZE - 170), fill=pitch_color, width=10)
pitch_draw.ellipse((SIZE // 2 - 120, SIZE // 2 - 120, SIZE // 2 + 120, SIZE // 2 + 120), outline=pitch_color, width=10)
pitch = pitch.filter(ImageFilter.GaussianBlur(1.2))
canvas = Image.alpha_composite(canvas, pitch)

# Central football.
ball_layer = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
ball_draw = ImageDraw.Draw(ball_layer)
ball_bbox = (270, 260, 754, 744)
ball_draw.ellipse(ball_bbox, fill=(247, 249, 250, 255), outline=(210, 214, 218, 255), width=10)

# Ball shadow and highlight.
shadow = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
shadow_draw = ImageDraw.Draw(shadow)
shadow_draw.ellipse((300, 580, 760, 840), fill=(0, 0, 0, 95))
shadow = shadow.filter(ImageFilter.GaussianBlur(35))
canvas = Image.alpha_composite(canvas, shadow)

cx, cy = 512, 502
pentagon = [
    (cx, cy - 90),
    (cx + 86, cy - 28),
    (cx + 54, cy + 74),
    (cx - 54, cy + 74),
    (cx - 86, cy - 28),
]
ball_draw.polygon(pentagon, fill=(22, 22, 24, 255))

# Surrounding panels.
panels = [
    [(cx - 172, cy - 140), (cx - 92, cy - 168), (cx - 26, cy - 114), (cx - 52, cy - 24), (cx - 144, cy - 20), (cx - 202, cy - 86)],
    [(cx + 172, cy - 140), (cx + 92, cy - 168), (cx + 26, cy - 114), (cx + 52, cy - 24), (cx + 144, cy - 20), (cx + 202, cy - 86)],
    [(cx - 200, cy + 80), (cx - 136, cy + 12), (cx - 46, cy + 28), (cx - 26, cy + 126), (cx - 110, cy + 190), (cx - 198, cy + 166)],
    [(cx + 200, cy + 80), (cx + 136, cy + 12), (cx + 46, cy + 28), (cx + 26, cy + 126), (cx + 110, cy + 190), (cx + 198, cy + 166)],
    [(cx, cy + 226), (cx + 86, cy + 162), (cx + 72, cy + 68), (cx - 72, cy + 68), (cx - 86, cy + 162)],
]
for panel in panels:
    ball_draw.polygon(panel, fill=(20, 20, 22, 255))

# Gloss highlight.
highlight = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
highlight_draw = ImageDraw.Draw(highlight)
highlight_draw.ellipse((300, 300, 620, 520), fill=(255, 255, 255, 58))
highlight = highlight.filter(ImageFilter.GaussianBlur(30))
ball_layer = Image.alpha_composite(ball_layer, highlight)

canvas = Image.alpha_composite(canvas, ball_layer)

# Small premium rim.
rim = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
rim_draw = ImageDraw.Draw(rim)
rim_draw.rounded_rectangle((56, 56, SIZE - 56, SIZE - 56), radius=220, outline=(220, 255, 240, 60), width=12)
rim_draw.rounded_rectangle((72, 72, SIZE - 72, SIZE - 72), radius=205, outline=(255, 255, 255, 28), width=4)
canvas = Image.alpha_composite(canvas, rim)

# Downsample to favicon sizes for crispness.
canvas = canvas.filter(ImageFilter.UnsharpMask(radius=2, percent=120, threshold=2))
canvas = ImageEnhance.Contrast(canvas).enhance(1.06)

png_path = out_dir / 'favicon.png'
ico_path = out_dir / 'favicon.ico'
small_png = canvas.resize((256, 256), Image.Resampling.LANCZOS)
small_png.save(png_path)
small_png.save(ico_path, sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print(png_path)
print(ico_path)
