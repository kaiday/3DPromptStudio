import { cloneMaterialForEditing } from './materialUtils.js';
import { collectMeshMetadata } from './sceneTraversal.js';

const DEFAULT_ALLOWED_EDITS = ['color', 'material', 'visibility', 'scale', 'position', 'rotation'];

function snapshotPart(mesh) {
  return {
    visible: mesh.visible,
    position: mesh.position.clone(),
    rotation: mesh.rotation.clone(),
    scale: mesh.scale.clone(),
    material: cloneMaterialForEditing(mesh.material)
  };
}

function restorePart(mesh, snapshot) {
  mesh.visible = snapshot.visible;
  mesh.position.copy(snapshot.position);
  mesh.rotation.copy(snapshot.rotation);
  mesh.scale.copy(snapshot.scale);
  mesh.material = cloneMaterialForEditing(snapshot.material);
}

export function createPartRegistry(root) {
  const metadata = collectMeshMetadata(root);
  const meshByName = new Map();
  const parts = new Map();

  root.traverse((node) => {
    if (!node.isMesh) return;
    const entries = meshByName.get(node.name) ?? [];
    entries.push(node);
    meshByName.set(node.name, entries);
  });

  metadata.forEach((part) => {
    const meshes = meshByName.get(part.meshName) ?? [];
    const mesh = meshes.shift();
    if (!mesh) return;

    mesh.material = cloneMaterialForEditing(mesh.material);
    parts.set(part.id, {
      ...part,
      mesh,
      allowedEdits: DEFAULT_ALLOWED_EDITS,
      original: snapshotPart(mesh)
    });
  });

  function getPart(id) {
    return parts.get(id) ?? null;
  }

  function listParts() {
    return Array.from(parts.values()).map(({ mesh, original, ...part }) => part);
  }

  function hasPart(id) {
    return parts.has(id);
  }

  function resetPart(id) {
    const part = getPart(id);
    if (!part) return false;
    restorePart(part.mesh, part.original);
    return true;
  }

  function resetAll() {
    parts.forEach((part) => restorePart(part.mesh, part.original));
  }

  return {
    getPart,
    listParts,
    hasPart,
    resetPart,
    resetAll
  };
}
