"use client";

import { useState, useEffect } from "react";

const EXTENSIONS = ["png", "jpg", "jpeg", "webp", "svg"];

type SafeImageProps = {
  /** Base path WITHOUT extension, e.g. "/logos/renshoals/logo" */
  src: string;
  /** Fallback base path WITHOUT extension, e.g. "/logos/default/logo" */
  fallback: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
};

/**
 * Tries src with each extension (png, jpg, jpeg, webp, svg).
 * On failure falls back to the fallback path with the same extension scan.
 * Drop any image into the folder and it'll be found automatically.
 */
export default function SafeImage({
  src,
  fallback,
  alt,
  className,
  style,
}: SafeImageProps) {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function probe(basePath: string): Promise<string | null> {
      for (const ext of EXTENSIONS) {
        const url = `${basePath}.${ext}`;
        try {
          const res = await fetch(url, { method: "HEAD" });
          if (res.ok && !cancelled) return url;
        } catch {
          // continue
        }
      }
      return null;
    }

    async function resolve() {
      // Try primary path first
      const primary = await probe(src);
      if (primary && !cancelled) {
        setResolvedSrc(primary);
        return;
      }
      // Try fallback
      const fb = await probe(fallback);
      if (fb && !cancelled) {
        setResolvedSrc(fb);
        return;
      }
      // Nothing found — show nothing
      if (!cancelled) setResolvedSrc(null);
    }

    resolve();
    return () => { cancelled = true; };
  }, [src, fallback]);

  if (!resolvedSrc) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={resolvedSrc} alt={alt} className={className} style={style} />
  );
}
