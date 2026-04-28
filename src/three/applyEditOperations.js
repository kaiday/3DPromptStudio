export function applyEditOperations(scene, operations) {
  const components = Array.isArray(scene?.components) ? scene.components : [];
  return {
    ...scene,
    components: components.map((component) => {
      const componentOperations = operations.filter((operation) => operation.targetId === component.id);
      return componentOperations.reduce((next, operation) => {
        switch (operation.op) {
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
