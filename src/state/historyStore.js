import { useMemo } from 'react';

export function useHistoryStore(workspace) {
  return useMemo(
    () => ({
      promptHistory: workspace?.promptHistory ?? [],
      variantHistory: workspace?.variantHistory ?? [],
      canUndo: Boolean(workspace?.history?.past?.length),
      canRedo: Boolean(workspace?.history?.future?.length)
    }),
    [workspace]
  );
}
