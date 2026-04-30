import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { loadGlbModel } from '../three/loadGlbModel.js';
import { buildPartRegistryFromObject } from '../three/partRegistry.js';
import { createPendingPlaceholder, disposePendingPlaceholder, updatePendingPlaceholder } from '../three/pendingPlaceholder.js';

function formatVector(vector = []) {
  return vector.map((value) => Number(value).toFixed(2)).join(', ');
}

function getToolLabel(tool) {
  const labels = {
    mouse: 'Select',
    annotation: 'Annotate',
    line: 'Line',
    cut: 'Cut',
    'zoom-in': 'Zoom in',
    'zoom-out': 'Zoom out'
  };
  return labels[tool] ?? 'Select';
}

function getToolInstruction(tool) {
  const instructions = {
    annotation: 'Click a surface to place annotation',
    line: 'Click and drag to draw guide line',
    cut: 'Click and drag to size cut plane'
  };
  return instructions[tool] ?? getToolLabel(tool);
}

function formatDistance(value) {
  if (!Number.isFinite(value)) return '0.00';
  return value.toFixed(2);
}

function getModelUrl(model, scene) {
  return (
    model?.url ??
    model?.fileUrl ??
    model?.src ??
    model?.assetUrl ??
    model?.glbUrl ??
    model?.gltfUrl ??
    scene?.modelUrl ??
    scene?.assetUrl ??
    null
  );
}

function getModelStatusLabel(status) {
  const labels = {
    loading: 'Loading model',
    ready: 'Model loaded',
    placeholder: 'Placeholder',
    error: 'Import failed'
  };
  return labels[status] ?? 'Viewport';
}

function createBoxPart({ id, name, color, position, scale, selected }) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.62,
    metalness: 0.04,
    emissive: selected ? new THREE.Color(0x0a84ff) : new THREE.Color(0x000000),
    emissiveIntensity: selected ? 0.08 : 0
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.userData.partId = id;
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createLegPart({ id, name, position, rotation = 0, selected }) {
  const geometry = new THREE.CylinderGeometry(0.07, 0.09, 1.15, 18);
  const material = new THREE.MeshStandardMaterial({
    color: selected ? 0x0a84ff : 0x2c2c2e,
    roughness: 0.55,
    metalness: 0.08
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.userData.partId = id;
  mesh.position.set(...position);
  mesh.rotation.z = rotation;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function applyPartOverrides(meshes, partOverrides) {
  meshes.forEach((mesh) => {
    const override = partOverrides?.[mesh.userData.partId];
    if (!override) return;

    if (override.visible !== undefined) {
      mesh.visible = override.visible;
    }

    if (override.material?.color && mesh.material?.color) {
      mesh.material.color.set(override.material.color);
      mesh.material.needsUpdate = true;
    }
  });
}

function vectorFromArray(value, fallback = [0, 0, 0]) {
  const source = Array.isArray(value) && value.length >= 3 ? value : fallback;
  return new THREE.Vector3(Number(source[0]) || 0, Number(source[1]) || 0, Number(source[2]) || 0);
}

function createCylinderBetweenPoints(start, end, color, radius = 0.012) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = Math.max(direction.length(), 0.001);
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 16);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.42,
    metalness: 0.04
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function createCutPlaneMesh({ position, normal, size, color, selected }) {
  const planeSize = Number.isFinite(size) ? THREE.MathUtils.clamp(size, 0.24, 1.8) : 0.78;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(planeSize, planeSize),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.52,
      metalness: 0,
      opacity: selected ? 0.28 : 0.18,
      transparent: true,
      side: THREE.DoubleSide
    })
  );
  mesh.position.copy(position);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  return mesh;
}

