/** Copies text, working in in-app browsers (Instagram, WhatsApp) and other
 *  places where navigator.clipboard is missing or refuses: falls back to a
 *  hidden textarea + execCommand. Resolves when copied, rejects otherwise,
 *  like navigator.clipboard.writeText, so callers only say "Copied" when it
 *  really was (pre-launch audit, 2026-10-07). */
export async function copyText(text: string): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    /* fall through to the legacy path */
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "-1000px";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  ta.remove();
  if (!ok) throw new Error("copy failed");
}
