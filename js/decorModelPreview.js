// REQ-209 / REQ-205: UI stays lightweight; WebGL code is imported only on explicit request.
(function () {
  'use strict';
  const scriptUrl = new URL(document.currentScript.src);
  const moduleUrl = new URL('decorModelViewer.js', scriptUrl);
  moduleUrl.search = scriptUrl.search;
  let sequence = 0;
  let runtimePromise = null, runtimeAttempt = 0;
  function loadRuntime() {
    if (!runtimePromise) {
      const url = new URL(moduleUrl);
      if (runtimeAttempt++) url.searchParams.set('retry', runtimeAttempt);
      // Browsers cache failed module imports; a retry needs a fresh wrapper URL.
      runtimePromise = import(url.href).catch(error => { runtimePromise = null; throw error; });
    }
    return runtimePromise;
  }
  function mount({ host, row, poster }) {
    const metadata = row.entry_type === 1 && window.DecorModelManifest?.[row.record_id];
    const section = document.createElement('section');
    section.className = 'dh-model-preview';
    section.setAttribute('aria-label', '家具外观');
    const id = `dhModel${++sequence}`;
    section.innerHTML = `<div class="dh-model-tabs" role="group" aria-label="预览方式"><button type="button" data-view="image" aria-pressed="true">图片</button><button type="button" data-view="model" aria-pressed="false" ${metadata ? '' : 'disabled'}>3D 预览</button></div>
      <div class="dh-model-stage"><img class="dh-model-poster" alt=""><div class="dh-model-canvas" id="${id}" hidden></div></div>
      <p class="dh-model-status" role="status" aria-live="polite"></p>
      <div class="dh-model-controls" role="group" aria-label="模型视角" hidden><button type="button" data-action="left" aria-label="向左旋转">↶ 左转</button><button type="button" data-action="right" aria-label="向右旋转">右转 ↷</button><button type="button" data-action="in" aria-label="放大模型">＋</button><button type="button" data-action="out" aria-label="缩小模型">−</button><button type="button" data-action="reset">复位</button></div>
      <button type="button" class="dh-model-retry" hidden>重新加载 3D</button>`;
    const image = section.querySelector('img'), canvasHost = section.querySelector('.dh-model-canvas');
    const controls = section.querySelector('.dh-model-controls'), status = section.querySelector('.dh-model-status'), retry = section.querySelector('.dh-model-retry');
    image.alt = row.name || '家具图片'; image.src = poster || 'assets/decor-icons/_placeholder.png';
    image.onerror = () => { image.onerror = null; image.src = 'assets/decor-icons/_placeholder.png'; };
    host.appendChild(section);
    let controller = null, viewer = null, epoch = 0, destroyed = false, timeout;
    const stop = () => { epoch++; clearTimeout(timeout); controller?.abort(); controller = null; viewer?.destroy(); viewer = null; canvasHost.replaceChildren(); };
    const select = mode => section.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === mode)));
    const showImage = () => {
      stop(); select('image'); section.dataset.state = 'image'; image.hidden = false; canvasHost.hidden = true; controls.hidden = true; retry.hidden = true;
      status.textContent = metadata ? '可切换 3D 查看家具外形。' : '此家具暂未提供 3D，当前显示图片。';
    };
    const failure = message => {
      if (destroyed) return;
      stop(); select('image'); section.dataset.state = 'error'; image.hidden = false; canvasHost.hidden = true; controls.hidden = true; retry.hidden = false;
      status.textContent = message || '3D 暂时无法加载，已保留图片。可以重试。';
    };
    const showModel = async () => {
      if (destroyed || !metadata) return;
      stop(); const current = epoch; controller = new AbortController(); const signal = controller.signal;
      select('model'); section.dataset.state = 'loading'; controls.hidden = true; retry.hidden = true;
      status.textContent = '正在加载 3D 模型…';
      timeout = setTimeout(() => { if (current === epoch) failure('3D 加载超时，已保留图片。请重试。'); }, 25000);
      try {
        const { createViewer } = await loadRuntime();
        if (destroyed || current !== epoch) return;
        canvasHost.hidden = false;
        const file = metadata.blendModes ? 'task084/' + row.record_id : 'catalog/' + metadata.assetId;
        const loaded = await createViewer({ host: canvasHost, url: new URL('../assets/decor-models/' + file + '.glb', scriptUrl).href, recordId: row.record_id, metadata: { ...metadata, name: row.name }, signal, onError: message => { if (current === epoch) failure(message); } });
        if (destroyed || current !== epoch) { loaded.destroy(); return; }
        clearTimeout(timeout); viewer = loaded; image.hidden = true; controls.hidden = false; section.dataset.state = 'ready';
        status.textContent = '拖动旋转 · 滚轮缩放 · 可用下方按钮调整。静态外观，不含动态特效。';
      } catch (error) { if (!destroyed && current === epoch && error.name !== 'AbortError') failure(); }
    };
    section.querySelector('[data-view="image"]').onclick = showImage;
    section.querySelector('[data-view="model"]').onclick = showModel;
    retry.onclick = showModel;
    controls.onclick = e => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (!viewer) return;
      if (action === 'reset') viewer.reset();
      if (action === 'left') viewer.rotate(.35);
      if (action === 'right') viewer.rotate(-.35);
      if (action === 'in') viewer.zoom(.8);
      if (action === 'out') viewer.zoom(1.25);
    };
    // A route switch may hide the catalog without invoking the old modal close handler.
    const onRoute = () => { if (!destroyed) showImage(); };
    window.addEventListener('hashchange', onRoute);
    showImage();
    return { destroy() { if (destroyed) return; destroyed = true; stop(); window.removeEventListener('hashchange', onRoute); section.remove(); } };
  }
  window.DecorModelPreview = Object.freeze({ mount });
})();