function createSceneObjectMesh(sceneObject, selectedPartId) {
  const color = sceneObject.material?.color ?? sceneObject.color ?? '#0a84ff';
  const isSelected = sceneObject.id === selectedPartId;
  const root = new THREE.Group();
  root.name = sceneObject.name;
  root.userData.partId = sceneObject.id;
  root.visible = sceneObject.visible !== false;

  if (sceneObject.type === 'annotation') {
    const position = vectorFromArray(sceneObject.position);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(isSelected ? 0.06 : 0.045, 24, 16),
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.34,
        metalness: 0.08,
        emissive: new THREE.Color(color),
        emissiveIntensity: isSelected ? 0.22 : 0.08
      })
    );
    mesh.position.copy(position);
    mesh.userData.partId = sceneObject.id;
    root.add(mesh);
    if (isSelected) {
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.095, 0.006, 12, 36),
        new THREE.MeshBasicMaterial({ color: 0x0a84ff, transparent: true, opacity: 0.72 })
      );
      halo.position.copy(position);
      halo.lookAt(new THREE.Vector3(0, 0.18, 4.65));
      halo.userData.partId = sceneObject.id;
      root.add(halo);
    }
  } else if (sceneObject.type === 'guide_line') {
    const start = vectorFromArray(sceneObject.position);
    const end = vectorFromArray(sceneObject.endPosition, [start.x + 0.7, start.y, start.z]);
    const mesh = createCylinderBetweenPoints(start, end, color, isSelected ? 0.018 : 0.012);
    mesh.userData.partId = sceneObject.id;
    root.add(mesh);
    if (isSelected) {
      const startCap = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 18, 12),
        new THREE.MeshBasicMaterial({ color: 0x0a84ff })
      );
      const endCap = startCap.clone();
      startCap.position.copy(start);
      endCap.position.copy(end);
      startCap.userData.partId = sceneObject.id;
      endCap.userData.partId = sceneObject.id;
      root.add(startCap, endCap);
    }
  } else if (sceneObject.type === 'cut_plane') {
    const position = vectorFromArray(sceneObject.position);
    const normal = vectorFromArray(sceneObject.normal, [0, 0, 1]).normalize();
    const mesh = createCutPlaneMesh({
      position,
      normal,
      size: sceneObject.size,
      color,
      selected: isSelected
    });
    mesh.userData.partId = sceneObject.id;
    root.add(mesh);
    if (isSelected) {
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry),
        new THREE.LineBasicMaterial({ color: 0x0a84ff, transparent: true, opacity: 0.86 })
      );
      edge.position.copy(position);
      edge.quaternion.copy(mesh.quaternion);
      root.add(edge);
    }
  }

  return root;
}

function buildHitPayload(hit) {
  const normal = hit.face?.normal?.clone() ?? new THREE.Vector3(0, 1, 0);
  normal.transformDirection(hit.object.matrixWorld).normalize();

  return {
    partId: hit.object.userData.partId,
    point: hit.point.toArray(),
    normal: normal.toArray()
  };
}

function getPointerWorldPoint(event, renderer, pointer, raycaster, camera, plane) {
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
  raycaster.setFromCamera(pointer, camera);
  const point = new THREE.Vector3();
  return raycaster.ray.intersectPlane(plane, point) ? point : null;
}

function createPlaceholderModel(selectedPartId) {
  const group = new THREE.Group();
  group.rotation.y = -0.48;
  group.rotation.x = 0.08;
  group.scale.setScalar(0.78);
  group.position.y = -0.05;

  const backrest = createBoxPart({
    id: 'backrest',
    name: 'Backrest',
    color: 0xb78355,
    position: [0, 0.95, -0.16],
    scale: [1.18, 1.38, 0.18],
    selected: selectedPartId === 'backrest'
  });
  const seat = createBoxPart({
    id: 'seat',
    name: 'Seat',
    color: 0xd2a171,
    position: [0, 0.12, 0.18],
    scale: [1.36, 0.2, 1.02],
    selected: selectedPartId === 'seat'
  });
  const cushion = createBoxPart({
    id: 'seat-cushion',
    name: 'Cushion',
    color: selectedPartId === 'seat-cushion' ? 0x78bb97 : 0x8bbe9a,
    position: [0, 0.28, 0.16],
    scale: [1.14, 0.18, 0.84],
    selected: selectedPartId === 'seat-cushion'
  });

  group.add(backrest, seat, cushion);
  group.add(
    createLegPart({ id: 'front-leg-left', name: 'Front Leg L', position: [-0.5, -0.5, 0.52], rotation: -0.08, selected: selectedPartId === 'front-leg-left' }),
    createLegPart({ id: 'front-leg-right', name: 'Front Leg R', position: [0.5, -0.5, 0.52], rotation: 0.08, selected: selectedPartId === 'front-leg-right' }),
    createLegPart({ id: 'rear-leg-left', name: 'Rear Leg L', position: [-0.48, -0.52, -0.28], rotation: 0.08, selected: selectedPartId === 'rear-leg-left' }),
    createLegPart({ id: 'rear-leg-right', name: 'Rear Leg R', position: [0.48, -0.52, -0.28], rotation: -0.08, selected: selectedPartId === 'rear-leg-right' })
  );

  const selectedPart = group.children.find((child) => child.userData.partId === selectedPartId);
  if (selectedPart) {
    const outline = new THREE.BoxHelper(selectedPart, 0x0a84ff);
    outline.name = 'Selection outline';
    group.add(outline);
  }

  return group;
}

