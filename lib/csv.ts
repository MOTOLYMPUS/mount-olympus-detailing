// ─────────────────────────────────────────────────────────────────────────────
// CSV serialisation, RFC 4180.
//
// Lives here rather than inside app/api/reports/route.ts for two reasons: an
// App Router route file may only export HTTP handlers and framework config
// keys, and — more usefully — escaping is the part of an export worth testing
// on its own, away from a request.
//
// THE FOUR RULES, each of which is routinely got wrong:
//   1. A field containing a comma, a double quote, CR or LF is wrapped in "…".
//   2. An internal double quote is DOUBLED (""), never backslash-escaped.
//      Backslash escaping is a MySQL convention and Excel does not honour it.
//   3. Rows end with CRLF, which is what the spec says and what Excel expects.
//   4. A UTF-8 BOM leads the document. Without it, Excel on Windows decodes the
//      file as the system codepage and an accented customer name arrives as
//      mojibake — the single most common complaint about exported CSV.
//
// FORMULA INJECTION. Excel and Google Sheets treat a cell beginning =, +, - or
// @ as a FORMULA. A customer who names their vehicle `=HYPERLINK("http://…")`
// has planted code that runs in the bookkeeper's spreadsheet — a real and
// exploited attack class, not a theoretical one. Such fields are prefixed with
// an apostrophe, which every spreadsheet reads as "the rest of this is text".
// ─────────────────────────────────────────────────────────────────────────────

const NEEDS_QUOTING = /[",\r\n]/;

/** Leading characters a spreadsheet would interpret as the start of a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';

  let s = String(value);

  // Neutralise before deciding about quoting, so the added apostrophe ends up
  // inside the quotes when quoting turns out to be necessary.
  if (FORMULA_START.test(s)) s = `'${s}`;

  if (!NEEDS_QUOTING.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function csvRow(cells: unknown[]): string {
  return cells.map(csvField).join(',');
}

/** A complete document: BOM, header row, data rows, CRLF throughout. */
export function csvDocument(header: string[], rows: unknown[][]): string {
  return `﻿${[csvRow(header), ...rows.map(csvRow)].join('\r\n')}\r\n`;
}
