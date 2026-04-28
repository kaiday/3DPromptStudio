function disposeMaterial(material) {
  if (!material) return;

  const materials = Array.isArray(material) ? material : [material];
  materials.forEach((item) => {
    if (!item) return;

    Object.values(item).forEach((value) => {
      if (value?.isTexture && typeof value.dispose === 'function') {
        value.dispose();
      }
    });

    if (typeof item.dispose === 'function') {
      item.dispose();
    }
  });
}

export function disposeObject3D(root) {
  root.traverse((node) => {
    if (!node.isMesh) return;

    if (node.geometry && typeof node.geometry.dispose === 'function') {
      node.geometry.dispose();
    }

    disposeMaterial(node.material);
  });
}
