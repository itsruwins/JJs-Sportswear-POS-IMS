"use client";

import { useId } from "react";
import { garmentColor } from "@/lib/customer/colors";

/**
 * A product on the photo backdrop: the sample illustration recolored to `color`, or the
 * real photo when the product has one. Color changes cross-fade (the world's 480 ms jersey
 * transition), so picking a swatch reads as the same garment in another dye.
 */
export function GarmentArt({
  art,
  image,
  color,
  name,
  className = "",
  sizes = "(min-width: 1024px) 25vw, 50vw",
}: {
  art: string | null;
  image: string | null;
  color: string | null;
  name: string;
  className?: string;
  sizes?: string;
}) {
  const id = `sheen${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const { body, trim } = garmentColor(color);
  const label = color ? `${name} in ${color}` : name;

  if (art) {
    return (
      <div
        role="img"
        aria-label={label}
        className={`garment-art ${className}`}
        style={
          {
            "--g-body": body,
            "--g-trim": trim,
            "--g-shade": `color-mix(in oklch, ${body}, black 9%)`,
          } as React.CSSProperties
        }
        dangerouslySetInnerHTML={{ __html: art.replaceAll("__ID__", id) }}
      />
    );
  }

  if (image) {
    // Owner-uploaded photos live in the public product-images bucket.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt={label} sizes={sizes} className={`garment-photo ${className}`} loading="lazy" />;
  }

  return (
    <div role="img" aria-label={`${name}, no photo yet`} className={`grid place-items-center ${className}`}>
      <span aria-hidden="true" className="voice-board text-[2.5rem] text-ink-2/50">
        {name.slice(0, 1)}
      </span>
    </div>
  );
}
