from PIL import Image, ImageDraw
import pillow_heif, random, json
from pathlib import Path
pillow_heif.register_heif_opener()
p=Path('tests/fixtures')
im=Image.new('RGB',(160,96))
d=ImageDraw.Draw(im)
for rect,c in [((0,0,79,47),(230,30,30)),((80,0,159,47),(25,200,50)),((0,48,79,95),(30,70,230)),((80,48,159,95),(245,210,30))]: d.rectangle(rect,fill=c)
im.save(p/'landscape.heic',quality=95)
for name,ori in [('portrait',6),('mirror',2)]:
    exif=Image.Exif()
    exif[274]=ori
    exif[315]='HEIC_TEST_AUTHOR_2026'
    exif[271]='HEIC_TEST_CAMERA'
    exif[34853]={1:'N',2:(55.0,45.0,0.0),3:'E',4:(37.0,37.0,0.0)}
    im.save(p/f'{name}.heic',quality=95,exif=exif.tobytes(),xmp=b'<x:xmpmeta xmlns:x="adobe:ns:meta/"><Test>HEIC_TEST_XMP_2026</Test></x:xmpmeta>')
a=Image.new('RGBA',(80,64),(220,30,60,0))
ImageDraw.Draw(a).rectangle((40,0,79,63),fill=(30,180,70,255))
a.save(p/'alpha.heic',quality=95)
rng=random.Random(123)
n=Image.frombytes('RGB',(256,192),bytes(rng.randrange(256) for _ in range(256*192*3)))
n.save(p/'noise.heic',quality=95)
second=Image.new('RGB',(72,120),(30,180,70))
im.save(p/'primary-second.heic',save_all=True,append_images=[second],primary_index=1,quality=95)
im.save(p/'renamed.heic',format='PNG')
(p/'broken.heic').write_bytes(b'\x00\x00\x00\x18ftypheic\x00\x00\x00\x00mif1heic' + b'broken')
for f in p.glob('*.heic'):
    if f.name in ['broken.heic','renamed.heic']: continue
    img=Image.open(f)
    print(f.name,img.size,img.info.get('original_orientation'), bool(img.info.get('exif')), len(img.getexif().get_ifd(34853)))
