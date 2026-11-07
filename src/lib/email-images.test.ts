import { describe, expect, it, vi } from "vitest";
import { hostInlineImages, trackingTagger } from "./email-images";

function fakeAdmin() {
  const upload = vi.fn().mockResolvedValue({ error: null });
  const admin = {
    storage: {
      from: () => ({
        upload,
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/event-media/${path}` } }),
      }),
    },
  };
  return { admin: admin as never, upload };
}

describe("hostInlineImages", () => {
  it("uploads pasted pictures and points the email at them (batch sends drop attachments)", async () => {
    const { admin, upload } = fakeAdmin();
    const html = '<p>Hi</p><img src="data:image/png;base64,aGVsbG8=" alt="Poster" style="width:55%;max-width:100%;height:auto;"><p>Bye</p>';
    const out = await hostInlineImages(admin, html, "platform/campaigns/c1");
    expect(upload).toHaveBeenCalledWith("platform/campaigns/c1/image-1.png", expect.any(Buffer), { upsert: true, contentType: "image/png" });
    expect(out).toBe('<p>Hi</p><img src="https://cdn.test/event-media/platform/campaigns/c1/image-1.png" alt="Poster" style="width:55%;max-width:100%;height:auto;"><p>Bye</p>');
    expect(out).not.toContain("data:image");
  });

  it("keeps the picture's alignment and link", async () => {
    const { admin } = fakeAdmin();
    const out = await hostInlineImages(
      admin,
      '<img src="data:image/png;base64,aGk=" alt="" data-align="center" data-href="https://eventbuddy.africa/e" style="width:55%;">',
      "p"
    );
    expect(out).toBe('<img src="https://cdn.test/event-media/p/image-1.png" alt="" data-align="center" data-href="https://eventbuddy.africa/e" style="width:55%;">');
  });

  it("leaves out a picture that can't be uploaded rather than sending it broken", async () => {
    const { admin, upload } = fakeAdmin();
    upload.mockResolvedValueOnce({ error: { message: "nope" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await hostInlineImages(admin, '<img src="data:image/jpeg;base64,aGk=" alt="">text', "p");
    expect(out).toBe("text");
  });

  it("does nothing when there are no pasted pictures", async () => {
    const { admin, upload } = fakeAdmin();
    const html = '<img src="https://example.com/a.png" alt="">';
    expect(await hostInlineImages(admin, html, "p")).toBe(html);
    expect(upload).not.toHaveBeenCalled();
  });
});

describe("trackingTagger", () => {
  const tag = trackingTagger({ source: "email", campaign: "eb-123" });

  it("tags links to eventbuddy with the campaign, keeping their own parameters", () => {
    expect(tag.url("https://eventbuddy.africa/lagos-tech-week?x=1")).toBe("https://eventbuddy.africa/lagos-tech-week?x=1&utm_source=email&utm_medium=email&utm_campaign=eb-123");
    expect(tag.html('<a href="https://www.eventbuddy.africa/e">Tickets</a>')).toBe(
      '<a href="https://www.eventbuddy.africa/e?utm_source=email&amp;utm_medium=email&amp;utm_campaign=eb-123">Tickets</a>'
    );
  });

  it("leaves other websites and already-tagged links alone", () => {
    expect(tag.url("https://instagram.com/eventbuddy")).toBe("https://instagram.com/eventbuddy");
    expect(tag.url("https://eventbuddy.africa/e?utm_source=whatsapp")).toBe("https://eventbuddy.africa/e?utm_source=whatsapp");
  });
});
