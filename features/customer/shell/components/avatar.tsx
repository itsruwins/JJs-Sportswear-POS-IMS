/** A customer's face: their profile photo when they've added one, otherwise their initials. */
export function Avatar({ url, initials, className = "size-9 text-[0.875rem]" }: { url: string | null; initials: string; className?: string }) {
  if (url) {
    // Photos live in the public avatars bucket, already cropped square.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" aria-hidden="true" className={`shrink-0 rounded-full object-cover shadow-[inset_0_0_0_1px_var(--line)] ${className}`} />;
  }
  return (
    <span aria-hidden="true" className={`voice-label grid shrink-0 place-items-center rounded-full bg-ground-2 text-ink shadow-[inset_0_0_0_1px_var(--line)] ${className}`}>
      {initials}
    </span>
  );
}
