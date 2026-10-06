/** Browser-only: prints one attendee's check-in QR as a clean white badge
 *  (event, name, ticket, QR, reference ID) through a hidden iframe, so the app
 *  page itself never changes and nothing dark reaches the printer. */
export type QrBadge = { qrDataUrl: string; name: string; referenceId: string; eventName: string; ticketName?: string; dateLine?: string };

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function qrBadgeHtml(b: QrBadge): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(b.name)} · ${esc(b.referenceId)}</title>
<style>
  @page { size: auto; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #fff; color: #170821; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .badge { width: 90mm; margin: 0 auto; border: 1.5px solid #e6dcea; border-radius: 6mm; overflow: hidden; text-align: center; page-break-inside: avoid; }
  .band { padding: 5mm 6mm 4mm; background: linear-gradient(135deg, #ff5fd8, #b0158f); color: #fff; }
  .event { margin: 0; font-size: 13pt; font-weight: 700; line-height: 1.25; }
  .date { margin: 1.5mm 0 0; font-size: 8.5pt; opacity: 0.9; }
  .body { padding: 6mm 6mm 7mm; }
  .name { margin: 0; font-size: 18pt; font-weight: 700; line-height: 1.15; overflow-wrap: anywhere; }
  .ticket { display: inline-block; margin-top: 2.5mm; padding: 1mm 3.5mm; border-radius: 99mm; background: #fbe7f8; color: #a3127f; font-size: 9pt; font-weight: 700; }
  .qr { display: block; width: 58mm; height: 58mm; margin: 5mm auto 3mm; image-rendering: pixelated; }
  .ref { margin: 0; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 14pt; font-weight: 700; letter-spacing: 0.12em; }
  .hint { margin: 1.5mm 0 0; font-size: 7.5pt; color: #6b5d73; }
</style></head><body>
<div class="badge">
  <div class="band"><p class="event">${esc(b.eventName)}</p>${b.dateLine ? `<p class="date">${esc(b.dateLine)}</p>` : ""}</div>
  <div class="body">
    <p class="name">${esc(b.name)}</p>
    ${b.ticketName ? `<span class="ticket">${esc(b.ticketName)}</span>` : ""}
    <img class="qr" src="${b.qrDataUrl}" alt="">
    <p class="ref">${esc(b.referenceId)}</p>
    <p class="hint">Show this code at the entrance</p>
  </div>
</div>
</body></html>`;
}

export function printQrBadge(b: QrBadge): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(qrBadgeHtml(b));
  doc.close();
  const img = doc.querySelector("img");
  const go = () => {
    win.focus();
    win.print();
    // give the print dialog time to take its snapshot before tearing down
    setTimeout(() => frame.remove(), 1000);
  };
  if (img && !img.complete) img.addEventListener("load", go, { once: true });
  else go();
}
