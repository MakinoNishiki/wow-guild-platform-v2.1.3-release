"""Extract exact room atlas rectangles from local 12.1.5 textures; no resizing."""
import json,hashlib,sys,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(tempfile.gettempdir())/'wowbutler-room-tools'))
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parents[2]
evidence=json.loads((ROOT/'data/task083/room-client-atlas-evidence.json').read_text(encoding='utf-8'))
out=ROOT/'assets/decor-icons/room-previews';out.mkdir(exist_ok=True)
manifest=[]
for row in evidence['rows']:
 if not row['atlas_members']:continue
 if len(row['atlas_members'])!=1:raise ValueError('ambiguous atlas member')
 entry=row['atlas_members'][0];member=entry['member'];texture=entry['texture']
 atlas=Image.open(ROOT/'scripts/decor/out/room-data'/f"{texture['FileDataID']}.png").convert('RGBA')
 assert atlas.size==(texture['AtlasWidth'],texture['AtlasHeight'])
 box=tuple(member[k] for k in ['CommittedLeft','CommittedTop','CommittedRight','CommittedBottom'])
 assert 0<=box[0]<box[2]<=atlas.width and 0<=box[1]<box[3]<=atlas.height
 image=atlas.crop(box);assert image.getbbox() is not None
 file=out/f"{row['record_id']}.png";image.save(file)
 manifest.append({'record_id':row['record_id'],'name':row['name'],'src':file.relative_to(ROOT).as_posix(),
  'atlas':row['atlas_element']['Name'],'texture_file_id':texture['FileDataID'],'rect':list(box),
  'dimensions':list(image.size),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
(ROOT/'data/task083/room-previews-manifest.json').write_text(json.dumps({'build':'12.1.5.70688',
 'source':'local client atlas','files':manifest,'missing':[r['record_id'] for r in evidence['rows'] if not r['atlas_members']]},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
sheet=Image.new('RGB',(800,6*130),'#161b22');paint=ImageDraw.Draw(sheet)
for i,row in enumerate(manifest):
 image=Image.open(ROOT/row['src']).convert('RGBA');image.thumbnail((112,100))
 x=(i%6)*133+(133-image.width)//2;y=(i//6)*130
 sheet.paste(image,(x,y),image);paint.text(((i%6)*133+10,y+104),str(row['record_id'])+' '+row['atlas'][:15],fill='white')
sheet.save(ROOT/'scripts/decor/out/room-data/contact.jpg')
print('Exported',len(manifest),'native atlas images')
