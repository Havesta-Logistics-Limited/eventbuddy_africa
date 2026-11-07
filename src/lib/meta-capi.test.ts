import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { sendMetaServerEvent, metaTrackingFromRequest } from "./meta-capi";

const sha = (v: string) => createHash("sha256").update(v).digest("hex");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("sendMetaServerEvent", () => {
  it("does nothing until the Pixel ID and access token are set", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "");
    await sendMetaServerEvent({ eventName: "Purchase", eventId: "ref-1" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the sale with hashed buyer details and the payment reference as event_id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "123456789");
    vi.stubEnv("META_CAPI_ACCESS_TOKEN", "token");
    await sendMetaServerEvent({
      eventName: "Purchase",
      eventId: "tixpay_abc",
      value: 5250,
      currency: "NGN",
      email: " Ada@Example.com ",
      phone: "+2348012345678",
      tracking: { fbp: "fb.1.1.2", ip: "1.2.3.4", ua: "UA" },
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/123456789/events");
    const event = JSON.parse(init.body).data[0];
    expect(event.event_id).toBe("tixpay_abc");
    expect(event.custom_data).toMatchObject({ value: 5250, currency: "NGN" });
    expect(event.user_data.em).toEqual([sha("ada@example.com")]);
    expect(event.user_data.ph).toEqual([sha("2348012345678")]);
    expect(event.user_data.fbp).toBe("fb.1.1.2");
    expect(JSON.stringify(event)).not.toContain("Ada@Example.com");
  });

  it("never throws when Meta is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "123456789");
    vi.stubEnv("META_CAPI_ACCESS_TOKEN", "token");
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendMetaServerEvent({ eventName: "Purchase", eventId: "x" })).resolves.toBeUndefined();
  });
});

describe("metaTrackingFromRequest", () => {
  it("reads the Meta cookies, IP and browser", () => {
    const req = new Request("https://eventbuddy.africa/api/x", {
      headers: { cookie: "a=1; _fbp=fb.1.111.222; _fbc=fb.1.111.abc", "x-forwarded-for": "9.9.9.9, 10.0.0.1", "user-agent": "Phone" },
    });
    expect(metaTrackingFromRequest(req, "https://eventbuddy.africa/e")).toEqual({ fbp: "fb.1.111.222", fbc: "fb.1.111.abc", ip: "9.9.9.9", ua: "Phone", url: "https://eventbuddy.africa/e" });
  });
});
