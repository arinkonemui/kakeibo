import type { CategoryRow, EntryRow, FixedExpenseRow, MonthlyDataset } from "./types";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

function weekdayLabel(dateStr: string): string {
  return WEEKDAYS[new Date(dateStr).getDay()] ?? "";
}

/** RFC 4180 準拠のフィールドエスケープ */
function escapeCsvField(v: string): string {
  if (/[",\r\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

// ──────────────────────────────────────────
// CSV エクスポート
// ──────────────────────────────────────────

/**
 * 明細エントリ配列から CSV 文字列を生成する（UTF-8 BOM 付き・CRLF 改行）。
 * 列: 日付,曜日,種別,カテゴリ,金額,メモ,支払方法
 * 並び: 日付 ASC → 同日は金額 DESC
 * fxItems を渡すと末尾に固定費・収入行を追記する（日付="固定費"、メモ=アイコンキー）。
 */
export function generateEntriesCsv(
  entries: EntryRow[],
  categories: CategoryRow[],
  fxItems?: FixedExpenseRow[],
): string {
  const catMap = new Map(categories.map((c) => [c.category_id, c.name]));

  const sorted = [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return b.amount - a.amount;
  });

  const header = "日付,曜日,種別,カテゴリ,金額,メモ,支払方法";
  const rows = sorted.map((e) => {
    const fields = [
      e.date,
      weekdayLabel(e.date),
      e.type === "expense" ? "支出" : "収入",
      catMap.get(e.category_id) ?? "",
      String(e.amount),
      e.memo ?? "",
      e.payment_method ?? "",
    ];
    return fields.map(escapeCsvField).join(",");
  });

  // 固定費・収入行を末尾に追記（日付="固定費" をマーカーとして使用）
  if (fxItems && fxItems.length > 0) {
    for (const item of fxItems) {
      const fields = [
        "固定費",
        "",
        item.entry_type === "income" ? "収入" : "固定費",
        item.name,
        String(item.amount),
        item.icon_key,
        "",
      ];
      rows.push(fields.map(escapeCsvField).join(","));
    }
  }

  // UTF-8 BOM + CRLF
  return "\uFEFF" + [header, ...rows].join("\r\n") + "\r\n";
}

/** CSV 文字列をブラウザでダウンロードさせる */
export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type WindowWithPicker = Window & {
  showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle>;
};

/**
 * File System Access API でファイル保存ダイアログを開き、CSV を保存する。
 * ユーザーがキャンセルした場合は false を返す（削除を中断できる）。
 * showSaveFilePicker 非対応ブラウザ（Firefox等）はアンカー方式にフォールバックし true を返す。
 */
export async function downloadCsvWithPicker(
  csv: string,
  filename: string,
): Promise<boolean> {
  try {
    if (typeof (window as unknown as WindowWithPicker).showSaveFilePicker === "function") {
      const handle = await (window as unknown as WindowWithPicker).showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: "CSV", accept: { "text/csv": [".csv"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
      await writable.close();
      return true;
    } else {
      downloadCsv(csv, filename);
      return true;
    }
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") return false;
    throw e;
  }
}

// ──────────────────────────────────────────
// CSV インポート（アーカイブ）
// ──────────────────────────────────────────

/** 固定費・収入行（CSV 内に埋め込まれる） */
export interface FixedExpenseCsvRow {
  entry_type: "expense" | "income";
  name: string;
  icon_key: string;
  amount: number;
}

/**
 * ArchiveRow[] から固定費・収入行を抽出する。
 * 固定費行は date === "固定費" のマーカーで識別する。
 */
export function extractFixedRows(rows: ArchiveRow[]): FixedExpenseCsvRow[] {
  return rows
    .filter((r) => r.date === "固定費")
    .map((r) => ({
      entry_type: r.type === "収入" ? "income" : "expense",
      name: r.categoryName,
      icon_key: r.memo || "custom",
      amount: r.amount,
    }));
}

/** 固定費マーカー行を除いた通常エントリ行のみ返す */
export function filterEntryRows(rows: ArchiveRow[]): ArchiveRow[] {
  return rows.filter((r) => r.date !== "固定費");
}

/** パース済みアーカイブ行（表示・変換用） */
export interface ArchiveRow {
  date: string;
  weekday: string;
  type: string;
  categoryName: string;
  amount: number;
  memo: string;
  paymentMethod: string;
}

/**
 * CSV テキスト → ArchiveRow[]
 * BOM を除去し、ヘッダ行をスキップする。
 */
export function parseEntriesCsv(csvText: string): ArchiveRow[] {
  const text = csvText.startsWith("\uFEFF") ? csvText.slice(1) : csvText;
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim() !== "");

  if (lines.length < 2) return [];

  return lines.slice(1).map((line) => {
    const fields = parseCsvLine(line);
    const amount = Number(fields[4] ?? "0");
    return {
      date: fields[0] ?? "",
      weekday: fields[1] ?? "",
      type: fields[2] ?? "",
      categoryName: fields[3] ?? "",
      amount: isNaN(amount) ? 0 : amount,
      memo: fields[5] ?? "",
      paymentMethod: fields[6] ?? "",
    };
  });
}

/**
 * ArchiveRow[] からエクスポート元の月（YYYY-MM）を導出する。
 * 全行を確認して最初に見つかった有効な日付から取得する。
 */
export function deriveMonthKey(rows: ArchiveRow[]): string | null {
  for (const row of rows) {
    const m = row.date.match(/^(\d{4}-\d{2})-\d{2}$/);
    if (m) return m[1]!;
  }
  return null;
}

/**
 * ArchiveRow[] を MonthlyDataset に変換する。
 * カテゴリは合成 ID（"arc-cat-N"）で生成。
 * ※ 当月インポート時は App 側で realCategories にマッピングするため
 *   category_id は display 用（過去月アーカイブ表示に使う）。
 */
export function buildArchiveDataset(
  rows: ArchiveRow[],
  monthKey: string,
): MonthlyDataset {
  const catNames = [...new Set(rows.map((r) => r.categoryName))];
  const categories: CategoryRow[] = catNames.map((name, i) => ({
    category_id: `arc-cat-${i}`,
    user_id: "",
    name,
    kind: "expense",
    is_active: 1,
    sort_order: i,
    created_at: "",
    updated_at: "",
  }));

  const catIdByName = new Map(categories.map((c) => [c.name, c.category_id]));

  const entries: EntryRow[] = rows.map((row, i) => ({
    entry_id: `arc-entry-${i}`,
    user_id: "",
    month_key: monthKey,
    date: row.date,
    type: row.type === "支出" ? "expense" : "income",
    amount: row.amount,
    category_id: catIdByName.get(row.categoryName) ?? "",
    memo: row.memo || null,
    payment_method: row.paymentMethod || null,
    created_at: "",
    updated_at: "",
  }));

  return {
    month: {
      user_id: "",
      month_key: monthKey,
      version: 0,
      monthly_budget: null,
      cutoff_type: "calendar",
      cutoff_day: null,
      updated_at: "",
    },
    categories,
    entries,
    daily_budgets: [],
  };
}

// ──────────────────────────────────────────
// RFC 4180 準拠の1行パーサ
// ──────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (line[i] === '"') {
      let field = "";
      i++;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          field += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++;
          break;
        } else {
          field += line[i++];
        }
      }
      fields.push(field);
      if (line[i] === ",") i++;
    } else {
      const end = line.indexOf(",", i);
      if (end === -1) {
        fields.push(line.slice(i));
        break;
      }
      fields.push(line.slice(i, end));
      i = end + 1;
    }
  }
  return fields;
}
