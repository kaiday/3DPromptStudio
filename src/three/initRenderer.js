import * as THREE from 'three';

const DEFAULT_CAMERA_POSITION = [3, 2.2, 4];
const DEFAULT_CAMERA_TARGET = [0, 0.8, 0];
const DEFAULT_BACKGROUND = '#f5f7f8';

function getContainerSize(container) {
  const width = Math.max(container.clientWidth || 0, 1);
  const height = Math.max(container.clientHeight || 0, 1);

  return { width, height };
}

function createDefaultLights() {
  const ambientLight = new THREE.AmbientLight('#ffffff', 1.25);

  const keyLight = new THREE.DirectionalLight('#ffffff', 2.4);
  keyLight.position.set(4, 6, 5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 30;

  const fillLight = new THREE.DirectionalLight('#dbeafe', 0.9);
  fillLight.position.set(-4, 3, -4);

  return { ambientLight, keyLight, fillLight };
}

function createGroundHelpers(options) {
  const helpers = new THREE.Group();
  helpers.name = 'SceneHelpers';

  if (options.showGrid !== false) {
    const grid = new THREE.GridHelper(
      options.gridSize ?? 8,
      options.gridDivisions ?? 16,
      options.gridColor ?? '#aeb7c0',
      options.gridCenterColor ?? '#d4dbe2'
    );
    grid.name = 'ViewportGrid';
    helpers.add(grid);
  }

  if (options.showGround === true) {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(options.groundSize ?? 24, options.groundSize ?? 24),
      new THREE.ShadowMaterial({ color: '#111827', opacity: options.groundOpacity ?? 0.12 })
    );
    ground.name = 'ShadowGround';
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    helpers.add(ground);
  }

  return helpers;
}

export function initRenderer(container, options = {}) {
  if (!container) {
    throw new Error('initRenderer requires a valid container element.');
  }

  const { width, height } = getContainerSize(container);
  const scene = new THREE.Scene();
  scene.name = options.sceneName ?? '3DPromptStudioScene';
  scene.background = new THREE.Color(options.background ?? DEFAULT_BACKGROUND);

  const camera = new THREE.PerspectiveCamera(options.fov ?? 45, width / height, options.near ?? 0.1, options.far ?? 100);
  camera.position.fromArray(options.cameraPosition ?? DEFAULT_CAMERA_POSITION);
  camera.lookAt(...(options.cameraTarget ?? DEFAULT_CAMERA_TARGET));

  const renderer = new THREE.WebGLRenderer({
    antialias: options.antialias ?? true,
    alpha: options.alpha ?? false,
    powerPreference: options.powerPreference ?? 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, options.maxPixelRatio ?? 2));
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = options.enableShadows ?? true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.dataset.renderer = '3dpromptstudio';
  container.appendChild(renderer.domElement);

  const modelGroup = new THREE.Group();
  modelGroup.name = options.modelGroupName ?? 'ImportedModelGroup';
  scene.add(modelGroup);

  const lights = createDefaultLights();
  scene.add(lights.ambientLight, lights.keyLight, lights.fillLight);

  const helpers = createGroundHelpers(options);
  scene.add(helpers);

  let controls = options.controls ?? null;
  let frameId = null;
  let isDisposed = false;

  function resize() {
    if (isDisposed) return;

    const nextSize = getContainerSize(container);
    camera.aspect = nextSize.width / nextSize.height;
    camera.updateProjectionMatrix();
    renderer.setSize(nextSize.width, nextSize.height, false);
  }

  function resetView() {
    camera.position.fromArray(options.cameraPosition ?? DEFAULT_CAMERA_POSITION);
    camera.lookAt(...(options.cameraTarget ?? DEFAULT_CAMERA_TARGET));

    if (controls) {
      if (controls.target) {
        controls.target.fromArray(options.cameraTarget ?? DEFAULT_CAMERA_TARGET);
      }
      if (typeof controls.reset === 'function') {
        controls.reset();
      }
      if (typeof controls.update === 'function') {
        controls.update();
      }
    }
  }

  function animate() {
    if (isDisposed) return;

    if (controls && typeof controls.update === 'function') {
      controls.update();
    }

    renderer.render(scene, camera);
    frameId = window.requestAnimationFrame(animate);
  }

  function setControls(nextControls) {
    controls = nextControls;
  }

  function dispose() {
    if (isDisposed) return;
    isDisposed = true;

    if (frameId !== null) {
      window.cancelAnimationFrame(frameId);
    }

    if (controls && typeof controls.dispose === 'function') {
      controls.dispose();
    }

    renderer.dispose();

    if (renderer.domElement.parentElement === container) {
      container.removeChild(renderer.domElement);
    }
  }

  window.addEventListener('resize', resize);

  const originalDispose = dispose;
  function disposeWithListeners() {
    window.removeEventListener('resize', resize);
    originalDispose();
  }

  animate();

  return {
    scene,
    camera,
    renderer,
    controls,
    modelGroup,
    lights,
    helpers,
    resize,
    resetView,
    setControls,
    dispose: disposeWithListeners
  };
}
