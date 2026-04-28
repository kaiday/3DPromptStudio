import { useEffect, useRef } from 'react';
import { createCameraControls } from '../three/cameraControls.js';
import { initRenderer } from '../three/initRenderer.js';
import { loadGlbModel } from '../three/loadGlbModel.js';
import { createPartRegistry } from '../three/partRegistry.js';
import { collectMeshMetadata } from '../three/sceneTraversal.js';
import { applyEditOperations } from '../three/applyEditOperations.js';
import { disposeObject3D } from '../three/disposeScene.js';

export function SceneViewport({ command, modelFile, onError, onModelLoaded, onOperationResult }) {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const loadedModelRef = useRef(null);
  const registryRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const context = initRenderer(containerRef.current, { showGround: true });
    const controls = createCameraControls(context.camera, context.renderer.domElement);
    context.setControls(controls);
    rendererRef.current = context;

    return () => {
      registryRef.current = null;
      loadedModelRef.current = null;
      context.dispose();
    };
  }, []);

  useEffect(() => {
    if (!modelFile || !rendererRef.current) return undefined;

    let isCancelled = false;
    let objectUrl = URL.createObjectURL(modelFile);
    const context = rendererRef.current;

    async function loadModel() {
      try {
        if (loadedModelRef.current) {
          disposeObject3D(loadedModelRef.current);
          context.modelGroup.remove(loadedModelRef.current);
        }

        registryRef.current = null;
        const loaded = await loadGlbModel(objectUrl, context.modelGroup);

        if (isCancelled) {
          disposeObject3D(loaded.root);
          return;
        }

        loadedModelRef.current = loaded.root;
        registryRef.current = createPartRegistry(loaded.root);
        const parts = collectMeshMetadata(loaded.root);
        context.resetView();
        onModelLoaded?.({ parts, root: loaded.root });
      } catch (error) {
        onError?.(`Could not load model: ${error.message}`);
      } finally {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    }

    loadModel();

    return () => {
      isCancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [modelFile, onError, onModelLoaded]);

  useEffect(() => {
    if (!command || !registryRef.current) return;

    const result = applyEditOperations(registryRef.current, [command.operation]);
    onOperationResult?.(result);
  }, [command, onOperationResult]);

  return <div className="sceneViewport" ref={containerRef} aria-label="3D model viewport" />;
}
