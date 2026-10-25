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
});
