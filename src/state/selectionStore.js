import { useState } from 'react';

export function useSelectionStore(initialPartId = null) {
  const [selectedPartId, setSelectedPartId] = useState(initialPartId);

  return {
    selectedPartId,
    setSelectedPartId
  };
}
