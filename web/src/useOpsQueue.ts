import { useCallback, useState } from "react";
import type { CreateEntryOp, SaveOps } from "./types";

interface OpsQueueState {
  creates: CreateEntryOp[];
  deleteIds: string[];
}

const EMPTY: OpsQueueState = { creates: [], deleteIds: [] };

export function useOpsQueue() {
  const [queue, setQueue] = useState<OpsQueueState>(EMPTY);

  const addEntry = useCallback((op: CreateEntryOp) => {
    // Assign a temporary client-side id so we can remove it before save
    const withId: CreateEntryOp = {
      ...op,
      entry_id: op.entry_id ?? crypto.randomUUID(),
    };
    setQueue((q) => ({ ...q, creates: [...q.creates, withId] }));
    return withId.entry_id!;
  }, []);

  const removeEntry = useCallback(
    (entryId: string, isLocalOnly: boolean) => {
      if (isLocalOnly) {
        // Entry was created in this session and not yet saved — just remove from creates
        setQueue((q) => ({
          ...q,
          creates: q.creates.filter((c) => c.entry_id !== entryId),
        }));
      } else {
        // Existing entry from server — mark for deletion
        setQueue((q) => ({
          ...q,
          deleteIds: [...q.deleteIds, entryId],
        }));
      }
    },
    [],
  );

  const isDirty = queue.creates.length > 0 || queue.deleteIds.length > 0;

  const buildSaveOps = useCallback((): SaveOps => {
    const ops: SaveOps = {};
    if (queue.creates.length > 0) ops.create_entries = queue.creates;
    if (queue.deleteIds.length > 0) ops.delete_entry_ids = queue.deleteIds;
    return ops;
  }, [queue]);

  const reset = useCallback(() => setQueue(EMPTY), []);

  const pendingCount = queue.creates.length + queue.deleteIds.length;

  return { queue, addEntry, removeEntry, isDirty, buildSaveOps, reset, pendingCount };
}
