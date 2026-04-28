function slugifyPartName(name, fallback) {
  return (name || fallback)
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function vectorToArray(vector) {
  return [vector.x, vector.y, vector.z];
}

function rotationToArray(rotation) {
  return [rotation.x, rotation.y, rotation.z];
}

function getMaterialName(material) {
  if (Array.isArray(material)) {
    return material.map((item) => item?.name).filter(Boolean).join(', ');
  }

  return material?.name ?? '';
}

function getMaterialColor(material) {
  const firstMaterial = Array.isArray(material) ? material.find((item) => item?.color) : material;
  return firstMaterial?.color ? `#${firstMaterial.color.getHexString()}` : '';
}

export function collectMeshMetadata(root) {
  const parts = [];
  const seenIds = new Map();

  root.traverse((node) => {
    if (!node.isMesh) return;

    const baseId = slugifyPartName(node.name, `mesh-${parts.length + 1}`) || `mesh-${parts.length + 1}`;
    const count = seenIds.get(baseId) ?? 0;
    seenIds.set(baseId, count + 1);
    const id = count === 0 ? baseId : `${baseId}-${count + 1}`;

    parts.push({
      id,
      name: node.name || id,
      meshName: node.name || '',
      materialName: getMaterialName(node.material),
      color: getMaterialColor(node.material),
      position: vectorToArray(node.position),
      rotation: rotationToArray(node.rotation),
      scale: vectorToArray(node.scale)
    });
  });

  return parts;
}
