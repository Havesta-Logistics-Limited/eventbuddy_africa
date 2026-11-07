/** Rewrites every embedded data:image/* <img> into a cid: reference and returns
 *  the matching Resend attachment for it — data: image URLs don't render in most
 *  email clients (Gmail, Outlook strip or block them), the same reason the
 *  registration QR email already uses this exact cid:/attachments pattern
 *  instead of an inline data URL. Remote https:// images pass through
 *  untouched (already real, loadable URLs). */
export function extractInlineImages(html: string): { html: string; attachments: { filename: string; content: string; contentId: string }[] } {
  let count = 0;
  const attachments: { filename: string; content: string; contentId: string }[] = [];
  const rewritten = html.replace(/<img\s+[^>]*src="data:image\/([a-zA-Z0-9.+-]+);base64,([^"]+)"[^>]*>/g, (full, subtype: string, base64: string) => {
    count += 1;
    const cid = `blast-img-${count}`;
    attachments.push({ filename: `image-${count}.${subtype.split("+")[0]}`, content: base64, contentId: cid });
    const altMatch = /alt="([^"]*)"/.exec(full);
    const alt = altMatch ? altMatch[1] : "";
    const styleMatch = /style="([^"]*)"/.exec(full);
    const style = styleMatch ? styleMatch[1] : "max-width:100%;";
    return `<img src="cid:${cid}" alt="${alt}" style="${style}">`;
  });
  return { html: rewritten, attachments };
}
