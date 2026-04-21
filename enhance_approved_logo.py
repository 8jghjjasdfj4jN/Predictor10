from pathlib import Path
from PIL import Image, ImageFilter, ImageEnhance

source = Path('/home/ubuntu/upload/pasted_file_xWsyac_image.png')
out = Path('/home/ubuntu/webdev-static-assets/predictor10-approved-logo-hires.png')

img = Image.open(source).convert('RGBA')
w, h = img.size

# Preserve the exact approved logo composition while isolating the main mark.
left = int(w * 0.10)
top = int(h * 0.27)
right = int(w * 0.95)
bottom = int(h * 0.52)
logo = img.crop((left, top, right, bottom))

# Upscale before sharpening so the UI renders from a denser source image.
scale = 4
logo = logo.resize((logo.width * scale, logo.height * scale), Image.Resampling.LANCZOS)
logo = ImageEnhance.Sharpness(logo).enhance(1.55)
logo = ImageEnhance.Contrast(logo).enhance(1.05)
logo = logo.filter(ImageFilter.UnsharpMask(radius=1.8, percent=165, threshold=2))
logo.save(out, format='PNG', optimize=False, compress_level=0)
print(out)
print(f'{logo.width}x{logo.height}')
