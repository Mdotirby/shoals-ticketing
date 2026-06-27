"use client";

import Script from "next/script";

type Props = {
  metaPixelId?: string | null;
  googleAdsTagId?: string | null;
};

/**
 * Injects Meta (Facebook) Pixel, Google Ads remarketing tag, and Snapchat Pixel.
 * Meta and Google are configured per-venue in the venues table.
 * Set meta_pixel_id and google_ads_tag_id in venue settings.
 * Snapchat Pixel is site-wide.
 */
export default function TrackingPixels({ metaPixelId, googleAdsTagId }: Props) {
  return (
    <>
      {/* Snapchat Pixel */}
      <Script id="snap-pixel" strategy="afterInteractive">
        {`
          (function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function()
          {a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments)};
          a.queue=[];var s='script';r=t.createElement(s);r.async=!0;
          r.src=n;var u=t.getElementsByTagName(s)[0];
          u.parentNode.insertBefore(r,u);})(window,document,
          'https://sc-static.net/scevent.min.js');
          snaptr('init', '382b5995-c4ec-4fda-85d1-a13816f3d984', {});
          snaptr('track', 'PAGE_VIEW');
        `}
      </Script>

      {/* Meta (Facebook) Pixel */}
      {metaPixelId && (
        <>
          <Script id={`meta-pixel-${metaPixelId}`} strategy="afterInteractive">
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
