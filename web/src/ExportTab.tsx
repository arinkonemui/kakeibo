import { useRef, useState } from "react";
import { fetchMonthlyDataset } from "./api";
import {
  buildArchiveDataset,
  deriveMonthKey,
  downloadCsv,
  generateEntriesCsv,
  parseEntriesCsv,
} from "./csvUtils";
import type { EntryRow, MonthlyDataset } from "./types";

interface Props {
  /** 現在アプリで表示中の月（YYYY-MM） */
  monthKey: string;
  data: MonthlyDataset;
  /** ops 適用済みのエントリ一覧（CSV ダウンロード件数表示用） */
  localEntries: EntryRow[];
  /** アーカイブ表示中か否か（閉じるボタン表示切替） */
  archiveActive: boolean;
  /** 過去月アーカイブ読み込み完了コールバック */
  onLoadArchive: (dataset: MonthlyDataset, archMonthKey: string) => void;
  /** 当月アーカイブ → ops キューへ取り込みコールバック */
  onImportCurrentMonth: (
    rows: import("./csvUtils").ArchiveRow[],
    archMonthKey: string,
  ) => void;
  /** アーカイブ表示を終了する */
  onClearArchive: () => void;
}

/** YYYY-MM → YYYY年MM月 */
function monthLabel(mk: string): string {
  const [y, m] = mk.split("-");
  return `${y}年${m}月`;
}

/** 今月の YYYY-MM */
function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function ExportTab({
  monthKey,
  data,
  localEntries,
  archiveActive,
  onLoadArchive,
  onImportCurrentMonth,
  onClearArchive,
}: Props) {
  const [checking, setChecking] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── CSV ダウンロード ──────────────────────────
  function handleDownload() {
    const csv = generateEntriesCsv(localEntries, data.categories);
    downloadCsv(csv, `osaifu_${monthKey}_entries.csv`);
  }

  // ── アーカイブ CSV 読み込み ────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setArchiveError(null);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = ev.target?.result as string;
        const rows = parseEntriesCsv(text);

        if (rows.length === 0) {
          setArchiveError("データが含まれていません。");
          return;
        }

        const archMonthKey = deriveMonthKey(rows);
        if (!archMonthKey) {
          setArchiveError(
            "CSVの形式が正しくありません（日付列を確認してください）。",
          );
          return;
        }

        // ④ 対象月のレコードが DB に存在するか確認
        setChecking(true);
        let existing: MonthlyDataset;
        try {
          existing = await fetchMonthlyDataset(archMonthKey);
        } catch {
          setArchiveError("データの確認中にエラーが発生しました。");
          setChecking(false);
          return;
        }
        setChecking(false);

        if (existing.month !== null || existing.entries.length > 0) {
          setArchiveError(
            `${monthLabel(archMonthKey)}のデータが既に存在するため読み込めません。` +
              `先にアプリからこの月のデータを削除してください。`,
          );
          return;
        }

        // ③ 当月 → ops キューへ取り込み（通常入力・保存が可能）
        if (archMonthKey === currentMonthKey()) {
          onImportCurrentMonth(rows, archMonthKey);
          return;
        }

        // ② 過去月 → アーカイブ表示モード（読み取り専用）
        const dataset = buildArchiveDataset(rows, archMonthKey);
        onLoadArchive(dataset, archMonthKey);
      } catch {
        setArchiveError("CSVの形式が正しくありません。");
      }
    };
    reader.onerror = () => {
      setArchiveError("ファイルの読み込みに失敗しました。");
    };
    reader.readAsText(file, "UTF-8");

    // 同じファイルを再選択できるように値をリセット
    e.target.value = "";
  }

  return (
    <div className="export-tab">
      {/* CSV ダウンロード */}
      <section className="export-section">
        <h2 className="export-section-title">CSVダウンロード</h2>
        <p className="export-desc">
          {monthLabel(monthKey)}の明細（{localEntries.length}件）を CSV
          ファイルとして保存します。
        </p>
        <button className="btn-export-csv" onClick={handleDownload}>
          {monthLabel(monthKey)}のCSVをダウンロード
        </button>
      </section>

      {/* アーカイブ CSV 読み込み */}
      <section className="export-section">
        <h2 className="export-section-title">アーカイブCSV 読み込み</h2>
        <p className="export-desc">
          以前にダウンロードした CSV を読み込みます。
          <br />
          <strong>過去月</strong>
          ：月間・週間・集計タブで閲覧のみ可能（編集・保存不可）
          <br />
          <strong>当月</strong>
          ：エントリを取り込み、通常通り編集・保存が可能
          <br />
          ※ 読み込む月のデータがアプリに残っている場合は取り込めません。
        </p>

        {archiveActive ? (
          <button className="btn-archive-close" onClick={onClearArchive}>
            アーカイブ表示を終了する
          </button>
        ) : (
          <>
            <button
              className="btn-export-archive"
              onClick={() => fileInputRef.current?.click()}
              disabled={checking}
            >
              {checking ? "確認中…" : "CSVファイルを選択"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
          </>
        )}

        {archiveError && <p className="export-error">{archiveError}</p>}
      </section>
    </div>
  );
}
