import { Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

function centerModel(root) {
  const bounds = new Box3().setFromObject(root);
  const size = new Vector3();
  const center = new Vector3();
  bounds.getSize(size);
  bounds.getCenter(center);

  root.position.sub(center);

  const largestAxis = Math.max(size.x, size.y, size.z);
  if (largestAxis > 0) {
    const targetSize = 2.8;
    const scale = targetSize / largestAxis;
    root.scale.multiplyScalar(scale);
  }

  root.updateMatrixWorld(true);
}

export async function loadGlbModel(source, modelGroup, options = {}) {
  if (!source) {
    throw new Error('A GLB source is required.');
  }
  if (!modelGroup) {
    throw new Error('A model group is required.');
  }

  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(source);
  const root = gltf.scene;
  root.name = root.name || 'ImportedGlbModel';

  if (options.center !== false) {
    centerModel(root);
  }

  modelGroup.add(root);

  return {
    root,
    animations: gltf.animations ?? [],
    metadata: gltf.asset ?? {}
  };
}
