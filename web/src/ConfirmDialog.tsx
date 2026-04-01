interface Props {
  message: string;
  onOk: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ message, onOk, onCancel }: Props) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-content confirm-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="confirm-dialog-body">{message}</p>
        <div className="confirm-dialog-actions">
          <button className="btn-confirm-ok" onClick={onOk}>
            OK
          </button>
          <button className="btn-confirm-cancel" onClick={onCancel}>
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
