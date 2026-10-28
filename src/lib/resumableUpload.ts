"use client";

import { Upload } from "tus-js-client";
import { createClient } from "@/lib/supabase/browser";

/**
 * Uploads a file to portal storage in 6 MB pieces (Supabase's resumable uploads), so big videos
 * go up reliably, pick up where they left off after a dropped connection, and report progress.
 * Resolves with an error message, or null when it's in.
 */
export async function uploadResumable(bucket: string, path: string, file: File | Blob, opts: {
  contentType?: string;
  onProgress?: (fraction: number) => void;
} = {}): Promise<string | null> {
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return "You've been signed out. Sign in again and retry.";
  return new Promise((resolve) => {
    const upload = new Upload(file, {
      endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${token}`, "x-upsert": "false" },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: { bucketName: bucket, objectName: path, contentType: opts.contentType || (file as File).type || "application/octet-stream", cacheControl: "3600" },
      // Supabase requires exactly 6 MB pieces.
      chunkSize: 6 * 1024 * 1024,
      onProgress: (sent, total) => opts.onProgress?.(total ? sent / total : 0),
      onSuccess: () => resolve(null),
      onError: (err) => {
        const status = (err as { originalResponse?: { getStatus(): number } }).originalResponse?.getStatus?.();
        resolve(status === 413 || /too large|exceed|maximum allowed size/i.test(String(err))
          ? "This file is bigger than the portal's upload limit."
          : "It didn't upload. Check your connection and try again.");
      },
    });
    upload.findPreviousUploads().then((previous) => {
      if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    });
  });
}
