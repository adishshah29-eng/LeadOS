/**
 * CSV cell encoding.
 *
 * Quotes every cell, and neutralises spreadsheet formula injection: a lead
 * can type "=HYPERLINK(...)" into a Meta form, and Excel or Sheets would run
 * it when the export is opened. Cells starting with = + - @ (or a tab / CR)
 * get a leading apostrophe so they are shown as text.
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}
