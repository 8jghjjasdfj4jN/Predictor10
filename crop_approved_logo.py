from pathlib import Path
from PIL import Image

source = Path('/home/ubuntu/upload/pasted_file_xWsyac_image.png')
out = Path('/home/ubuntu/webdev-static-assets/predictor10-approved-logo-crop.png')

img = Image.open(source).convert('RGBA')
w, h = img.size

# Crop tightly around the main central wordmark area from the approved presentation board.
left = int(w * 0.10)
top = int(h * 0.27)
right = int(w * 0.95)
bottom = int(h * 0.52)

cropped = img.crop((left, top, right, bottom))
cropped.save(out)
print(f'source_size={w}x{h}')
print(out)
