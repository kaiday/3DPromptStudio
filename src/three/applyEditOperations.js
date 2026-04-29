export function applyEditOperations(scene, operations) {
  const components = Array.isArray(scene?.components) ? scene.components : [];
  return {
    ...scene,
    components: components.map((component) => {
      const componentOperations = operations.filter((operation) => getOperationTargetId(operation) === component.id);
      return componentOperations.reduce((next, operation) => {
        switch (operation.type ?? operation.op) {
          case 'setColor':
            return {
              ...next,
              material: {
                ...(next.material ?? {}),
                color: operation.payload.color ?? next.material?.color
              }
            };
          case 'setVisibility':
            return { ...next, visible: Boolean(operation.payload.visible) };
          default:
            return next;
        }
      }, component);
    })
  };
}

function getOperationTargetId(operation) {
  return (
    operation.target?.componentId ??
    operation.target?.partId ??
    operation.targetId ??
    null
  );
}
