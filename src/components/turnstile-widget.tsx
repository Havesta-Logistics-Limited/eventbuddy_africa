"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = SCRIPT_SRC;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => {
        scriptPromise = null;
        reject(new Error("Couldn't load the human check."));
      };
      document.head.appendChild(el);
    });
  }
  return scriptPromise;
}

export type TurnstileHandle = { reset: () => void };

/** The "I'm human" check (Cloudflare Turnstile). Renders nothing when no site
 *  key is configured. A token is single-use: call reset() after a failed submit. */
export const TurnstileWidget = forwardRef<TurnstileHandle, { onToken: (token: string) => void; theme?: "light" | "dark" | "auto" }>(
  function TurnstileWidget({ onToken, theme = "auto" }, ref) {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    const box = useRef<HTMLDivElement>(null);
    const widgetId = useRef<string | null>(null);
    const onTokenRef = useRef(onToken);
    onTokenRef.current = onToken;

    useImperativeHandle(ref, () => ({
      reset() {
        onTokenRef.current("");
        if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
      },
    }));

    useEffect(() => {
      if (!siteKey || !box.current) return;
      let cancelled = false;
      loadScript()
        .then(() => {
          if (cancelled || !box.current || !window.turnstile) return;
          widgetId.current = window.turnstile.render(box.current, {
            sitekey: siteKey,
            theme,
            callback: (t: string) => onTokenRef.current(t),
            "expired-callback": () => onTokenRef.current(""),
            "error-callback": () => onTokenRef.current(""),
          });
        })
        .catch(() => {});
      return () => {
        cancelled = true;
        if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      };
    }, [siteKey, theme]);

    if (!siteKey) return null;
    return <div ref={box} className="min-h-[65px]" />;
  }
);

export const turnstileConfigured = () => !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