function prepareLoadedModel(model, selectedPartId, metadataParts) {
  const selectableMeshes = [];
  const root = new THREE.Group();
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z) || 1;

  model.position.sub(center);
  model.scale.setScalar(1.85 / maxDimension);
  model.rotation.y = -0.32;
  const registryParts = buildPartRegistryFromObject(model, metadataParts);
  model.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    selectableMeshes.push(child);
  });
  root.add(model);

  const selectedPart = selectableMeshes.find((child) => child.userData.partId === selectedPartId);
  if (selectedPart) {
    const outline = new THREE.BoxHelper(selectedPart, 0x0a84ff);
    outline.name = 'Selection outline';
    root.add(outline);
  }

  return { model: root, selectableMeshes, registryParts };
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    }
  });
}

function getPendingPlaceholderId(placeholder, index) {
  return placeholder?.id ?? placeholder?.jobId ?? placeholder?.job_id ?? `pending_generation_${index + 1}`;
}

function isPendingPlaceholderActive(placeholder) {
  const status = placeholder?.status ?? 'queued';
  return status === 'queued' || status === 'running';
}

function ThreeViewport({
  selectedPartId,
  selectedTool,
  modelUrl,
  metadataParts,
  sceneObjects,
  pendingPlaceholders,
  partOverrides,
  cameraStateRef,
  resetViewToken,
  fitViewToken,
  onSelectPart,
  onCreateSceneObject,
  onDraftFeedback,
  fallbackPartId,
  onStatusChange,
  onPartRegistryChange
}) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      onStatusChange('error');
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = 'three-canvas';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    const savedCameraState = cameraStateRef.current;
    const target = savedCameraState?.target ? vectorFromArray(savedCameraState.target, [0, 0.18, 0]) : new THREE.Vector3(0, 0.18, 0);
    const spherical = savedCameraState?.spherical
      ? new THREE.Spherical(savedCameraState.spherical.radius, savedCameraState.spherical.phi, savedCameraState.spherical.theta)
      : new THREE.Spherical(selectedTool === 'zoom-in' ? 4.15 : selectedTool === 'zoom-out' ? 5.25 : 4.65, 1.2, 0.48);
    const defaultSpherical = spherical.clone();
    let resetViewVersion = resetViewToken;
    let fitViewVersion = fitViewToken;

    function updateCamera() {
      camera.position.setFromSpherical(spherical).add(target);
      camera.lookAt(target);
    }
    updateCamera();

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.7);
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(3, 4, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    const fillLight = new THREE.DirectionalLight(0x8ab4ff, 0.75);
    fillLight.position.set(-3, 2, -2);
    scene.add(ambientLight, keyLight, fillLight);

    let disposed = false;
    let activeModel = null;
    let activeSceneObjects = null;
    let activePendingPlaceholders = null;
    let pendingPlaceholderGroups = [];
    let selectableMeshes = [];
    let outline = null;
    let previewObject = null;

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.65, 64),
      new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.12 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.12;
    floor.receiveShadow = true;
    scene.add(floor);

    function mountModel(model, nextSelectableMeshes) {
      if (activeModel) {
        scene.remove(activeModel);
        disposeObject(activeModel);
      }
      if (activeSceneObjects) {
        scene.remove(activeSceneObjects);
        disposeObject(activeSceneObjects);
      }
      if (activePendingPlaceholders) {
        scene.remove(activePendingPlaceholders);
        pendingPlaceholderGroups.forEach(disposePendingPlaceholder);
      }
      activeModel = model;
      activeSceneObjects = new THREE.Group();
      activeSceneObjects.name = 'Scene edit objects';
      activePendingPlaceholders = new THREE.Group();
      activePendingPlaceholders.name = 'Pending generation placeholders';
      const objectMeshes = [];
      const pendingMeshes = [];
      sceneObjects.forEach((sceneObject) => {
        const override = partOverrides?.[sceneObject.id] ?? {};
        const objectMesh = createSceneObjectMesh(
          {
            ...sceneObject,
            ...override,
            material: {
              ...(sceneObject.material ?? {}),
              ...(override.material ?? {})
            }
          },
          selectedPartId
        );
        objectMesh.traverse((child) => {
          if (child.isMesh) objectMeshes.push(child);
        });
        activeSceneObjects.add(objectMesh);
      });
      pendingPlaceholderGroups = pendingPlaceholders.filter(isPendingPlaceholderActive).map((placeholder, index) => {
        const placeholderGroup = createPendingPlaceholder({
          id: getPendingPlaceholderId(placeholder, index),
          color: placeholder.color,
          position: placeholder.position,
          scale: placeholder.scale
        });
        placeholderGroup.traverse((child) => {
          if (child.isMesh && child.userData.partId) pendingMeshes.push(child);
        });
        activePendingPlaceholders.add(placeholderGroup);
        return placeholderGroup;
      });
      selectableMeshes = [...nextSelectableMeshes, ...objectMeshes, ...pendingMeshes];
      applyPartOverrides(selectableMeshes, partOverrides);
      scene.add(activeModel);
      scene.add(activeSceneObjects);
      scene.add(activePendingPlaceholders);
    }

    function mountPlaceholder({ reportRegistry = false } = {}) {
      const placeholder = createPlaceholderModel(selectedPartId);
      const placeholderMeshes = [];
      placeholder.traverse((child) => {
        if (child.isMesh && child.userData.partId) placeholderMeshes.push(child);
      });
      mountModel(placeholder, placeholderMeshes);
      if (reportRegistry) {
        onPartRegistryChange(buildPartRegistryFromObject(placeholder, metadataParts));
      }
    }

    if (modelUrl) {
      onStatusChange('loading');
      onPartRegistryChange([]);
      loadGlbModel(modelUrl)
        .then((loadedModel) => {
          if (disposed) return;
          const preparedModel = prepareLoadedModel(loadedModel, selectedPartId, metadataParts);
          mountModel(preparedModel.model, preparedModel.selectableMeshes);
          onPartRegistryChange(preparedModel.registryParts);
          onStatusChange('ready');
        })
        .catch(() => {
          if (disposed) return;
          mountPlaceholder();
          onPartRegistryChange([]);
          onStatusChange('error');
        });
    } else {
      mountPlaceholder();
      onStatusChange('placeholder');
    }

    function resize() {
      const { clientWidth, clientHeight } = mount;
      if (!clientWidth || !clientHeight) return;
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pointerState = {
      button: 0,
      isDragging: false,
      mode: 'orbit',
      draft: null,
      pointerId: null,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0
    };

    function setPointerFromEvent(event) {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
    }

    function selectMeshAtPointer(event) {
      setPointerFromEvent(event);
      raycaster.setFromCamera(pointer, camera);
      const [hit] = raycaster.intersectObjects(selectableMeshes, false);

      if (['annotation', 'line', 'cut'].includes(selectedTool)) {
        if (hit) onCreateSceneObject(selectedTool, buildHitPayload(hit));
        return;
      }

      onSelectPart(hit?.object?.userData.partId ?? selectedPartId ?? fallbackPartId);
    }

    function getMeshHitAtPointer(event) {
      setPointerFromEvent(event);
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(selectableMeshes, false).find((hit) => !hit.object.userData.isDraftPreview) ?? null;
    }

    function removePreviewObject() {
      if (!previewObject) return;
      scene.remove(previewObject);
      disposeObject(previewObject);
      previewObject = null;
    }

    function cancelDraft() {
      removePreviewObject();
      pointerState.draft = null;
      pointerState.mode = 'orbit';
      onDraftFeedback('');
      if (pointerState.pointerId !== null && renderer.domElement.hasPointerCapture(pointerState.pointerId)) {
        renderer.domElement.releasePointerCapture(pointerState.pointerId);
      }
      pointerState.pointerId = null;
    }

    function updateDraftPreview(event) {
      const draft = pointerState.draft;
      if (!draft) return;

      const endPoint = getPointerWorldPoint(event, renderer, pointer, raycaster, camera, draft.dragPlane);
      if (!endPoint) return;

      removePreviewObject();
      if (draft.tool === 'line') {
        previewObject = createCylinderBetweenPoints(draft.startPoint, endPoint, 0xc68a2d, 0.014);
        onDraftFeedback(`Guide line ${formatDistance(draft.startPoint.distanceTo(endPoint))} | release to confirm`);
      } else {
        const size = THREE.MathUtils.clamp(draft.startPoint.distanceTo(endPoint) * 1.5, 0.24, 1.8);
        previewObject = createCutPlaneMesh({
          position: draft.startPoint,
          normal: draft.normal,
          size,
          color: 0xff3b30,
          selected: true
        });
        onDraftFeedback(`Cut plane ${formatDistance(size)} | release to confirm`);
      }
      previewObject.userData.isDraftPreview = true;
      scene.add(previewObject);
      draft.endPoint = endPoint;
    }

    function handlePointerDown(event) {
      pointerState.button = event.button;
      pointerState.isDragging = false;
      pointerState.draft = null;
      pointerState.pointerId = event.pointerId;
      pointerState.startX = event.clientX;
      pointerState.startY = event.clientY;
      pointerState.lastX = event.clientX;
      pointerState.lastY = event.clientY;

      if (event.button === 0 && ['line', 'cut'].includes(selectedTool)) {
        const hit = getMeshHitAtPointer(event);
        if (hit) {
          const payload = buildHitPayload(hit);
          const startPoint = vectorFromArray(payload.point);
          const normal = vectorFromArray(payload.normal, [0, 1, 0]).normalize();
          const cameraNormal = new THREE.Vector3().subVectors(camera.position, startPoint).normalize();
          pointerState.mode = 'draft';
          pointerState.draft = {
            tool: selectedTool,
            partId: payload.partId,
            startPoint,
            normal,
            dragPlane: new THREE.Plane().setFromNormalAndCoplanarPoint(cameraNormal, startPoint),
            endPoint: startPoint.clone()
          };
          removePreviewObject();
          onDraftFeedback(`${selectedTool === 'line' ? 'Guide line' : 'Cut plane'} started | drag to set size`);
        } else {
          pointerState.mode = 'orbit';
        }
      } else {
        pointerState.mode = event.shiftKey || event.button === 1 || event.button === 2 ? 'pan' : 'orbit';
      }

      renderer.domElement.setPointerCapture(event.pointerId);
    }

    function handlePointerMove(event) {
      if (pointerState.pointerId !== event.pointerId) return;

      const deltaX = event.clientX - pointerState.lastX;
      const deltaY = event.clientY - pointerState.lastY;
      const totalX = event.clientX - pointerState.startX;
      const totalY = event.clientY - pointerState.startY;
      pointerState.isDragging = pointerState.isDragging || Math.hypot(totalX, totalY) > 4;
      pointerState.lastX = event.clientX;
      pointerState.lastY = event.clientY;

      if (!pointerState.isDragging) return;

      if (pointerState.mode === 'draft') {
        updateDraftPreview(event);
        return;
      }

      if (pointerState.mode === 'pan') {
        const panScale = spherical.radius * 0.0016;
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
        target.addScaledVector(right, -deltaX * panScale);
        target.addScaledVector(up, deltaY * panScale);
      } else {
        spherical.theta -= deltaX * 0.007;
        spherical.phi = THREE.MathUtils.clamp(spherical.phi - deltaY * 0.007, 0.35, Math.PI - 0.32);
      }

      updateCamera();
    }

    function handlePointerUp(event) {
      if (pointerState.pointerId !== event.pointerId) return;
      renderer.domElement.releasePointerCapture(event.pointerId);
      pointerState.pointerId = null;

      if (pointerState.mode === 'draft') {
        updateDraftPreview(event);
        const draft = pointerState.draft;
        removePreviewObject();
        pointerState.draft = null;
        onDraftFeedback('');
        if (draft && pointerState.isDragging && draft.endPoint.distanceTo(draft.startPoint) > 0.04) {
          onCreateSceneObject(draft.tool, {
            partId: draft.partId,
            point: draft.startPoint.toArray(),
            normal: draft.normal.toArray(),
            endPoint: draft.endPoint.toArray(),
            size: draft.tool === 'cut' ? THREE.MathUtils.clamp(draft.startPoint.distanceTo(draft.endPoint) * 1.5, 0.24, 1.8) : undefined
          });
        }
        return;
      }

      if (!pointerState.isDragging && pointerState.button === 0) {
        selectMeshAtPointer(event);
      }
    }

    function handleWheel(event) {
      event.preventDefault();
      const zoomDelta = event.deltaY > 0 ? 1.08 : 0.92;
      spherical.radius = THREE.MathUtils.clamp(spherical.radius * zoomDelta, 2.6, 7.2);
      updateCamera();
    }

    function handleContextMenu(event) {
      event.preventDefault();
    }

    function handleDoubleClick() {
      target.set(0, 0.18, 0);
      spherical.copy(defaultSpherical);
      updateCamera();
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape' && pointerState.draft) {
        event.preventDefault();
        cancelDraft();
      }
    }

    function fitView() {
      const box = new THREE.Box3().setFromObject(activeModel ?? scene);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDimension = Math.max(size.x, size.y, size.z) || 1;
      target.copy(center);
      spherical.radius = THREE.MathUtils.clamp(maxDimension * 2.4, 2.8, 7.2);
      spherical.phi = 1.18;
      spherical.theta = 0.52;
      updateCamera();
    }

    let frameId = 0;
    const clock = new THREE.Clock();
    function render() {
      const elapsedSeconds = clock.getElapsedTime();
      if (resetViewVersion !== resetViewToken) {
        resetViewVersion = resetViewToken;
        handleDoubleClick();
      }
      if (fitViewVersion !== fitViewToken) {
        fitViewVersion = fitViewToken;
        fitView();
      }
      pendingPlaceholderGroups.forEach((placeholderGroup) => updatePendingPlaceholder(placeholderGroup, elapsedSeconds));
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(render);
    }
    if (fitViewToken > 0) {
      fitView();
    }
    render();

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('pointercancel', handlePointerUp);
    renderer.domElement.addEventListener('wheel', handleWheel, { passive: false });
    renderer.domElement.addEventListener('contextmenu', handleContextMenu);
    renderer.domElement.addEventListener('dblclick', handleDoubleClick);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointercancel', handlePointerUp);
      renderer.domElement.removeEventListener('wheel', handleWheel);
      renderer.domElement.removeEventListener('contextmenu', handleContextMenu);
      renderer.domElement.removeEventListener('dblclick', handleDoubleClick);
      window.removeEventListener('keydown', handleKeyDown);
      resizeObserver.disconnect();
      cameraStateRef.current = {
        target: target.toArray(),
        spherical: {
          radius: spherical.radius,
          phi: spherical.phi,
          theta: spherical.theta
        }
      };
      if (outline) outline.dispose();
      removePreviewObject();
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [
    fallbackPartId,
    metadataParts,
    pendingPlaceholders,
    partOverrides,
    cameraStateRef,
    resetViewToken,
    fitViewToken,
    modelUrl,
    onPartRegistryChange,
    onCreateSceneObject,
    onSelectPart,
      onStatusChange,
    onDraftFeedback,
    sceneObjects,
    selectedPartId,
    selectedTool
  ]);

  return <div ref={mountRef} className="three-canvas-host" aria-hidden="true" />;
}

