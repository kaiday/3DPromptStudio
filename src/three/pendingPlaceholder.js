import * as THREE from 'three';

const DEFAULT_COLOR = 0x0a84ff;
const DEFAULT_POSITION = [0, 0.12, 0];
const DEFAULT_SCALE = [1, 1, 1];

function toVector3(value, fallback) {
  if (value?.isVector3) return value.clone();
  const source = Array.isArray(value) && value.length >= 3 ? value : fallback;
  return new THREE.Vector3(Number(source[0]) || 0, Number(source[1]) || 0, Number(source[2]) || 0);
}

function toScaleVector(value) {
  if (Number.isFinite(value)) return new THREE.Vector3(value, value, value);
  return toVector3(value, DEFAULT_SCALE);
}

function toColor(value) {
  if (value instanceof THREE.Color) return value.clone();
  return new THREE.Color(value ?? DEFAULT_COLOR);
}

function createPlaceholderMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color.clone().multiplyScalar(0.72),
    roughness: 0.54,
    metalness: 0.02,
    flatShading: true,
    transparent: true,
    opacity: 0.82
  });
}

function createGlowMaterial(color) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
}

function applySelectableData(object, id, jobId) {
  object.userData.partId = id;
  object.userData.jobId = jobId;
  object.userData.isGenerationPlaceholder = true;
}

export function createPendingPlaceholder({ id, color = DEFAULT_COLOR, position = DEFAULT_POSITION, scale = DEFAULT_SCALE } = {}) {
  const partId = id ?? `pending_placeholder_${Date.now()}`;
  const placeholderColor = toColor(color);
  const group = new THREE.Group();
  group.name = `Pending_Generation_${partId}`;
  group.position.copy(toVector3(position, DEFAULT_POSITION));
  group.scale.copy(toScaleVector(scale));
  applySelectableData(group, partId, partId);

  const body = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.42, 1),
    createPlaceholderMaterial(placeholderColor)
  );
  body.name = `${partId}_Body`;
  body.castShadow = true;
  body.receiveShadow = true;
  applySelectableData(body, partId, partId);

  const inner = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.28, 0),
    new THREE.MeshStandardMaterial({
      color: placeholderColor.clone().offsetHSL(0, -0.18, 0.18),
      emissive: placeholderColor.clone().multiplyScalar(0.5),
      roughness: 0.48,
      flatShading: true,
      transparent: true,
      opacity: 0.72
    })
  );
  inner.name = `${partId}_Core`;
  inner.position.set(0.12, 0.08, -0.06);
  inner.castShadow = true;
  applySelectableData(inner, partId, partId);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 24, 16),
    createGlowMaterial(placeholderColor)
  );
  glow.name = `${partId}_Glow`;
  applySelectableData(glow, partId, partId);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.54, 0.012, 10, 48),
    new THREE.MeshBasicMaterial({
      color: placeholderColor,
      transparent: true,
      opacity: 0.42
    })
  );
  ring.name = `${partId}_Pulse_Ring`;
  ring.rotation.x = Math.PI / 2;
  applySelectableData(ring, partId, partId);

  group.add(glow, body, inner, ring);
  group.userData.basePosition = group.position.clone();
  group.userData.baseScale = group.scale.clone();
  group.userData.baseRotation = group.rotation.clone();

  return group;
}

export function updatePendingPlaceholder(group, elapsedSeconds = 0) {
  if (!group) return;

  const basePosition = group.userData.basePosition ?? group.position;
  const baseScale = group.userData.baseScale ?? group.scale;
  const pulse = 1 + Math.sin(elapsedSeconds * 3.2) * 0.055;
  const bob = Math.sin(elapsedSeconds * 2.1) * 0.045;
  group.position.set(basePosition.x, basePosition.y + bob, basePosition.z);
  group.scale.set(baseScale.x * pulse, baseScale.y * pulse, baseScale.z * pulse);
  group.rotation.y = (group.userData.baseRotation?.y ?? 0) + elapsedSeconds * 0.34;

  const glow = group.children.find((child) => child.name.endsWith('_Glow'));
  if (glow?.material) glow.material.opacity = 0.12 + Math.sin(elapsedSeconds * 3.2) * 0.035;

  const ring = group.children.find((child) => child.name.endsWith('_Pulse_Ring'));
  if (ring) {
    const ringPulse = 1.02 + Math.sin(elapsedSeconds * 2.7) * 0.08;
    ring.scale.setScalar(ringPulse);
    ring.rotation.z = elapsedSeconds * 0.52;
  }
}

export function disposePendingPlaceholder(group) {
  if (!group) return;

  group.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    }
  });
}
