import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

const loader = new GLTFLoader();

function createSampleBox(name, color, position, scale) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.58,
      metalness: 0.04
    })
  );
  mesh.name = name;
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createSampleChairModel() {
  const group = new THREE.Group();
  group.name = 'Sample_Chair';
  group.add(
    createSampleBox('Sample_Backrest', 0x94613d, [0, 1.02, -0.22], [1.2, 1.35, 0.18]),
    createSampleBox('Sample_Seat', 0xa8744b, [0, 0.18, 0.16], [1.36, 0.22, 1]),
    createSampleBox('Sample_Cushion', 0x78bc8e, [0, 0.36, 0.14], [1.12, 0.2, 0.82]),
    createSampleBox('Sample_Front_Leg_L', 0x2c2c2e, [-0.5, -0.45, 0.52], [0.16, 1.1, 0.16]),
    createSampleBox('Sample_Front_Leg_R', 0x2c2c2e, [0.5, -0.45, 0.52], [0.16, 1.1, 0.16]),
    createSampleBox('Sample_Rear_Leg_L', 0x2c2c2e, [-0.48, -0.48, -0.28], [0.16, 1.04, 0.16]),
    createSampleBox('Sample_Rear_Leg_R', 0x2c2c2e, [0.48, -0.48, -0.28], [0.16, 1.04, 0.16])
  );
  return group;
}

export function loadGlbModel(url) {
  if (url?.includes('/samples/sample-chair.')) {
    return Promise.resolve(createSampleChairModel());
  }

  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => resolve(gltf.scene),
      undefined,
      (error) => reject(error)
    );
  });
}
