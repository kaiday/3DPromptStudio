import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

function parseExportResult(result) {
  if (result instanceof ArrayBuffer) {
    return new Blob([result], { type: 'model/gltf-binary' });
  }

  return new Blob([JSON.stringify(result, null, 2)], { type: 'model/gltf+json' });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function exportGlb(root, options = {}) {
  if (!root) {
    throw new Error('A model root is required for GLB export.');
  }

  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(root, {
    binary: options.binary ?? true,
    onlyVisible: options.onlyVisible ?? true,
    trs: options.trs ?? false
  });

  return parseExportResult(result);
}

export async function downloadGlb(root, filename = '3dpromptstudio-export.glb', options = {}) {
  const blob = await exportGlb(root, options);
  downloadBlob(blob, filename);

  return {
    filename,
    size: blob.size,
    type: blob.type
  };
}
