// Adapted from pi-code-previews; see THIRD_PARTY_NOTICES.md.
export type ParsedDiffLine = { kind: "+" | "-" | " "; lineNumber: string; content: string; anchored?: boolean };
export type AddedDiffLine = ParsedDiffLine & { kind: "+" };
export type RemovedDiffLine = ParsedDiffLine & { kind: "-" };

export function diffLineNumberWidth(lines: Array<ParsedDiffLine | null>): number {
  return lines.reduce((width, line) => Math.max(width, normalizedDiffLineNumber(line).length), 0);
}

export function formatDiffLineNumber(lineNumber: string, width: number): string {
  return lineNumber.trim().padStart(width, " ");
}

function normalizedDiffLineNumber(line: ParsedDiffLine | null): string {
  return line?.lineNumber.trim() ?? "";
}

export function parseAnchorLine(line: string): { label: string; content: string; position: number | undefined } | null {
  const match = /^(?:(\d+)#)?([A-Za-z0-9]{3}| {3})│(.*)$/.exec(line);
  if (!match) return null;
  const position = match[1] === undefined ? undefined : Number(match[1]);
  if (position !== undefined && (!Number.isSafeInteger(position) || position < 1)) return null;
  return { label: match[1] ?? match[2]!, content: match[3]!, position };
}

export function parseDiffLine(line: string): ParsedDiffLine | null {
  const kind = line[0];
  const anchor = parseAnchorLine(line.slice(1));
  if (anchor && (kind === "+" || kind === "-" || kind === " ")) {
    return { kind, lineNumber: anchor.label, content: anchor.content, anchored: true };
  }
  const numbered = line.match(/^([+\- ])(\s*\d+)\s(.*)$/);
  if (numbered) {
    const [, kind, lineNumber, content] = numbered;
    if (
      (kind !== "+" && kind !== "-" && kind !== " ") ||
      lineNumber === undefined ||
      content === undefined
    )
      return null;
    return { kind, lineNumber, content };
  }

  if (line.startsWith("+++") || line.startsWith("---")) return null;
  const prefix = line[0];
  if (prefix !== "+" && prefix !== "-" && prefix !== " ") return null;
  return { kind: prefix, lineNumber: "", content: line.slice(1) };
}

export function isAddedDiffLine(line: ParsedDiffLine | null): line is AddedDiffLine {
  return line?.kind === "+";
}

export function isRemovedDiffLine(line: ParsedDiffLine | null): line is RemovedDiffLine {
  return line?.kind === "-";
}
