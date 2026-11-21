/**
 * Legacy Word .doc (OLE) best-effort text: printable UTF-16LE and 8-bit runs. Lossy by design
 * (formatting, tables and field codes are lost); the viewer labels it "best effort". Pure.
 */
export function scrapeDocText(bytes: Uint8Array, maxChars = 400_000): string {
  const runs: string[] = [];
  let total = 0;
  // UTF-16LE runs (Word 97+ stores most text this way).
  let cur = "";
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const code = bytes[i]! | (bytes[i + 1]! << 8);
    const ok = code === 9 || code === 10 || code === 13 || (code >= 32 && code < 0xd800 && code !== 0xfffd) || (code >= 0xe000 && code < 0xfff0);
    if (ok) cur += code === 13 ? "\n" : String.fromCharCode(code);
    else {
      if (cur.replace(/\s/g, "").length >= 8 && /[a-z]{3}/i.test(cur)) {
        runs.push(cur);
        total += cur.length;
        if (total > maxChars) break;
      }
      cur = "";
    }
  }
  if (cur.replace(/\s/g, "").length >= 8) runs.push(cur);
  let text = runs.join("\n");
  if (text.replace(/\s/g, "").length < 40) {
    // Older 8-bit documents.
    const ascii: string[] = [];
    let run = "";
    for (const b of bytes) {
      if (b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127)) run += b === 13 ? "\n" : String.fromCharCode(b);
      else {
        if (run.replace(/\s/g, "").length >= 8 && /[a-z]{3}/i.test(run)) ascii.push(run);
        run = "";
      }
    }
    if (run.replace(/\s/g, "").length >= 8) ascii.push(run);
    const asciiText = ascii.join("\n");
    if (asciiText.replace(/\s/g, "").length > text.replace(/\s/g, "").length) text = asciiText;
  }
  return text
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxChars);
}