export function SceneViewport({
  scene,
  model,
  viewport,
  selectedPartId,
  selectedTool = 'mouse',
  sceneObjects = [],
  pendingPlaceholders = [],
  partOverrides = {},
  onSelectPart,
  onCreateSceneObject,
  onModelStatusChange,
  onPartRegistryChange
}) {
  const [modelStatus, setModelStatus] = useState('placeholder');
  const [resetViewToken, setResetViewToken] = useState(0);
  const [fitViewToken, setFitViewToken] = useState(0);
  const [draftFeedback, setDraftFeedback] = useState('');
  const cameraStateRef = useRef(null);
  const selectedPart = scene.components.find((component) => component.id === selectedPartId);
  const activeTool = selectedTool === 'zoom' ? 'zoom-in' : selectedTool;
  const fallbackPartId = scene.components[0]?.id ?? null;
  const modelUrl = useMemo(() => getModelUrl(model, scene), [model, scene]);
  const metadataParts = useMemo(
    () => scene.metadata?.parts ?? model?.parts ?? model?.metadata?.parts ?? [],
    [model?.metadata?.parts, model?.parts, scene.metadata?.parts]
  );
  const hasPendingPlaceholders = pendingPlaceholders.some(isPendingPlaceholderActive);
  const hasRenderableScene = scene.components.length > 0 || Boolean(modelUrl) || hasPendingPlaceholders;

  useEffect(() => {
    setDraftFeedback('');
  }, [activeTool]);

  useEffect(() => {
    onModelStatusChange?.(modelStatus);
  }, [modelStatus, onModelStatusChange]);

  return (
    <section className={`viewport-panel scene-viewport scene-viewport-tool-${activeTool}`}>
      <div className="viewport-header">
        <h2 className="panel-title">Object viewport</h2>
        <span>Scene preview</span>
        <span className="viewport-tool-pill">{getToolLabel(activeTool)}</span>
      </div>
      <p className="viewport-meta">
        Camera: [{formatVector(viewport.cameraPosition)}], target [{formatVector(viewport.cameraTarget)}], zoom{' '}
        {viewport.zoom}
      </p>

      {!hasRenderableScene ? (
        <p className="viewport-empty">No scene components available.</p>
      ) : (
        <>
          <div className="viewport-stage" aria-label={`3D model viewport, ${getToolLabel(activeTool)} mode`}>
            <ThreeViewport
              selectedPartId={selectedPartId}
              selectedTool={activeTool}
              modelUrl={modelUrl}
              metadataParts={metadataParts}
              sceneObjects={sceneObjects}
              pendingPlaceholders={pendingPlaceholders}
              partOverrides={partOverrides}
              cameraStateRef={cameraStateRef}
              resetViewToken={resetViewToken}
              fitViewToken={fitViewToken}
              fallbackPartId={fallbackPartId}
              onSelectPart={onSelectPart}
              onCreateSceneObject={onCreateSceneObject}
              onDraftFeedback={setDraftFeedback}
              onStatusChange={setModelStatus}
              onPartRegistryChange={onPartRegistryChange}
            />
            <div className="viewport-camera-controls" aria-label="Camera controls">
              <button type="button" onClick={() => setResetViewToken((current) => current + 1)}>
                Reset
              </button>
              <button type="button" onClick={() => setFitViewToken((current) => current + 1)}>
                Fit
              </button>
            </div>
            <div className={`viewport-model-status viewport-model-status-${modelStatus}`} aria-live="polite">
              {getModelStatusLabel(modelStatus)}
            </div>
            <div className="viewport-interaction-hint" aria-hidden="true">
              Drag to orbit | Shift-drag to pan | Wheel to zoom
            </div>
            {modelStatus === 'loading' ? (
              <div className="viewport-loading-card" aria-live="polite">
                Loading model...
              </div>
            ) : null}
            {modelStatus === 'error' ? (
              <div className="viewport-error-card" aria-live="polite">
                <strong>Could not load model</strong>
                <span>Clear it and try another GLB or GLTF file.</span>
              </div>
            ) : null}
            <div className="viewport-tool-feedback" aria-hidden="true">
              {draftFeedback ||
                (activeTool === 'zoom-in'
                ? 'Zoom +12%'
                : activeTool === 'zoom-out'
                  ? 'Zoom -12%'
                  : ['annotation', 'line', 'cut'].includes(activeTool)
                    ? getToolInstruction(activeTool)
                    : getToolLabel(activeTool))}
            </div>
          </div>
          <div className="viewport-selection-card">
            <span>Selected</span>
            <strong>{selectedPart?.name ?? 'None'}</strong>
          </div>
        </>
      )}
    </section>
  );
}
