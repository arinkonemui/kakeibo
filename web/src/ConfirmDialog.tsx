import { useState } from "react";

const CLOSE_DURATION = 180;

interface Props {
  message: string;
  onOk: () => void;
  onCancel: () => void;
  onAlt?: () => void;
  okLabel?: string;
  cancelLabel?: string;
  altLabel?: string;
}

export function ConfirmDialog({
  message,
  onOk,
  onCancel,
  onAlt,
  okLabel = "OK",
  cancelLabel = "キャンセル",
  altLabel,
}: Props) {
  const [closing, setClosing] = useState(false);
  function close(cb: () => void) {
    setClosing(true);
    setTimeout(cb, CLOSE_DURATION);
  }
  return (
    <div className="modal-overlay" onClick={() => close(onCancel)}>
      <div
        className={`modal-content confirm-dialog${closing ? " closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="confirm-dialog-body">{message}</p>
        <div className="confirm-dialog-actions">
          <button className="btn-confirm-ok" onClick={() => close(onOk)}>
            {okLabel}
          </button>
          {onAlt && altLabel && (
            <button className="btn-confirm-alt" onClick={() => close(onAlt)}>
              {altLabel}
            </button>
          )}
          <button className="btn-confirm-cancel" onClick={() => close(onCancel)}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
