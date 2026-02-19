"use client";

import { useState } from "react";

type SafeImageProps = {
  src: string;
  fallback: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
};

/**
 * Simple <img> with onError fallback.
 * Pass full paths WITH extension:
 *   src="/logos/shoals/logo.png"
 *   fallback="/logos/default/logo.png"
 */
export default function SafeImage({
  src,
  fallback,
  alt,
  className,
  style,
}: SafeImageProps) {
  const [imgSrc, setImgSrc] = useState(src);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imgSrc}
      alt={alt}
      className={className}
      style={style}
      onError={() => {
        if (imgSrc !== fallback) setImgSrc(fallback);
      }}
    />
  );
}
