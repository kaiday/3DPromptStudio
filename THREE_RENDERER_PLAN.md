# Three Renderer Branch Plan

Branch: `feature/three-renderer`

Purpose: build the browser 3D engine layer for 3DPromptStudio. This branch proves that a Blender-exported GLB model can be loaded, inspected, customized, and updated safely in the browser with Three.js.

Source architecture: `Architecture_3DPromptStudio.md` in the Obsidian vault.

---

## Outcome

By the end of this branch, the app should support this core flow:

```text
User loads chair.glb
  -> Three.js renders the model
  -> app detects editable mesh parts
  -> user selects a part
  -> app changes colour / visibility / transform
  -> app records original state for undo/reset
  -> app disposes old model cleanly when another model loads
```

This branch can use mock UI and mock edit operations. It does not need the real backend or OpenAI integration to prove the renderer.

---

## Critical Tasks

### 1. Renderer Initialization

- [ ] Implement `src/three/initRenderer.js`.
- [ ] Create `THREE.Scene`.
- [ ] Create `THREE.PerspectiveCamera`.
- [ ] Create `THREE.WebGLRenderer`.
- [ ] Configure pixel ratio.
- [ ] Configure renderer size from container dimensions.
- [ ] Add ambient light.
- [ ] Add directional/key light.
- [ ] Add optional grid or ground plane for orientation.
- [ ] Create animation loop.
- [ ] Return renderer context object:
  - [ ] `scene`
  - [ ] `camera`
  - [ ] `renderer`
  - [ ] `controls`
  - [ ] `modelGroup`
  - [ ] `dispose`

### 2. Camera Controls

- [ ] Implement `src/three/cameraControls.js`.
- [ ] Add OrbitControls.
- [ ] Enable damping.
- [ ] Set default camera target.
- [ ] Set safe `minDistance`.
- [ ] Set safe `maxDistance`.
- [ ] Implement reset view helper.
- [ ] Implement resize handler for camera aspect and renderer size.

### 3. GLB Loading

- [ ] Implement `src/three/loadGlbModel.js`.
- [ ] Load local user-selected `.glb` files through object URLs.
- [ ] Load sample/demo `.glb` URL if available.
- [ ] Use Three.js `GLTFLoader`.
- [ ] Add loaded model to `modelGroup`.
- [ ] Normalize or center model if needed.
- [ ] Return loaded model root and useful metadata.
- [ ] Revoke object URLs after load when safe.
- [ ] Surface loading errors clearly.

### 4. Scene Traversal

- [ ] Implement `src/three/sceneTraversal.js`.
- [ ] Traverse loaded GLB scene graph.
- [ ] Detect mesh nodes.
- [ ] Extract mesh name.
- [ ] Extract material name.
- [ ] Extract current colour if available.
- [ ] Extract transform values:
  - [ ] position
  - [ ] rotation
  - [ ] scale
- [ ] Ignore cameras/lights/helper nodes.
- [ ] Return plain metadata array for UI and AI context.

### 5. Editable Part Registry

- [ ] Implement `src/three/partRegistry.js`.
- [ ] Convert mesh nodes into editable parts.
- [ ] Generate stable part IDs from mesh names.
- [ ] Store reference to original Three.js object.
- [ ] Clone material per mesh when needed so one part edit does not affect unrelated shared-material parts.
- [ ] Store original transform.
- [ ] Store original material values.
- [ ] Store allowed edits per part:
  - [ ] colour
  - [ ] material
  - [ ] visibility
  - [ ] scale
  - [ ] position
  - [ ] rotation
- [ ] Expose lookup helpers:
  - [ ] `getPart(id)`
  - [ ] `listParts()`
  - [ ] `hasPart(id)`

### 6. Material Utilities

- [ ] Implement `src/three/materialUtils.js`.
- [ ] Normalize hex colours.
- [ ] Clone materials safely.
- [ ] Apply colour to supported material types.
- [ ] Read current material colour.
- [ ] Preserve roughness/metalness where available.
- [ ] Handle meshes with material arrays.

### 7. Edit Operation Application

- [ ] Implement `src/three/applyEditOperations.js`.
- [ ] Support `set_material_color`.
- [ ] Support `set_visibility`.
- [ ] Support `set_scale`.
- [ ] Support `set_position`.
- [ ] Support `set_rotation`.
- [ ] Support `reset_part`.
- [ ] Validate operation target exists before applying.
- [ ] Validate operation is allowed for the target part.
- [ ] Keep scale/position/rotation within safe bounds.
- [ ] Return operation result:
  - [ ] success
  - [ ] failed operations
  - [ ] summary

### 8. Resource Cleanup

