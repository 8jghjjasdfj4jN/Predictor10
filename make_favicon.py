from pathlib import Path
from PIL import Image, ImageOps, ImageFilter, ImageEnhance, ImageDraw

source = Path('/home/ubuntu/predictor10_logo_selected_refined.png')
out_dir = Path('/home/ubuntu/predictor10/client/public')
out_dir.mkdir(parents=True, exist_ok=True)

img = Image.open(source).convert('RGBA')
width, height = img.size
crop_size = min(width, height)
left = (width - crop_size) // 2
upper = (height - crop_size) // 2
img = img.crop((left, upper, left + crop_size, upper + crop_size))
img = ImageOps.fit(img, (256, 256), method=Image.Resampling.LANCZOS)

# Add slight contrast and a subtle round mask so the tab icon reads better.
img = ImageEnhance.Contrast(img).enhance(1.08)
mask = Image.new('L', (256, 256), 0)
draw = ImageDraw.Draw(mask)
draw.rounded_rectangle((10, 10, 246, 246), radius=56, fill=255)
canvas = Image.new('RGBA', (256, 256), (11, 31, 20, 255))
canvas.paste(img, (0, 0), mask)
canvas = canvas.filter(ImageFilter.UnsharpMask(radius=1, percent=120, threshold=2))

png_path = out_dir / 'favicon.png'
ico_path = out_dir / 'favicon.ico'
canvas.save(png_path)
canvas.save(ico_path, sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print(png_path)
print(ico_path)
