import { useState, useCallback } from "react";

const CLOSE_DURATION = 180;

/**
 * Adds a closing animation before calling the real onClose.
 * Returns `closing` (boolean to add "closing" CSS class) and
 * `handleClose` (call instead of onClose directly).
 */
export function useModalClose(onClose: () => void) {
  const [closing, setClosing] = useState(false);
  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, CLOSE_DURATION);
  }, [onClose]);
  return { closing, handleClose };
}
