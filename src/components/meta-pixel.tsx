"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/** eventbuddy's Meta Pixel (Facebook/Instagram ads): loads on every page and
 *  sends a PageView per page, including in-app navigations. Off until
 *  NEXT_PUBLIC_META_PIXEL_ID is set. Event-page conversions are sent from
 *  register-page-content via src/lib/meta-pixel.ts. */
export function MetaPixel({ nonce }: { nonce?: string }) {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (!pixelId) return;
    // the first PageView is sent by the loader below
    if (first.current) {
      first.current = false;
      return;
    }
    (window as unknown as { fbq?: (...a: unknown[]) => void }).fbq?.("track", "PageView");
  }, [pathname, pixelId]);

  if (!pixelId || !/^\d{5,20}$/.test(pixelId)) return null;
  return (
    <Script id="meta-pixel" strategy="afterInteractive" nonce={nonce}>
      {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');fbq('track','PageView');`}
    </Script>
  );
}
