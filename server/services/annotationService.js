import { mergeAnnotationPatch, normalizeAnnotation } from '../schemas/annotationSchema.js';

const annotationsByProjectId = new Map();

function getProjectAnnotations(projectId) {
  if (!projectId) throw new Error('projectId is required.');
  if (!annotationsByProjectId.has(projectId)) {
    annotationsByProjectId.set(projectId, []);
  }
  return annotationsByProjectId.get(projectId);
}

export function listAnnotations(projectId, filters = {}) {
  let annotations = [...getProjectAnnotations(projectId)];

  if (filters.status) {
    annotations = annotations.filter((annotation) => annotation.status === filters.status);
  }
  if (filters.partId) {
    annotations = annotations.filter((annotation) => annotation.partId === filters.partId);
  }
  if (filters.variantId) {
    annotations = annotations.filter((annotation) => annotation.variantId === filters.variantId);
  }

  return annotations;
}

export function createAnnotation(projectId, payload) {
  const annotations = getProjectAnnotations(projectId);
  const annotation = normalizeAnnotation(payload, { projectId });
  annotations.push(annotation);
  return annotation;
}

export function updateAnnotation(projectId, annotationId, patch) {
  const annotations = getProjectAnnotations(projectId);
  const index = annotations.findIndex((annotation) => annotation.id === annotationId);

  if (index === -1) {
    throw new Error(`Unknown annotation: ${annotationId}.`);
  }

  const updatedAnnotation = mergeAnnotationPatch(annotations[index], patch);
  annotations[index] = updatedAnnotation;
  return updatedAnnotation;
}

export function deleteAnnotation(projectId, annotationId) {
  const annotations = getProjectAnnotations(projectId);
  const index = annotations.findIndex((annotation) => annotation.id === annotationId);

  if (index === -1) {
    throw new Error(`Unknown annotation: ${annotationId}.`);
  }

  const [deletedAnnotation] = annotations.splice(index, 1);
  return deletedAnnotation;
}

export function clearAnnotations() {
  annotationsByProjectId.clear();
}
