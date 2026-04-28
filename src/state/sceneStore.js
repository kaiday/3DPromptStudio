import { useMemo, useState } from 'react';

export function useSceneStore(initialWorkspace = null) {
  const [workspace, setWorkspace] = useState(initialWorkspace);

  const state = useMemo(
    () => ({
      workspace,
      scene: workspace?.scene ?? { components: [] },
      viewport: workspace?.viewport ?? {
        cameraPosition: [3, 2.2, 4],
        cameraTarget: [0, 0.8, 0],
        zoom: 1
      }
    }),
    [workspace]
  );

  return {
    ...state,
    setWorkspace
  };
}
