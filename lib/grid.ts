// Shared between app/api/submit (server-side grading) and the student
// page (client-side coloring of results), so it must stay free of any
// server-only imports.

export function isNumericMatch(a: unknown, b: unknown, tolerance = 0.01): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const na = parseFloat(a.replace(/\$/g, "").replace(/,/g, "").trim());
  const nb = parseFloat(b.replace(/\$/g, "").replace(/,/g, "").trim());
  if (Number.isNaN(na) || Number.isNaN(nb)) return false;
  return Math.abs(na - nb) <= tolerance;
}

export function gridCellKey(rowIndex: number, colIndex: number): string {
  return `${rowIndex}-${colIndex}`;
}
