/* Offline review. Local directory access is read-only and scoped to a user gesture. */
(() => {
  'use strict';
  const data = window.WB_SCENE_DATA;
  const simplified = Array.from(data.sets.sc, c => c.codePointAt(0));
  const traditional = Array.from(data.sets.tc, c => c.codePointAt(0));
  const combined = [...new Set([...simplified, ...traditional])];
  const coverageCache = new WeakMap();
  let fontSequence = 0;

  function hasGlyph(ranges, code) {
    let lo = 0, hi = ranges.length / 2;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (ranges[mid * 2 + 1] < code) lo = mid + 1;
      else hi = mid;
    }
    return lo * 2 < ranges.length && ranges[lo * 2] <= code;
  }

  function coverage(font) {
    if (!coverageCache.has(font)) {
      const count = codes => codes.reduce((n, code) => n + Number(!hasGlyph(font.r, code)), 0);
      coverageCache.set(font, {sc:count(simplified), tc:count(traditional), total:count(combined), base:combined.length});
    }
    return coverageCache.get(font);
  }

  // Read the best Unicode cmap of a single-face OpenType font. A glyph ID
  // of zero is the missing glyph, even if the character appears in a segment.
  function unicodeRanges(buffer) {
    const view = new DataView(buffer);
    const u16 = n => view.getUint16(n), u32 = n => view.getUint32(n);
    const invalid = () => { throw new Error('无法读取这个文件的 Unicode 字符表'); };
    let cmap = 0, cmapEnd = 0, glyphCount = 0;
    for (let i = 0; i < u16(4); i++) {
      const entry = 12 + i * 16, tag = u32(entry), offset = u32(entry + 8), len = u32(entry + 12);
      if (offset + len > buffer.byteLength) invalid();
      if (tag === 0x636d6170) {cmap = offset; cmapEnd = offset + len;}
      if (tag === 0x6d617870 && len >= 6) glyphCount = u16(offset + 4);
    }
    if (!cmap || !glyphCount || cmap + 4 + u16(cmap + 2) * 8 > cmapEnd) invalid();
    const preference = ['3/10','0/6','0/4','3/1','0/3','0/2','0/1','0/0'];
    let best = Infinity, table = 0, format = 0;
    for (let i = 0; i < u16(cmap + 2); i++) {
      const p = cmap + 4 + i * 8, rank = preference.indexOf(u16(p) + '/' + u16(p+2));
      if (rank < 0 || rank >= best) continue;
      const t = cmap + u32(p+4);
      if (t+2 > cmapEnd) invalid();
      const type = u16(t);
      if ([4,12,13].includes(type)) {table=t; format=type; best=rank;}
    }
    if (!table) invalid();
    const ranges = [];
    function add(a,b) {
      if (a>b) return;
      if (ranges.length && a === ranges[ranges.length-1]+1) ranges[ranges.length-1] = b;
      else ranges.push(a,b);
    }
    if (format === 4) {
      const end = table + u16(table+2), segments = u16(table+6) / 2;
      if (!Number.isInteger(segments) || end > cmapEnd || table+16+segments*8 > end) invalid();
      let previous = -1;
      for (let i=0;i<segments;i++) {
        const stop=u16(table+14+i*2), start=u16(table+16+(segments+i)*2);
        const delta=u16(table+16+(segments*2+i)*2), ro=table+16+(segments*3+i)*2, offset=u16(ro);
        if (start<=previous || stop<start) invalid();
        previous=stop;
        for(let c=start;c<=stop && c<65535;c++) {
          let g=(c+delta)&65535;
          if(offset) {
            const p=ro+offset+2*(c-start);
            if(p+2>end) invalid();
            const base=u16(p);g=base ? (base+delta)&65535 : 0;
          }
          if(g>0 && g<glyphCount) add(c,c);
        }
      }
    } else {
      const count=u32(table+12),end=table+u32(table+4);
      if(end>cmapEnd || table+16+count*12>end) invalid();
      let previous=-1;
      for(let i=0;i<count;i++) {
        const p=table+16+i*12,a=u32(p),b=u32(p+4),g=u32(p+8);
        if(a<=previous || b<a || b>0x10ffff) invalid();
        previous=b;
        if(format===13) {if(g>0 && g<glyphCount) add(a,b);}
        else if(g<glyphCount) add(a+Number(!g),Math.min(b,a+glyphCount-1-g));
      }
    }
    return ranges;
  }

  // Full face name retains the weight/style even when WoW requires a generic filename.
  function faceLabel(buffer) {
    const view = new DataView(buffer), size = view.byteLength;
    const u16 = at => view.getUint16(at);
    for (let i=0; i<u16(4); i++) {
      const pos=12+i*16;
      if(pos+16>size) break;
      if(view.getUint32(pos)!==0x6e616d65) continue;
      const start=view.getUint32(pos+8), end=start+view.getUint32(pos+12);
      if(start+6>end || end>size) break;
      const strings=start+u16(start+4), count=u16(start+2);
      if(start+6+count*12>strings || strings>end) break;
      let label='', best=-1;
      for(let j=0;j<count;j++){
        const p=start+6+j*12, platform=u16(p), encoding=u16(p+2), lang=u16(p+4), id=u16(p+6);
        const rank=({4:4,6:3,16:2,1:1})[id];
        if(!rank) continue;
        const unicode=platform===0 || (platform===3 && [0,1,10].includes(encoding));
        if(!unicode && !(platform===1 && encoding===0)) continue;
        const n=u16(p+8), offset=strings+u16(p+10);
        if(!n || offset+n>end || (unicode && n%2)) continue;
        const score=rank*10+(lang===0x804?4:(lang&1023)===4?3:lang===0x409?2:0)+Number(unicode);
        if(score<=best) continue;
        const name=new TextDecoder(unicode?'utf-16be':'macintosh').decode(new Uint8Array(buffer,offset,n)).trim();
        if(name && !/[\u0000-\u001f\ufffd]/.test(name)){best=score;label=name;}
      }
      return label;
    }
    return '';
  }
  async function loadLocal(font, sourceBytes) {
    if(font.face) return;
    if(!font.loading) font.loading=(async () => {
      if(!font.file && font.systemRef) {
        const blob=await font.systemRef.blob();
        const signature=await blob.slice(0,4).text();
        font.file=new File([blob],font.systemRef.postscriptName+(signature==='OTTO'?'.otf':'.ttf'));
      }
      const bytes=sourceBytes || await font.file.arrayBuffer();
      const ranges=unicodeRanges(bytes);
      const faceName='WBLocal'+(++fontSequence);
      const face=await new FontFace(faceName,bytes).load();
      document.fonts.add(face);
      font.r=ranges; font.face=faceName; font.loadedFace=face; font.internalName=faceLabel(bytes);
    })().finally(()=>{font.loading=null});
    return font.loading;
  }

  function language(font) {
    if(!font.file) return font.t==='外文'?8:font.t.startsWith('繁中')?7:6;
    const n=coverage(font);
    if(n.sc===simplified.length && n.tc===traditional.length) return 8;
    return (1-n.sc/simplified.length)>=(1-n.tc/traditional.length)?6:7;
  }
  function localInk(font, i) {
    const canvas=document.createElement('canvas');
    canvas.width=640;canvas.height=360;
    const ctx=canvas.getContext('2d');
    ctx.textBaseline='top';ctx.lineJoin='round';
    const lang=language(font);
    for(const line of data.groups[i]){
      const [x,y,size,color,stroke,align]=line;
      ctx.font=size+'px '+font.face; ctx.textAlign=align;
      const value=Array.from(line[lang],c=>hasGlyph(font.r,c.codePointAt(0))?c:'□').join('');
      ctx.strokeStyle='#172026';ctx.lineWidth=stroke*2;ctx.strokeText(value,x,y);
      ctx.fillStyle=color;ctx.fillText(value,x,y);
    }
    return canvas;
  }
  function scene(slot,i,font,original) {
    const frame=document.createElement('span'),bg=document.createElement('img');
    frame.className='scene-image';bg.width=640;bg.height=360;
    bg.src=original?slot.file:slot.file.replace('game-','scene-');
    bg.alt=original?slot.name+'历史原图':font.n+' · '+slot.name+'场景模拟';
    frame.append(bg);
    if(original) return frame;
    if(font.file) {frame.append(localInk(font,i));return frame;}
    const [x,y,right,bottom]=data.crops[i], ink=document.createElement('img');
    ink.alt='';ink.className='scene-ink';ink.src='data:image/webp;base64,'+data.ink[font.n][i];
    Object.assign(ink.style,{left:x/640*100+'%',top:y/360*100+'%',width:(right-x)/640*100+'%',height:(bottom-y)/360*100+'%'});
    frame.append(ink);return frame;
  }

  async function inspectGame(dir) {
    const editions={'_retail_':'正式服','_classic_':'怀旧服','_classic_era_':'经典怀旧服','_classic_titan_':'时光泰坦服','_forever_':'无限服','_ptr_':'测试服','_beta_':'测试版'};
    if(dir.name.toLowerCase()==='fonts') return [dir.name];
    const versions=[];
    for (const [key,label] of Object.entries(editions)) {
      if(dir.name.toLowerCase()===key) return [label+' · '+dir.name];
      try {await dir.getDirectoryHandle(key);versions.push(label+' · '+key);}
      catch(e){if(!['NotFoundError','TypeMismatchError'].includes(e.name))throw e;}
    }
    return versions;
  }
  window.WBFontPreview={coverage,hasGlyph,loadLocal,language,scene,inspectGame};
})();
