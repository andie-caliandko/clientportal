/** Public address of a teammate's photo in storage. */
export const avatarUrl = (path: string | null | undefined) =>
  path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${path}` : null;

/** A person's photo, or their initials when they haven't added one. */
export function Avatar({ name, path, className = "", style, initials = 1 }: {
  name: string;
  path?: string | null;
  className?: string;
  style?: React.CSSProperties;
  /** How many initials to show without a photo. */
  initials?: 1 | 2;
}) {
  const url = avatarUrl(path);
  const letters = name.split(/\s+/).filter(Boolean).map((x) => x[0]).join("").slice(0, initials).toUpperCase();
  return (
    <span className={`av ${className}`} style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" /> : letters}
    </span>
  );
}
