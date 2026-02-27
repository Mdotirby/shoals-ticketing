"use client";

import Script from "next/script";

type Props = {
  metaPixelId?: string | null;
  googleAdsTagId?: string | null;
};

/**
 * Injects Meta (Facebook) Pixel and Google Ads remarketing tag.
 * These are configured per-venue in the venues table.
 * Set meta_pixel_id and google_ads_tag_id in venue settings.
 */
export default function TrackingPixels({ metaPixelId, googleAdsTagId }: Props) {
  return (
    <>
      {/* Meta (Facebook) Pixel */}
      {metaPixelId && (
        <>
          <Script id="meta-pixel" strategy="afterInteractive">
            {`
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${metaPixelId}');
              fbq('track', 'PageView');
            `}
          </Script>
          <noscript>
            <img
              height="1"
              width="1"
              style={{ display: "none" }}
              src={`https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1`}
              alt=""
            />
          </noscript>
        </>
      )}

      {/* Google Ads Remarketing Tag */}
      {googleAdsTagId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${googleAdsTagId}`}
            strategy="afterInteractive"
          />
          <Script id="google-ads-tag" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${googleAdsTagId}');
            `}
          </Script>
        </>
      )}
    </>
  );
}
