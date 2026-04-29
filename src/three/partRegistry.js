function slugifyPartId(value, fallback = 'part') {
  const slug = String(value || fallback)
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || fallback;
}

function labelFromId(value) {
  return String(value || 'Part')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getObjectPartId(object) {
  return (
    object.userData?.partId ??
    object.userData?.id ??
    object.userData?.componentId ??
    object.name ??
    object.uuid
  );
}

export function normalizePartRecord(part, index = 0) {
  const rawId = part?.id ?? part?.objectName ?? part?.name ?? `part_${index + 1}`;
  const id = String(rawId || `part_${index + 1}`).trim() || `part_${index + 1}`;

  return {
    id,
    objectName: part?.objectName ?? part?.meshName ?? null,
    name: part?.name ?? part?.label ?? labelFromId(rawId),
    type: part?.type ?? part?.kind ?? part?.nodeType ?? 'mesh',
    depth: Number.isFinite(part?.depth) ? part.depth : Number.isFinite(part?.level) ? part.level : 0,
    parentId: part?.parentId ?? part?.parent_id ?? null,
    editable: part?.editable !== false,
    visible: part?.visible !== false,
    material: part?.material ?? null,
    allowedEdits: part?.allowedEdits ?? [],
    source: part?.source ?? 'metadata',
    attachedTo: part?.attachedTo ?? part?.attached_to ?? null,
    position: part?.position ?? null,
    endPosition: part?.endPosition ?? part?.end_position ?? null,
    normal: part?.normal ?? null
  };
}

export function buildPartRegistryFromObject(rootObject, metadataParts = []) {
  const metadataByObjectName = new Map();
  const metadataById = new Map();

  metadataParts.map(normalizePartRecord).forEach((part) => {
    metadataById.set(part.id, part);
    metadataById.set(slugifyPartId(part.id), part);
    if (part.objectName) metadataByObjectName.set(part.objectName, part);
  });

  const parts = [];
  rootObject.traverse((object) => {
    if (!object.isMesh) return;

    const rawId = getObjectPartId(object);
    const normalizedId = object.userData?.partId ? String(rawId) : slugifyPartId(rawId, `mesh_${parts.length + 1}`);
    const metadata = metadataByObjectName.get(object.name) ?? metadataById.get(normalizedId) ?? {};
    object.userData.partId = metadata.id ?? normalizedId;

    parts.push(
      normalizePartRecord(
        {
          id: object.userData.partId,
          objectName: object.name || rawId,
          name: object.name ? labelFromId(object.name) : labelFromId(rawId),
          type: 'mesh',
          editable: true,
          visible: object.visible,
          source: 'mesh',
          ...metadata
        },
        parts.length
      )
    );
  });

  return dedupeParts(parts);
}

export function mergePartRegistries(...partGroups) {
  const merged = new Map();

  partGroups
    .flat()
    .filter(Boolean)
    .map(normalizePartRecord)
    .forEach((part) => {
      const previous = merged.get(part.id);
      merged.set(part.id, previous ? { ...part, ...previous, source: previous.source ?? part.source } : part);
    });

  return Array.from(merged.values());
}

export function dedupeParts(parts) {
  const seen = new Map();
  parts.map(normalizePartRecord).forEach((part) => {
    if (!seen.has(part.id)) seen.set(part.id, part);
  });
  return Array.from(seen.values());
}
