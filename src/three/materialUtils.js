export function normalizeHexColor(color) {
  if (typeof color !== 'string') return null;

  const trimmed = color.trim();
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  return /^#[0-9a-fA-F]{6}$/.test(withHash) ? withHash : null;
}

export function cloneMaterialForEditing(material) {
  if (Array.isArray(material)) {
    return material.map((item) => item?.clone?.() ?? item);
  }

  return material?.clone?.() ?? material;
}

export function setMaterialColor(material, color) {
  const normalized = normalizeHexColor(color);
  if (!normalized) {
    throw new Error(`Invalid colour value: ${color}`);
  }

  const materials = Array.isArray(material) ? material : [material];
  materials.forEach((item) => {
    if (!item?.color) return;
    item.color.set(normalized);
    item.needsUpdate = true;
  });
}
