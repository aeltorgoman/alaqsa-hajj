// بديلُ `print.output.ts` للتحقّق في Node: يلتقط الـHTML بدل فتح نافذة الطباعة.
export type PrintOptions = { waitForImages?: boolean; landscape?: boolean };
export function printInPage(html: string, _options: PrintOptions = {}) {
  void _options;
  ((globalThis as { __printed?: string[] }).__printed ??= []).push(html);
}
export function downloadPDF(_html: string, _filename: string) { void _html; void _filename; }
