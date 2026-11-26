/* One selected zhCN slot at a time. Keep the original outside the game's font slots. */
window.WBFontInstall = (() => {
  const slots = new Map([
    ['ARKai_T.TTF', '聊天与任务正文'], ['FRIZQT__.TTF', '姓名板与主界面'],
    ['ARKai_C.TTF', '战斗数字'], ['ARIALN.TTF', '常规数字'], ['ARHei.TTF', '物品与技能说明']
  ]);
  const backupName = 'WoWButler-FontBackups';
  const fingerprint = /^[a-f0-9]{64}$/;
  async function hash(file) {
    if (!file) return null;
    const bytes = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
  }
  async function optional(request) {
    try { return await request(); }
    catch (e) { if (e.name === 'NotFoundError') return null; throw e; }
  }
  async function fileAt(dir, name) {
    return optional(async () => (await dir.getFileHandle(name)).getFile());
  }
  async function write(dir, name, data) {
    const handle = await dir.getFileHandle(name, {create:true});
    const stream = await handle.createWritable();
    try { await stream.write(data); await stream.close(); }
    catch (e) { await stream.abort().catch(() => {}); throw e; }
  }
  function validEntry(entry) {
    return entry === null || (entry && typeof entry.name === 'string' && fingerprint.test(entry.hash));
  }
  function checkSlot(slot) {
    if (!slots.has(slot)) throw new Error('请选择一个国服字体用途。');
  }
  async function readRecord(backup, slot) {
    const file = backup && await fileAt(backup, slot + '.json');
    if (!file) return null;
    const invalid = new Error('字体备份记录无法核对，已停止操作。');
    let rec;
    try { rec = JSON.parse(await file.text()); } catch { throw invalid; }
    if (!rec || rec.version !== 1 || rec.slot !== slot ||
        (rec.original !== null && !fingerprint.test(rec.original)) ||
        !validEntry(rec.current) || !validEntry(rec.next) || typeof rec.pending !== 'boolean') throw invalid;
    return rec;
  }
  function resolve(record, disk) {
    if (!record) return null;
    if (record.pending && disk === (record.next?.hash ?? record.original)) return record.next;
    if (disk === (record.current?.hash ?? record.original)) return record.current;
    throw new Error('此文件已在其他地方改动。为保留现有字体，已停止操作。');
  }
  const backupFile = (slot, digest) => slot + '.' + digest + '.bak';
  async function inspect(dir, slot) {
    checkSlot(slot);
    if (!dir) return null;
    const backup = await optional(() => dir.getDirectoryHandle(backupName));
    const rec = await readRecord(backup, slot);
    if (!rec) return null;
    const entry = rec.pending ? resolve(rec, await hash(await fileAt(dir, slot))) : rec.current;
    return entry && {...entry, original:rec.original};
  }
  async function change(dir, slot, desired, expected) {
    checkSlot(slot);
    const previousFile = await fileAt(dir, slot);
    const previousHash = await hash(previousFile);
    const existingBackup = await optional(() => dir.getDirectoryHandle(backupName));
    const record = await readRecord(existingBackup, slot);
    const current = resolve(record, previousHash);
    if ((current?.hash ?? null) !== expected) throw new Error('此用途的字体已更新，请重新确认。');
    if (!desired && !current) throw new Error('此用途没有由魔兽管家应用的字体。');
    const original = current ? record.original : previousHash;
    const next = desired && {name:desired.name, hash:await hash(desired.blob)};
    if (next && next.hash === current?.hash && next.name === current.name) return;
    const backup = existingBackup || await dir.getDirectoryHandle(backupName, {create:true});
    let savedFile;
    if (original !== null) {
      const name = backupFile(slot, original);
      savedFile = await fileAt(backup, name);
      if (!savedFile && !current) {
        await write(backup, name, previousFile);
        savedFile = await fileAt(backup, name);
      }
      if (await hash(savedFile) !== original) throw new Error('原字体备份缺失或校验失败，已停止操作。');
    }
    // The on-disk intent makes a completed write recoverable if the tab closes
    // before its receipt is saved. Compare both sides again before mutating.
    const rec = {version:1, slot, original, current, next, pending:true};
    await write(backup, slot + '.json', JSON.stringify(rec));
    if (await hash(await fileAt(dir, slot)) !== previousHash) throw new Error('目标文件刚刚发生变化，请检查后重试。');
    const output = desired ? desired.blob : savedFile;
    if (output) await write(dir, slot, output);
    else await dir.removeEntry(slot);
    if (await hash(await fileAt(dir, slot)) !== (next?.hash ?? original)) throw new Error('目标文件回读不一致，已保留原字体备份。');
    if (next) await write(backup, slot + '.json', JSON.stringify({...rec, current:next, next:null, pending:false}));
    else await backup.removeEntry(slot + '.json');
  }
  async function getSource(font, supplied) {
    if (font.file) return font.file;
    const [digest, url] = window.WBFontSources[font.n];
    let blob = supplied;
    if (!blob) {
      if (!/\.(ttf|otf)$/i.test(url)) throw new Error('此字体由作者以压缩包发行。请解压后选择对应字体文件。');
      const response = await fetch(url, {credentials:'omit', signal:AbortSignal.timeout(25000)});
      if (!response.ok) throw new Error('暂时无法下载字体原件。');
      blob = await response.blob();
    }
    if (await hash(blob) !== digest) throw new Error('文件与本页预览的字体版本不一致，请选择对应的字体原件。');
    return blob;
  }
  return {slots, inspect, getSource, change:(dir, slot, desired, expected) => {
    const run = () => change(dir, slot, desired, expected);
    return navigator.locks ? navigator.locks.request('wb-font-installer-' + slot, run) : run();
  }};
})();
