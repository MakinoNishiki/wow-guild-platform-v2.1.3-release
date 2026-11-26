// The first screen reflects the five files read from the chosen game, independent of library selection.
const currentFonts = (() => {
  const samples = new Map([
    ['FRIZQT__.TTF', '训练假人'], ['ARKai_C.TTF', '38,327'],
    ['ARKai_T.TTF', '[公会] 今晚集合'], ['ARIALN.TTF', '82.5%'], ['ARHei.TTF', '装备：提高精通']
  ]);
  let generation = 0, faces = new Map();
  function release(map) {
    for (const font of map.values()) if (font.loadedFace) document.fonts.delete(font.loadedFace);
  }
  function row(slot, label, font) {
    const card = document.createElement('div'), use = document.createElement('dt'), value = document.createElement('dd');
    card.dataset.slot = slot;
    use.textContent = WBFontInstall.slots.get(slot);
    value.textContent = label;
    card.append(use,value);
    if (font) {
      const sample = document.createElement('dd');
      sample.className = 'current-sample';
      sample.style.fontFamily = font.face;
      sample.textContent = Array.from(samples.get(slot), c => tools.hasGlyph(font.r,c.codePointAt(0)) ? c : '□').join('');
      sample.setAttribute('aria-label','本地字体样字：'+sample.textContent);
      card.append(sample);
    }
    return card;
  }
  function clear(label) {
    ++generation;
    release(faces); faces = new Map();
    el('currentSlots').replaceChildren(...Array.from(samples.keys(), s => row(s,label)));
  }
  async function scan(readFile) {
    const ticket = ++generation, next = new Map(), rows = [];
    el('currentSlots').setAttribute('aria-busy','true');
    for (const slot of samples.keys()) {
      if (ticket !== generation) break;
      try {
        const file = await readFile(slot);
        if (!file) { rows.push(row(slot,'游戏默认')); continue; }
        const bytes = await file.arrayBuffer();
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)).join('.');
        let font = next.get(digest) || faces.get(digest);
        if (!font) {
          font = {file};
          await tools.loadLocal(font,bytes);
        }
        next.set(digest,font);
        rows.push(row(slot,font.internalName || '本地字体 · 未标明名称',font));
      } catch { rows.push(row(slot,'无法识别 · '+slot)); }
    }
    if (ticket === generation) {
      for(const [key,font] of faces) if(!next.has(key)) document.fonts.delete(font.loadedFace);
      faces = next;
      el('currentSlots').replaceChildren(...rows);
      el('currentSlots').setAttribute('aria-busy','false');
    } else {
      for(const [key,font] of next) if(faces.get(key)!==font) document.fonts.delete(font.loadedFace);
    }
  }
  // Persist a browser handle, never the font bytes. A session can continue if storage is unavailable.
  function storeTarget(action, value) {
    return new Promise((resolve,reject) => {
      const open = indexedDB.open('wow-butler-font-target',1);
      open.onupgradeneeded = () => open.result.createObjectStore('selection');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        try {
          const tx = db.transaction('selection',action==='get'?'readonly':'readwrite'), store = tx.objectStore('selection');
          const request = action==='put' ? store.put(value,'game') : store[action]('game');
          tx.oncomplete = () => {db.close();resolve(request.result);};
          tx.onabort = () => {db.close();reject(tx.error);};
        } catch(e) {db.close();reject(e);}
      };
    });
  }
  clear('待读取');
  return {scan, clear(label='待读取'){clear(label);el('currentSlots').setAttribute('aria-busy','false');}, storeTarget};
})();
