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
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-content confirm-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="confirm-dialog-body">{message}</p>
        <div className="confirm-dialog-actions">
          <button className="btn-confirm-ok" onClick={onOk}>
            {okLabel}
          </button>
          {onAlt && altLabel && (
            <button className="btn-confirm-alt" onClick={onAlt}>
              {altLabel}
            </button>
          )}
          <button className="btn-confirm-cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
