import { validateOperations } from '../schemas/editOperationSchema.js';

function cloneScene(scene) {
  return {
    components: Array.isArray(scene?.components)
      ? scene.components.map((component) => ({
          ...component,
          transform: {
            position: component.transform?.position ?? [0, 0, 0],
            rotation: component.transform?.rotation ?? [0, 0, 0],
            scale: component.transform?.scale ?? [1, 1, 1]
          },
          material: { ...(component.material ?? {}) }
        }))
      : []
  };
}

function applyOperationToComponent(component, operation) {
  const nextComponent = {
    ...component,
    transform: { ...component.transform },
    material: { ...component.material }
  };

  switch (operation.op) {
    case 'setColor':
      nextComponent.material.color = operation.payload.color ?? nextComponent.material.color ?? '#cccccc';
      break;
    case 'setMaterial':
      nextComponent.material.type = operation.payload.type ?? nextComponent.material.type ?? 'standard';
      break;
    case 'setVisibility':
      nextComponent.visible = Boolean(operation.payload.visible);
      break;
    case 'setPosition':
      nextComponent.transform.position = Array.isArray(operation.payload.position)
        ? operation.payload.position.slice(0, 3)
        : nextComponent.transform.position;
      break;
    case 'setScale':
      nextComponent.transform.scale = Array.isArray(operation.payload.scale)
        ? operation.payload.scale.slice(0, 3)
        : nextComponent.transform.scale;
      break;
    case 'setRotation':
      nextComponent.transform.rotation = Array.isArray(operation.payload.rotation)
        ? operation.payload.rotation.slice(0, 3)
        : nextComponent.transform.rotation;
      break;
    default:
      break;
  }

  return nextComponent;
}

export function applyEditOperations(scene, operations, options = {}) {
  const safeScene = cloneScene(scene);
  const knownPartIds = safeScene.components.map((component) => component.id);
  const registryComponents = Array.isArray(options.components) ? options.components : [];
  const validationPartIds = registryComponents.length
    ? Array.from(new Set([...knownPartIds, ...registryComponents.map((component) => component.id)]))
    : knownPartIds;
  const validatedOperations = validateOperations(operations, validationPartIds, registryComponents);

  const updatedComponents = safeScene.components.map((component) => {
    const componentOperations = validatedOperations.filter((operation) => operation.targetId === component.id);
    return componentOperations.reduce((accumulator, operation) => applyOperationToComponent(accumulator, operation), component);
  });

  return {
    ...safeScene,
    components: updatedComponents
  };
}
