from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

out = Path(r'c:/Users/aryan/Desktop/rsfitness-saas-gym-owner-cors-fixed-new-FIXED/icon-export/Movora-Circular-Icon.png')
out.parent.mkdir(parents=True, exist_ok=True)

size = 2048
img = Image.new('RGBA', (size, size), (15, 23, 42, 255))
draw = ImageDraw.Draw(img)

# Outer circle background
circle = (0, 0, size - 1, size - 1)
draw.ellipse(circle, fill=(15, 23, 42, 255))

# Blue ring
ring = (80, 80, size - 81, size - 81)
draw.ellipse(ring, outline=(59, 130, 246, 255), width=90)

# Inner blue circle
inner = (200, 200, size - 201, size - 201)
draw.ellipse(inner, fill=(59, 130, 246, 255))

# Barbell motif
bar_w = 140
bar_h = 460
x1 = 740
x2 = 1160
y = 780
draw.rounded_rectangle((x1, y, x1 + bar_w, y + bar_h), radius=40, fill=(255, 255, 255, 255))
draw.rounded_rectangle((x2, y, x2 + bar_w, y + bar_h), radius=40, fill=(255, 255, 255, 255))
draw.rounded_rectangle((800, 900, 1240, 1160), radius=30, fill=(15, 23, 42, 255))

# White text with a subtle tilt
try:
    font = ImageFont.truetype('arial.ttf', 240)
except Exception:
    font = ImageFont.load_default()
text = 'MOVORA'
bbox = draw.textbbox((0, 0), text, font=font)
tw = bbox[2] - bbox[0]
th = bbox[3] - bbox[1]
# Create a temporary image for the text to allow gentle rotation
text_img = Image.new('RGBA', (tw + 80, th + 80), (0, 0, 0, 0))
text_draw = ImageDraw.Draw(text_img)
text_draw.text((40, 40), text, fill=(255, 255, 255, 255), font=font)
text_img = text_img.rotate(8, expand=True, resample=Image.Resampling.BICUBIC)
text_w, text_h = text_img.size
img.paste(text_img, (size // 2 - text_w // 2, 1320), text_img)

img.save(out)
print(out)
