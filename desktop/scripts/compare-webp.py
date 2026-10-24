"""Contact sheets of exact source/packaged assets; requires Python 3 + Pillow.

Run pnpm app:verify-images first, then python3 desktop/scripts/compare-webp.py.
Each course contributes its first referenced image at its native resolution.
"""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / 'desktop/dist/evidence'
verification = json.loads((EVIDENCE / 'webp-verification.json').read_text())
app_public = Path(verification['appPath']) / 'Contents/Resources/server/public'
font = ImageFont.load_default(size=18)
samples = [(course['id'], course['imageUrls'][0]) for course in verification['courses']]
ROWS = 8
for start in range(0, len(samples), ROWS):
    batch = samples[start:start + ROWS]
    sheet = Image.new('RGB', (1040, len(batch) * 550 + 42), 'white')
    draw = ImageDraw.Draw(sheet)
    draw.text((8, 8), 'PNG source (left) | packaged WebP q82 (right), native 512px', fill='black', font=font)
    for row, (course, url) in enumerate(batch):
        png = ROOT / 'public' / url.lstrip('/')
        webp = app_public / url.lstrip('/').replace('images/', 'images-webp/', 1).replace('.png', '.webp')
        top = 42 + row * 550
        draw.text((8, top), f'{course}: {png.stat().st_size:,} B -> {webp.stat().st_size:,} B', fill='black', font=font)
        for left, source in [(4, png), (524, webp)]:
            with Image.open(source) as image:
                image.load()
                assert image.size == (512, 512), (source, image.size)
                sheet.paste(image.convert('RGB'), (left, top + 30))
    path = EVIDENCE / f'webp-compare-{start // ROWS + 1:02d}.png'
    sheet.save(path)
    print(path.relative_to(ROOT))
