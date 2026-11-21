/** RTF → plain text: control-word stripper with \uN unicode, \'hh hex, \par/\line/\tab and skipped destinations. Pure. */

const SKIP_DESTS = new Set([
  "fonttbl", "colortbl", "stylesheet", "info", "pict", "object", "header", "footer", "headerl", "headerr", "footerl", "footerr",
  "listtable", "listoverridetable", "rsidtbl", "generator", "xmlnstbl", "themedata", "colorschememapping", "datastore", "latentstyles",
  "fldinst", "filetbl", "revtbl", "pgdsctbl", "bkmkstart", "bkmkend", "mmathPr",
]);

export function rtfToText(rtf: string): string {
  if (!/^\s*\{\\rtf/.test(rtf)) throw new Error("Not an RTF document");
  const out: string[] = [];
  type Frame = { skip: boolean; uc: number };
  const stack: Frame[] = [{ skip: false, uc: 1 }];
  let i = 0;
  let pendingSkip = 0; // chars to skip after \uN
  const top = () => stack[stack.length - 1]!;
  while (i < rtf.length) {
    const c = rtf[i]!;
    if (c === "{") {
      stack.push({ ...top() });
      i++;
      if (rtf.startsWith("\\*", i)) {
        top().skip = true;
        i += 2;
      }
      continue;
    }
    if (c === "}") {
      if (stack.length > 1) stack.pop();
      i++;
      continue;
    }
    if (c === "\\") {
      const next = rtf[i + 1];
      if (next === undefined) break;
      if (next === "\\" || next === "{" || next === "}") {
        if (!top().skip) out.push(next);
        i += 2;
        continue;
      }
      if (next === "'") {
        const hex = rtf.slice(i + 2, i + 4);
        if (pendingSkip > 0) pendingSkip--;
        else if (!top().skip) out.push(String.fromCharCode(parseInt(hex, 16) || 32));
        i += 4;
        continue;
      }
      if (next === "~") {
        if (!top().skip) out.push("\u00a0");
        i += 2;
        continue;
      }
      if (next === "\n" || next === "\r") {
        if (!top().skip) out.push("\n");
        i += 2;
        continue;
      }
      const m = /^([a-zA-Z]{1,32})(-?\d{1,10})? ?/.exec(rtf.slice(i + 1, i + 50));
      if (!m) {
        i += 2;
        continue;
      }
      i += 1 + m[0].length;
      const word = m[1]!;
      const arg = m[2] !== undefined ? Number(m[2]) : undefined;
      if (SKIP_DESTS.has(word)) {
        top().skip = true;
        continue;
      }
      if (top().skip) continue;
      switch (word) {
        case "par":
        case "line":
        case "row":
        case "sect":
        case "page":
          out.push("\n");
          break;
        case "tab":
        case "cell":
          out.push("\t");
          break;
        case "emdash":
          out.push("—");
          break;
        case "endash":
          out.push("–");
          break;
        case "bullet":
          out.push("•");
          break;
        case "lquote":
          out.push("‘");
          break;
        case "rquote":
          out.push("’");
          break;
        case "ldblquote":
          out.push("“");
          break;
        case "rdblquote":
          out.push("”");
          break;
        case "uc":
          top().uc = arg ?? 1;
          break;
        case "u": {
          let code = arg ?? 0;
          if (code < 0) code += 65536;
          out.push(String.fromCharCode(code));
          pendingSkip = top().uc;
          break;
        }
      }
      continue;
    }
    if (c === "\r" || c === "\n") {
      i++;
      continue;
    }
    if (pendingSkip > 0) {
      pendingSkip--;
      i++;
      continue;
    }
    if (!top().skip) out.push(c);
    i++;
  }
  return out.join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
