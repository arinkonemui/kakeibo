import { useRef, useState } from "react";
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
  /** アーカイブ読み込み完了コールバック（全月共通） */
  onLoadArchive: (dataset: MonthlyDataset, archMonthKey: string) => void;
  /** アーカイブ表示を終了する */
  onClearArchive: () => void;
}

/** YYYY-MM → YYYY年MM月 */
function monthLabel(mk: string): string {
  const [y, m] = mk.split("-");
  return `${y}年${m}月`;
}

export function ExportTab({
  monthKey,
  data,
  localEntries,
  archiveActive,
  onLoadArchive,
  onClearArchive,
}: Props) {
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
    reader.onload = (ev) => {
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

        // パースのみ完了 → アーカイブ表示へ（存在チェックは「DBへ反映」押下時）
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
          読み込み後は月間・週間・集計タブで内容を確認できます（編集不可）。
          <br />
          バナーの「DBへ反映」ボタンで実際のデータとして保存できます。
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
            >
              CSVファイルを選択
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