- [ ] Implement `src/three/disposeScene.js`.
- [ ] Dispose geometries.
- [ ] Dispose materials.
- [ ] Dispose textures.
- [ ] Remove old model from scene.
- [ ] Dispose renderer on component unmount.
- [ ] Remove resize listeners.
- [ ] Cancel animation frame.

### 9. Viewport Component Integration

- [ ] Implement `src/components/SceneViewport.jsx`.
- [ ] Mount Three.js renderer into React component.
- [ ] Initialize renderer once.
- [ ] Load model when file or model URL changes.
- [ ] Emit detected parts to parent/store.
- [ ] Apply incoming edit operations.
- [ ] Show loading state.
- [ ] Show error state.
- [ ] Clean up on unmount.

### 10. Export Helper

- [ ] Implement `src/three/exportGlb.js` only if MVP time allows.
- [ ] Export current customized scene with `GLTFExporter`.
- [ ] Confirm exported GLB preserves visible material colour changes.
- [ ] If export is risky, defer and document as V2.

---

## Recommended Implementation Order

1. `initRenderer.js`
2. `cameraControls.js`
3. `loadGlbModel.js`
4. `sceneTraversal.js`
5. `partRegistry.js`
6. `materialUtils.js`
7. `applyEditOperations.js`
8. `disposeScene.js`
9. `SceneViewport.jsx`
10. `exportGlb.js`

---

## Suggested Public APIs

### `initRenderer.js`

```js
export function initRenderer(container, options) {
  return {
    scene,
    camera,
    renderer,
    controls,
    modelGroup,
    resize,
    resetView,
    dispose
  };
}
```

### `loadGlbModel.js`

```js
export async function loadGlbModel(source, modelGroup) {
  return {
    root,
    animations,
    metadata
  };
}
```

### `sceneTraversal.js`

```js
export function collectMeshMetadata(root) {
  return [
    {
      id,
      name,
      meshName,
      materialName,
      color,
      position,
      rotation,
      scale
    }
  ];
}
```

### `partRegistry.js`

```js
export function createPartRegistry(root) {
  return {
    listParts,
    getPart,
    hasPart,
    resetPart,
    resetAll
  };
}
```

### `applyEditOperations.js`

```js
export function applyEditOperations(registry, operations) {
  return {
    applied,
    failed,
    summary
  };
}
```

---

## MVP Supported Operations

| Operation | Branch Priority | Notes |
|---|---|---|
| `set_material_color` | Must have | Needed for prompt demo: `make cushion blue` |
| `set_visibility` | Must have | Supports hide/remove style prompts |
| `set_scale` | Must have | Supports simple size customization |
| `set_position` | Should have | Useful for small adjustments |
| `set_rotation` | Should have | Useful for lamp/chair part tweaks |
| `reset_part` | Must have | Required for undo/reset safety |
| `duplicate_part` | Could have | Defer if time is tight |
| `add_primitive` | Could have | Defer unless demo needs it |

---

## Integration Contract With AI Branch

Renderer expects operations in this shape:

```json
{
  "operations": [
    {
      "op": "set_material_color",
      "target": "cushion",
      "color": "#2563EB"
    }
  ],
  "summary": "Changed the cushion to blue."
}
```

Renderer returns operation result in this shape:

```json
{
  "applied": [
    {
      "op": "set_material_color",
      "target": "cushion"
    }
  ],
  "failed": [],
  "summary": "Applied 1 operation."
}
```

---

## Test Checklist

- [ ] Load a valid GLB file.
- [ ] Fail gracefully on invalid file.
- [ ] Detect named mesh parts.
- [ ] Preserve independent materials when original GLB uses shared material.
- [ ] Change one part colour without changing unrelated parts.
- [ ] Hide and show one part.
- [ ] Scale one part safely.
- [ ] Reset one part to original state.
- [ ] Reset full model to original state.
- [ ] Load a second model after the first without duplicate objects.
- [ ] Resize browser without distorting the viewport.
- [ ] Orbit, zoom, pan, and reset view work after model load.
- [ ] Dispose renderer cleanly on unmount.

---

## Demo Target

The renderer branch should be demoable even before backend integration:

```text
1. Load prepared chair.glb.
2. Detect parts: seat, backrest, legs, cushion.
3. Apply mock operation: make cushion blue.
4. Apply mock operation: hide backrest.
5. Reset model.
```

---

## Notes

- Do not execute AI-generated code.
- Do not try to recreate Blender modelling tools.
- Treat Blender-exported GLB as the source asset.
- Treat Three.js as the browser preview and controlled customization layer.
- Keep all operations non-destructive so variants can be reset or replayed later.
