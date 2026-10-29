/** One photo or video in a content shoot gallery, with short-lived links to show and download it. */
export type GalleryItem = {
  id: string;
  name: string;
  mime: string | null;
  width: number | null;
  height: number | null;
  favorite: boolean;
  /** Small preview for the grid (falls back to the full file). */
  thumb: string | null;
  /** A big, sharp version for the full-screen view (made on the server; null until then, or for videos). */
  large: string | null;
  /** The full file (the original). */
  url: string | null;
  /** The full file, saved as a download with its own name. */
  download: string | null;
};

export const isVideo = (i: { mime: string | null; name: string }) =>
  (i.mime ?? "").startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(i.name);

export const galleryCount = (items: { mime: string | null; name: string }[]) => {
  const videos = items.filter(isVideo).length, photos = items.length - videos;
  return [photos && `${photos} photo${photos === 1 ? "" : "s"}`, videos && `${videos} video${videos === 1 ? "" : "s"}`].filter(Boolean).join(" · ") || "Empty";
};
