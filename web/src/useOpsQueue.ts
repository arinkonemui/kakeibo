import { useCallback, useState } from "react";
import type { CreateEntryOp, SaveOps, UpdateEntryOp } from "./types";

interface OpsQueueState {
  creates: CreateEntryOp[];
  updates: UpdateEntryOp[];
  deleteIds: string[];
}

const EMPTY: OpsQueueState = { creates: [], updates: [], deleteIds: [] };

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
        // Also remove from updates if it was queued for update
        setQueue((q) => ({
          ...q,
          updates: q.updates.filter((u) => u.entry_id !== entryId),
          deleteIds: [...q.deleteIds, entryId],
        }));
      }
    },
    [],
  );

  const updateEntry = useCallback(
    (op: UpdateEntryOp) => {
      setQueue((q) => {
        // If the entry is a local create, modify the create directly
        const localCreate = q.creates.find((c) => c.entry_id === op.entry_id);
        if (localCreate) {
          return {
            ...q,
            creates: q.creates.map((c) =>
              c.entry_id === op.entry_id
                ? {
                    ...c,
                    date: op.date,
                    type: op.type,
                    amount: op.amount,
                    category_id: op.category_id,
                    memo: op.memo,
                    payment_method: op.payment_method,
                  }
                : c,
            ),
          };
        }
        // Server entry — add/replace in updates queue
        return {
          ...q,
          updates: [
            ...q.updates.filter((u) => u.entry_id !== op.entry_id),
            op,
          ],
        };
      });
    },
    [],
  );

  const isDirty =
    queue.creates.length > 0 ||
    queue.updates.length > 0 ||
    queue.deleteIds.length > 0;

  const buildSaveOps = useCallback((): SaveOps => {
    const ops: SaveOps = {};
    if (queue.creates.length > 0) ops.create_entries = queue.creates;
    if (queue.updates.length > 0) ops.update_entries = queue.updates;
    if (queue.deleteIds.length > 0) ops.delete_entry_ids = queue.deleteIds;
    return ops;
  }, [queue]);

  const reset = useCallback(() => setQueue(EMPTY), []);

  const pendingCount =
    queue.creates.length + queue.updates.length + queue.deleteIds.length;

  return {
    queue,
    addEntry,
    removeEntry,
    updateEntry,
    isDirty,
    buildSaveOps,
    reset,
    pendingCount,
  };
}
