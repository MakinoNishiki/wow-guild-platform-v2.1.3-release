const fontActions = (() => {
  const installer = window.WBFontInstall;
  const scope = el('installSlot'), apply = el('applyFont'), remove = el('deleteFont');
  const message = el('installStatus'), dialog = el('installConfirm');
  const originals = new WeakMap();
  let game = null, installed = null, revision = 0, busy = false, pending = null, requestedSource = null;
  let remembered = null, directoryRevision = 0, readOnlyView = false;
  let checkingDirectory = true, resuming = false, changingTarget = false;
  for (const [key, label] of installer.slots) scope.add(new Option(label, key));

  function status(text, kind = '') {
    message.dataset.kind = kind;
    message.textContent = text;
  }
  function editionKey(target) {
    return target?.edition || target?.handle?.name.toLowerCase();
  }
  function editionLabel(target) {
    return tools.editions[editionKey(target)] || '版本待确认';
  }
  function accessHandle(target) {
    return target.rootHandle || target.handle;
  }
  function showEditions(target) {
    const box=el('editionInfo');
    box.replaceChildren();
    el('installEdition').textContent = target ? editionLabel(target) + ' · 简中' : '国服简中';
    const title=document.createElement('strong');
    title.textContent='游戏版本';
    box.append(title);
    // Only a root handle can confirm which sibling installations exist.
    const keys = target?.rootHandle ? target.editions : Object.keys(tools.editions);
    for (const key of keys) {
      if (!Object.hasOwn(tools.editions,key)) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = tools.editions[key];
      button.dataset.edition = key;
      const active=key===editionKey(target);
      button.setAttribute('aria-pressed',String(active));
      if(!target?.rootHandle && !active){
        button.dataset.needsRoot='true';
        button.title='选择游戏总目录后检查是否已安装'+tools.editions[key];
      }
      button.onclick = () => {
        if(target?.rootHandle) return switchEdition(key);
        if(!active) return chooseGame(key);
        if(!game && remembered) return resumeDirectory();
      };
      box.append(button);
    }
    const previewNames=keys.map(key=>tools.previewEditions[key]).filter(Boolean);
    if(previewNames.length)box.append(previewNames.join('、')+'（仅识别）');
  }
  function controls(ready) {
    const locked = busy || checkingDirectory || resuming || changingTarget;
    for(const button of el('editionInfo').querySelectorAll('button')) button.disabled=locked || (!game && !!remembered?.rootHandle);
    scope.disabled = el('pickGame').disabled = el('forgetGame').disabled = el('rescanGame').disabled = el('resumeGame').disabled = locked;
    remove.disabled = !ready || locked || !installed;
    apply.disabled = !ready || locked || !!selected.error || ((selected.file || selected.systemRef) && !selected.face);
  }
  async function fontsDirectory(target, create = false) {
    if (target.direct) return target.handle;
    try { return await target.handle.getDirectoryHandle('Fonts', {create}); }
    catch (e) { if (!create && e.name === 'NotFoundError') return null; throw e; }
  }
  async function refresh() {
    const request = ++revision;
    installed = null;
    el('sourceFallback').hidden = true;
    controls(false);
    if (busy) return;
    if (!game) {
      status(readOnlyView ? '当前目录仅供预览。应用字体时需允许浏览器访问游戏目录。' : remembered ? '应用时会先请求读取已记住的目录。' : '应用字体前需选择游戏目录。');
      controls(true);
      return;
    }
    try {
      const slot = scope.value;
      const entry = await installer.inspect(await fontsDirectory(game), slot);
      if (request !== revision) return;
      installed = entry;
      status(entry ? '管家上次应用「' + entry.name + '」。' : '此位置尚未通过魔兽管家应用字体。');
      controls(true);
    } catch (e) { if (request === revision) status(e.message, 'error'); }
  }
  function awaitPermission(target) {
    game = null; remembered = target;
    showEditions(target);
    currentFonts.clear('待授权读取');
    el('currentSlots').hidden = true;
    el('pickGame').textContent = '更换目录';
    el('resumeGame').hidden = el('forgetGame').hidden = false;
    el('rescanGame').hidden = true;
    el('dirStatus').textContent='已记住 '+target.path+'。点击「继续使用此目录」允许读取。如果浏览器提供「每次访问时都允许」，选择后下次可自动读取。';
    refresh();
  }
  async function scanGame(target) {
    try {
      if (await target.handle.queryPermission({mode:'read'}) !== 'granted') {
        if(game===target) awaitPermission(target);
        return;
      }
      // A removed or disconnected installation is different from an existing one without Fonts.
      await target.handle.keys().next();
      const dir = await fontsDirectory(target);
      if (game!==target) return;
      await currentFonts.scan(async slot=>{
        if(!dir) return null;
        try {return await (await dir.getFileHandle(slot)).getFile();}
        catch(e){if(e.name==='NotFoundError') return null; throw e;}
      });
    } catch (e) {
      if(game!==target)return;
      if(e.name==='NotAllowedError'){awaitPermission(target);return;}
      unavailableDirectory(target);
    }
  }
  function unavailableDirectory(target) {
    game=null;remembered=null;currentFonts.clear('读取失败');
    showEditions(null);
    el('currentSlots').hidden=true;
    el('resumeGame').hidden=true;
    el('forgetGame').hidden=false;
    el('rescanGame').hidden=true;
    el('pickGame').textContent='重新选择目录';
    el('dirStatus').textContent='无法打开 '+target.path+'。请确认目录仍在原处，或重新选择游戏目录。';
    refresh();
  }
  async function activate(target) {
    game=target;remembered=target;readOnlyView=false;
    showEditions(target);
    el('currentSlots').hidden=false;
    currentFonts.clear('正在读取…');
    el('pickGame').textContent=target.rootHandle ? '更换游戏目录' : '选择游戏总目录';
    el('resumeGame').hidden=true;
    el('forgetGame').hidden=el('rescanGame').hidden=false;
    el('dirStatus').textContent='已选择 '+target.path+'。'+(target.rootHandle
      ? '当前字体和下方的应用操作对应'+editionLabel(target)+'。'
      : '其他版本待识别。点想用的版本，然后选择 World of Warcraft 总目录。');
    await Promise.all([scanGame(target),refresh()]);
  }
  async function makeEditionTarget(rootHandle, editions, edition) {
    const handle = await rootHandle.getDirectoryHandle(edition);
    const path = [rootHandle.name,handle.name,'Fonts'].filter(Boolean).join('/');
    return {rootHandle,handle,editions,edition,path,direct:false};
  }
  async function rememberAndActivate(target) {
    const save=currentFonts.storeTarget('put',target).catch(()=>false);
    await activate(target);
    if(await save===false && game===target)el('dirStatus').textContent+=' 此浏览器下次需重选目录。';
    return game===target;
  }
  async function reopen(target) {
    if(!target.rootHandle){await activate(target);return;}
    const editions=await tools.inspectGame(target.rootHandle);
    if(!editions.includes(target.edition)){unavailableDirectory(target);return;}
    await activate(await makeEditionTarget(target.rootHandle,editions,target.edition));
  }
  async function switchEdition(key) {
    const previous=game;
    if (!previous?.rootHandle || key===editionKey(previous) || !previous.editions.includes(key) ||
        busy || resuming || changingTarget || dialog.open) return;
    const keepFocus=el('editionInfo').contains(document.activeElement);
    changingTarget=true;
    controls(false);
    try {
      const target=await makeEditionTarget(previous.rootHandle,previous.editions,key);
      await rememberAndActivate(target);
    } catch (e) {
      if(e.name==='NotAllowedError') awaitPermission(previous);
      else el('dirStatus').textContent='无法打开'+tools.editions[key]+'目录。当前仍为'+editionLabel(previous)+'，可重新选择游戏总目录。';
    } finally {
      changingTarget=false;
      controls(true);
      if(keepFocus && document.activeElement===document.body)
        el('editionInfo').querySelector('[aria-pressed="true"]:enabled')?.focus();
    }
  }
  async function restore() {
    const start=directoryRevision;
    let target;
    try {
      target=await currentFonts.storeTarget('get');
      if(!target?.handle || start!==directoryRevision)return;
      const grant=await accessHandle(target).queryPermission({mode:'read'});
      if(start!==directoryRevision)return;
      if(grant==='granted')await reopen(target);else awaitPermission(target);
    } catch {
      if(target?.handle && start===directoryRevision) unavailableDirectory(target);
    } finally {
      checkingDirectory=false;
      if(!target?.handle && start===directoryRevision){
        showEditions(null);
        el('dirStatus').textContent='版本待识别。点想用的版本，再选择 World of Warcraft 总目录。';
      }
      controls(true);
    }
  }
  async function chooseGame(requestedEdition) {
    if(changingTarget || busy || dialog.open)return false;
    ++directoryRevision;
    if (typeof window.showDirectoryPicker !== 'function') {
      const reason='请用桌面 Chrome 或 Edge 打开此页并选择游戏总目录，授权后可切换版本。';
      el('dirStatus').textContent=reason;
      status(reason,'error');
      return false;
    }
    changingTarget=true;
    controls(false);
    try {
      if(requestedEdition) el('dirStatus').textContent='切换到'+tools.editions[requestedEdition]+'：请选择包含各版本文件夹的 World of Warcraft 总目录。';
      const root = await window.showDirectoryPicker({id:'wb-font-review-game', mode:'read'});
      const name = root.name.toLowerCase();
      const direct = name === 'fonts';
      const versions = await tools.inspectGame(root);
      const supported = versions.filter(key=>Object.hasOwn(tools.editions,key));
      if(requestedEdition && (direct || Object.hasOwn(tools.editions,name) || !supported.includes(requestedEdition))){
        el('dirStatus').textContent=(direct || Object.hasOwn(tools.editions,name)
          ? '选中的是子目录。请再点「'+tools.editions[requestedEdition]+'」，选择上一级 World of Warcraft 总目录。'
          : '所选目录中未找到'+tools.editions[requestedEdition]+'（'+requestedEdition+'）。请确认游戏安装位置。')
          +(game?' 当前仍使用'+editionLabel(game)+'。':'');
        return false;
      }
      if (!direct && !supported.length) {
        const detected=versions.map(key=>tools.previewEditions[key]).filter(Boolean).join('、');
        const reason=detected ? '仅检测到'+detected+'。请选择已安装的正式服、无限服或怀旧服目录。'
          : '未找到支持的版本。请选择 World of Warcraft 总目录、已安装的版本目录或其 Fonts 文件夹。';
        el('dirStatus').textContent=reason;
        status(reason,'error');
        return false;
      }
      const single = Object.hasOwn(tools.editions,name);
      const preferred = requestedEdition || (supported.includes(editionKey(remembered)) ? editionKey(remembered) : supported[0]);
      const target = direct || single
        ? {handle:root,direct,edition:single ? name : null,path:direct ? root.name : root.name+'/Fonts'}
        : await makeEditionTarget(root,versions,preferred);
      return await rememberAndActivate(target);
    } catch (e) {
      if(e.name==='AbortError' && requestedEdition)
        el('dirStatus').textContent=game?'已取消切换，当前仍使用 '+game.path+'。':'已取消选择目录，可随时点击版本重试。';
      if (e.name !== 'AbortError') {
        if (e.name !== 'NotFoundError' && e.name !== 'TypeMismatchError') el('pickFontsTarget').hidden = false;
        const reason = e.name === 'NotFoundError' || e.name === 'TypeMismatchError'
          ? '未找到支持的版本。请选择 World of Warcraft 总目录、已安装的版本目录或其 Fonts 文件夹。'
          : '浏览器未开放目录访问。请用桌面 Chrome 或 Edge 打开此页并允许访问所选文件夹。';
        el('dirStatus').textContent = reason;
        status(reason, 'error');
      }
      return false;
    } finally {
      changingTarget=false;
      controls(true);
    }
  }
  async function ask(deleting) {
    if (busy || checkingDirectory || changingTarget || resuming || dialog.open) return;
    if (!game && !(remembered ? await resumeDirectory() : await chooseGame())) return;
    if (!game) return;
    const entry = installed, font = selected, slot = scope.value;
    if (deleting && !entry) return;
    pending = {deleting, font, slot, target:game, expected:entry?.hash ?? null};
    const label = installer.slots.get(slot);
    el('actionTitle').textContent = deleting ? '删除已应用的「' + entry.name + '」？' : '将「' + font.n + '」应用到游戏？';
    el('actionTarget').textContent = (game.direct?'请确认所选 Fonts 属于目标简中游戏版本':editionLabel(game)) + ' · ' + label + ' · ' + game.path + '/' + slot;
    const effect = deleting ? (entry.original ? '将恢复首次应用前的原字体。' : '将移除本工具添加的文件，恢复游戏默认字体。')
      : '如已有自定义字体，将先备份原文件。' + (entry ? '此位置当前使用「' + entry.name + '」。' : '');
    const warning = !deleting && font.r && slot !== 'ARIALN.TTF' && tools.coverage(font).sc > 0 ? '此字体缺少部分简中用字，游戏里可能显示方框。' : '';
    el('actionEffect').textContent = effect + warning + '请先退出游戏，完成后重新启动。';
    el('confirmInstall').textContent = deleting ? '确认删除' : '确认应用';
    dialog.showModal();
  }
  async function commit() {
    const action = pending;
    if (!action || busy) return;
    pending = null;
    dialog.close();
    busy = true;
    controls(false);
    const {slot, font, target, expected, deleting} = action;
    status('正在检查所选目录的写入权限…');
    let result, kind = 'success', fallback = false;
    try {
      if (await target.handle.requestPermission({mode:'readwrite'}) !== 'granted')
        throw new Error('未获得写入权限，字体没有变更。');
      let blob;
      if (!deleting) {
        status('正在准备「' + font.n + '」的字体文件…');
        try { blob = await installer.getSource(font, originals.get(font)); }
        catch (e) {
          originals.delete(font);
          fallback = !font.file;
          throw new Error((e.name === 'TypeError' || e.name === 'TimeoutError' ? '未能从作者站点取得字体。' : e.message) + ' 可选择已下载的同版 TTF 或 OTF。');
        }
      }
      const dir = await fontsDirectory(target, !deleting);
      if (!dir) throw new Error('原来的 Fonts 目录已移走，请重新选择游戏目录。');
      status(deleting ? '正在恢复并核对原文件…' : '正在备份、写入并核对字体…');
      await installer.change(dir, slot, deleting ? null : {name:font.n, blob}, expected);
      result = '已' + (deleting ? '删除已应用字体，已恢复此前设置' : '应用「' + font.n + '」') + ' · ' + installer.slots.get(slot) + '。重新启动游戏后查看。';
    } catch (e) {
      kind = 'error';
      result = e.name === 'NotAllowedError' ? '浏览器未允许写入，请检查所选目录权限。' : e.message;
    } finally {
      busy = false;
      await refresh();
      if(target===game) await scanGame(target);
    }
    if (target !== game || scope.value !== slot || selected !== font) return;
    status(result, kind);
    if (fallback) {
      el('downloadOriginal').href = window.WBFontSources[font.n][1];
      el('sourceFallback').hidden = false;
    }
  }
  scope.onchange = refresh;
  apply.onclick = () => ask(false);
  remove.onclick = () => ask(true);
  el('pickGame').onclick = () => {
    if (typeof window.showDirectoryPicker === 'function') return chooseGame();
    el('gameFolderFallback').click();
  };
  el('pickFontsTarget').onclick = () => el('gameFolderFallback').click();
  el('rescanGame').onclick=()=>{if(game) return Promise.all([scanGame(game),refresh()]);};
  el('forgetGame').onclick=async()=>{
    ++directoryRevision;game=null;remembered=null;readOnlyView=false;
    showEditions(null);
    currentFonts.clear();
    el('currentSlots').hidden=true;
    el('rescanGame').hidden=el('forgetGame').hidden=el('resumeGame').hidden=true;
    el('pickGame').textContent='选择魔兽游戏目录';
    el('dirStatus').textContent='已忘记目录。可随时重新选择，读取各用途字体。';
    refresh();await currentFonts.storeTarget('delete').catch(()=>{});
  };
  async function resumeDirectory() {
    const target=remembered;
    if(!target || resuming)return false;
    resuming=true;
    controls(false);
    try{
      const grant=await accessHandle(target).requestPermission({mode:'read'});
      if(target!==remembered)return false;
      if(grant==='granted'){await reopen(target);return !!game;}
      el('dirStatus').textContent='已保留 '+target.path+'。浏览器尚未允许读取，可再次点击「继续使用此目录」。';
    }catch(e){
      if(target!==remembered)return false;
      if(e.name==='NotFoundError') unavailableDirectory(target);
      else el('dirStatus').textContent='已保留 '+target.path+'。请在浏览器站点设置中允许访问此目录后再试。';
    }finally{
      resuming=false;
      controls(true);
    }
    return false;
  }
  el('resumeGame').onclick=resumeDirectory;
  el('gameFolderFallback').onchange = e => {
    const files=Array.from(e.target.files);
    const name = files[0]?.webkitRelativePath.split('/')[0];
    e.target.value = '';
    if (!name) return;
    if (name.toLowerCase() !== 'fonts') {
      el('dirStatus').textContent = '请选择游戏版本目录内的 Fonts 文件夹。';
      return;
    }
    ++directoryRevision;game=null;remembered=null;readOnlyView=true;currentFonts.clear('正在读取…');currentFonts.storeTarget('delete').catch(()=>{});
    showEditions({direct:true});
    el('currentSlots').hidden=false;
    el('rescanGame').hidden=el('resumeGame').hidden=true;el('forgetGame').hidden=false;
    el('pickGame').textContent = '更换游戏目录 · Fonts';
    el('dirStatus').textContent = '已识别 Fonts（只读）。应用和删除需要在桌面 Chrome 或 Edge 授予目录写入权限。';
    const direct=new Map(files.filter(f=>f.webkitRelativePath.split('/').length===2).map(f=>[f.name.toLowerCase(),f]));
    currentFonts.scan(slot=>direct.get(slot.toLowerCase()));
    refresh();
  };
  el('cancelInstall').onclick = () => dialog.close();
  dialog.addEventListener('close', () => { pending = null; });
  el('confirmInstall').onclick = commit;
  el('supplyFont').onclick = () => { requestedSource = selected; el('sourceFile').click(); };
  el('sourceFile').onchange = async e => {
    const file = e.target.files[0], font = requestedSource;
    e.target.value = '';
    if (!file || selected !== font) return;
    try {
      await installer.getSource(font, file);
      if (selected !== font) return;
      originals.set(font, file);
      el('sourceFallback').hidden = true;
      await ask(false);
    } catch (err) { if (selected === font) status(err.message, 'error'); }
  };
  return {refresh,restore};
})();
