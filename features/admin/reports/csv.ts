type Cell = string | number | null | undefined;

/**
 * Rows as a CSV file that opens cleanly in Excel and Google Sheets: a UTF-8 byte-order mark
 * (so ₱ and accents survive), CRLF line ends, and quoting where needed. Text that a spreadsheet
 * would read as a formula (=, +, -, @) gets a leading apostrophe; numbers stay numbers.
 */
export function toCsv(rows: Cell[][]) {
  const cell = (v: Cell) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
    const text = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return "\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function csvResponse(filename: string, rows: Cell[][]) {
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
