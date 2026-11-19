// REQ-209: self-hosted, on-demand static furniture viewer. No background render loop.
import * as T from './vendor/three-r180/three.module.js';
import { GLTFLoader } from './vendor/three-r180/GLTFLoader.js';
import { OrbitControls } from './vendor/three-r180/OrbitControls.js';

function releaseModel(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set(), bitmaps = new Set(), skeletons = new Set();
  root?.traverse(o => {
    if (o.geometry) geometries.add(o.geometry);
    if (o.skeleton) skeletons.add(o.skeleton);
    for (const material of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  textures.forEach(t => { if (t.source?.data?.close) bitmaps.add(t.source.data); t.dispose(); });
  bitmaps.forEach(b => b.close());
  materials.forEach(m => m.dispose());
  geometries.forEach(g => g.dispose());
  skeletons.forEach(s => s.dispose());
}

export async function createViewer({ host, url, recordId, metadata, signal, onError }) {
  let renderer, controls, resizeObserver, model, disposed = false, onKey, onContextLost;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(35, 1, .01, 10000);
  const destroy = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener('abort', destroy);
    resizeObserver?.disconnect();
    controls?.dispose();
    if (renderer) {
      renderer.domElement.removeEventListener('keydown', onKey);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
    }
    releaseModel(model); model = null;
    scene.clear();
    renderer?.dispose();
    renderer?.forceContextLoss();
    renderer?.domElement.remove();
  };
  signal.addEventListener('abort', destroy, { once: true });
  try {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('模型文件暂时无法读取');
    const bytes = await response.arrayBuffer();
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const gltf = await new GLTFLoader().parseAsync(bytes, '');
    if (signal.aborted) { releaseModel(gltf.scene); throw new DOMException('Aborted', 'AbortError'); }
    model = gltf.scene;
    // TASK-084 static material policy. Omit untextured/effect-only surfaces, not solid furniture.
    model.traverse(o => {
      if (!o.isMesh) return;
      const index = gltf.parser.associations.get(o)?.meshes;
      const blend = metadata.blendModes[index];
      if ((String(recordId) === '28559' && blend === 4) || (blend >= 2 && o.geometry.index?.count <= 6)) o.visible = false;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
        if (!m.map) o.visible = false;
        else { m.alphaTest = .5; m.side = T.DoubleSide; m.needsUpdate = true; }
      }
    });
    model.updateMatrixWorld(true);
    const box = new T.Box3(), vertex = new T.Vector3();
    model.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      o.skeleton?.update();
      const index = o.geometry.index, count = index ? index.count : o.geometry.attributes.position.count;
      for (let i = 0; i < count; i++) {
        o.getVertexPosition(index ? index.getX(i) : i, vertex);
        box.expandByPoint(vertex.applyMatrix4(o.matrixWorld));
      }
    });
    if (box.isEmpty()) throw new Error('此模型暂不支持预览');
    const center = box.getCenter(new T.Vector3());
    const radius = Math.max(box.getBoundingSphere(new T.Sphere()).radius, .001);
    renderer = new T.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.setClearColor(0, 0);
    const canvas = renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `${metadata.name}三维预览。方向键旋转，加减键缩放，Home 键复位。`);
    host.appendChild(canvas);
    scene.add(model, new T.HemisphereLight(0xffffff, 0x777777, 2));
    const light = new T.DirectionalLight(0xffffff, 3); light.position.set(3, 5, 4); scene.add(light);
    camera.near = radius / 100; camera.far = radius * 100;
    controls = new OrbitControls(camera, canvas);
    controls.enablePan = false;
    controls.enableDamping = false;
    controls.minDistance = radius * 1.1;
    controls.maxDistance = radius * 12;
    controls.target.copy(center);
    const render = () => { if (!disposed) renderer.render(scene, camera); };
    const reset = () => {
      const angle = Math.min(35 * Math.PI / 180, 2 * Math.atan(Math.tan(17.5 * Math.PI / 180) * camera.aspect));
      camera.position.copy(center).add(new T.Vector3(1, .65, 1.3).normalize().multiplyScalar(radius / Math.sin(angle / 2) * 1.1));
      controls.target.copy(center); controls.update(); render();
    };
    const rotate = (horizontal, vertical = 0) => {
      const spherical = new T.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
      spherical.theta += horizontal; spherical.phi += vertical; spherical.makeSafe();
      camera.position.copy(controls.target).add(new T.Vector3().setFromSpherical(spherical));
      controls.update(); render();
    };
    const zoom = factor => {
      const offset = camera.position.clone().sub(controls.target);
      offset.setLength(T.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance));
      camera.position.copy(controls.target).add(offset); controls.update(); render();
    };
    const resize = () => {
      if (disposed) return;
      const width = host.clientWidth || 480, height = host.clientHeight || 300;
      renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); render();
    };
    controls.addEventListener('change', render);
    onKey = e => {
      const actions = { ArrowLeft: () => rotate(.15), ArrowRight: () => rotate(-.15), ArrowUp: () => rotate(0, -.15), ArrowDown: () => rotate(0, .15), '+': () => zoom(.85), '=': () => zoom(.85), '-': () => zoom(1.18), Home: reset };
      if (actions[e.key]) { e.preventDefault(); actions[e.key](); }
    };
    onContextLost = e => { e.preventDefault(); destroy(); onError('三维显示已中断，请重试或查看图片'); };
    canvas.addEventListener('keydown', onKey);
    canvas.addEventListener('webglcontextlost', onContextLost);
    resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host);
    resize(); reset();
    return { destroy, reset, rotate, zoom };
  } catch (error) { destroy(); throw error; }
}
