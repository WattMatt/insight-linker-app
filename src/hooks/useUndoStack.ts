import { useState, useCallback } from 'react';

export type UndoAction = {
  type: 'delete' | 'add' | 'move' | 'status_change';
  pinId: string;
  previousData?: any;
  description: string;
  timestamp: number;
};

const MAX_UNDO_STACK = 10;

export const useUndoStack = () => {
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [pendingUndo, setPendingUndo] = useState<UndoAction | null>(null);

  const pushAction = useCallback((action: Omit<UndoAction, 'timestamp'>) => {
    const newAction: UndoAction = {
      ...action,
      timestamp: Date.now(),
    };
    
    setUndoStack((prev) => {
      const newStack = [newAction, ...prev].slice(0, MAX_UNDO_STACK);
      return newStack;
    });
    
    // Set as pending undo for toast
    setPendingUndo(newAction);
  }, []);

  const popAction = useCallback(() => {
    const [top, ...rest] = undoStack;
    setUndoStack(rest);
    setPendingUndo(null);
    return top;
  }, [undoStack]);

  const clearPendingUndo = useCallback(() => {
    setPendingUndo(null);
  }, []);

  const canUndo = undoStack.length > 0;

  return {
    undoStack,
    pendingUndo,
    pushAction,
    popAction,
    clearPendingUndo,
    canUndo,
  };
};
