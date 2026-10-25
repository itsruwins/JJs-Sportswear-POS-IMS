"use client";

/** A product on the photo backdrop: its photo, or its initial while it has none. */
export function GarmentArt({
  image,
  color,
  name,
  className = "",
  sizes = "(min-width: 1024px) 25vw, 50vw",
}: {
  image: string | null;
  color: string | null;
  name: string;
  className?: string;
  sizes?: string;
}) {
  const label = color ? `${name} in ${color}` : name;

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
