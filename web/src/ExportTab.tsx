import { useRef, useState } from "react";
import {
  buildArchiveDataset,
  deriveMonthKey,
  downloadCsv,
  extractFixedRows,
  filterEntryRows,
  generateEntriesCsv,
  parseEntriesCsv,
} from "./csvUtils";
import type { FixedExpenseCsvRow } from "./csvUtils";
import { PdfPrintLayout } from "./PdfPrintLayout";
import type { EntryRow, FixedExpenseRow, MonthlyDataset } from "./types";

interface Props {
  /** 現在アプリで表示中の月（YYYY-MM） */
  monthKey: string;
  data: MonthlyDataset;
  /** ops 適用済みのエントリ一覧（CSV ダウンロード件数表示用） */
  localEntries: EntryRow[];
  /** アーカイブ表示中か否か（閉じるボタン表示切替） */
  archiveActive: boolean;
  /** アーカイブ読み込み完了コールバック（全月共通） */
  onLoadArchive: (dataset: MonthlyDataset, archMonthKey: string, fixedRows?: FixedExpenseCsvRow[]) => void;
  /** アーカイブ表示を終了する */
  onClearArchive: () => void;
  /** 固定費・収入アイテム一覧（CSV エクスポート用） */
  fxItems: FixedExpenseRow[];
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
  fxItems,
}: Props) {
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── CSV ダウンロード（明細 + 固定費・収入）──────────
  function handleDownload() {
    const csv = generateEntriesCsv(localEntries, data.categories, fxItems);
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
        const allRows = parseEntriesCsv(text);

        if (allRows.length === 0) {
          setArchiveError("データが含まれていません。");
          return;
        }

        const fixedRows = extractFixedRows(allRows);
        const entryRows = filterEntryRows(allRows);
        const archMonthKey = deriveMonthKey(entryRows);

        if (!archMonthKey) {
          if (fixedRows.length > 0) {
            setArchiveError(
              "明細データがないため月が特定できません（固定費・収入のみのCSVは復元できません）。",
            );
          } else {
            setArchiveError(
              "CSVの形式が正しくありません（日付列を確認してください）。",
            );
          }
          return;
        }

        const dataset = buildArchiveDataset(entryRows, archMonthKey);
        onLoadArchive(dataset, archMonthKey, fixedRows.length > 0 ? fixedRows : undefined);
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
      {/* PDF 出力 */}
      <section className="export-section">
        <h2 className="export-section-title">PDF出力</h2>
        <p className="export-desc">
          {monthLabel(monthKey)}の明細（1枚目）とグラフ・集計（2枚目）を
          <br />
          A4・2枚のPDFとして出力します。印刷ダイアログで「PDFとして保存」を選択してください。
        </p>
        <button
          className="btn-export-pdf"
          onClick={() => window.print()}
        >
          {monthLabel(monthKey)}のPDFを出力
        </button>
      </section>

      {/* CSV ダウンロード */}
      <section className="export-section">
        <h2 className="export-section-title">CSVダウンロード</h2>
        <p className="export-desc">
          {monthLabel(monthKey)}の明細（{localEntries.length}件）と固定費・収入（{fxItems.length}件）を
          CSV ファイルとして保存します。
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
          バナーの「DBへ反映」ボタンで実際のデータとして保存できます。固定費・収入も含まれている場合は同時に復元します。
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

      {/* 印刷専用レイアウト（@media print でのみ表示） */}
      <PdfPrintLayout
        monthKey={monthKey}
        data={data}
        localEntries={localEntries}
        fxExpenseItems={fxItems.filter((i) => i.entry_type === "expense")}
        fxIncomeItems={fxItems.filter((i) => i.entry_type === "income")}
      />
    </div>
  );
}
