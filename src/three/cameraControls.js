import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function createCameraControls(camera, domElement, options = {}) {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = options.enableDamping ?? true;
  controls.dampingFactor = options.dampingFactor ?? 0.08;
  controls.target.fromArray(options.target ?? [0, 0.8, 0]);
  controls.minDistance = options.minDistance ?? 1.2;
  controls.maxDistance = options.maxDistance ?? 12;
  controls.enablePan = options.enablePan ?? true;
  controls.screenSpacePanning = options.screenSpacePanning ?? false;
  controls.update();
  controls.saveState();

  return controls;
}
