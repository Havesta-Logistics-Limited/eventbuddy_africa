import { describe, expect, it } from "vitest";
import { sanitizeRichTextHtml } from "./rich-text";

describe("sanitizeRichTextHtml", () => {
  it("keeps the editor's own markup", () => {
    expect(sanitizeRichTextHtml('<p>Hi <strong>there</strong> &amp; <a href="https://x.com">link</a></p>')).toBe(
      '<p>Hi <strong>there</strong> &amp; <a href="https://x.com" target="_blank" rel="noreferrer noopener">link</a></p>'
    );
  });

  it("can't be tricked into building a tag out of the text around a removed one", () => {
    const out = sanitizeRichTextHtml("<p>hi</p><<img>img src=x onerror=alert(1)>");
    expect(out).not.toMatch(/<img[^>]*onerror/i);
    expect(out).toContain("&lt;");
  });

  it("strips scripts and handlers", () => {
    const out = sanitizeRichTextHtml('<script>alert(1)</script><img src="https://a.com/x.png" onerror="alert(1)"><scr<script>ipt>alert(1)</script>');
    expect(out).not.toMatch(/<script|onerror|<scr/i);
  });

  it("keeps a picture's alignment as one of three fixed values", () => {
    const centred = sanitizeRichTextHtml('<img src="https://a.com/x.png" alt="" data-align="center" style="width: 75%; max-width:100%">');
    expect(centred).toBe('<img src="https://a.com/x.png" alt="" data-align="center" style="width:75%;max-width:100%;height:auto;display:block;margin-left:auto;margin-right:auto;">');
    expect(sanitizeRichTextHtml('<img src="https://a.com/x.png" data-align="right">')).toContain("margin-left:auto;margin-right:0;");
  });

  it("drops an alignment it doesn't know, and can't be used to inject anything", () => {
    const out = sanitizeRichTextHtml('<img src="https://a.com/x.png" data-align="center;position:fixed" onerror="x()">');
    expect(out).toBe('<img src="https://a.com/x.png" alt="" style="width:55%;max-width:100%;height:auto;">');
  });
});
