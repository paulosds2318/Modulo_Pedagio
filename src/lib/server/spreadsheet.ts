import type ExcelJS from "exceljs";

/** Evita que o Excel interprete o texto exportado como fórmula (=, +, -, @ no início). */
export function safeText(value: unknown) {
  const text = value == null ? "" : String(value);
  return /^[\t\r ]*[=+@-]/.test(text) ? `'${text}` : text;
}

/** Cabeçalho vermelho Foco, congelado e com filtro, como nos relatórios da Conciliação DMA. */
export function styleHeader(sheet: ExcelJS.Worksheet, row = 1) {
  sheet.views = [{ state: "frozen", ySplit: row }];
  sheet.autoFilter = { from: { row, column: 1 }, to: { row, column: sheet.columnCount } };
  sheet.getRow(row).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(row).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF20000" } };
}
