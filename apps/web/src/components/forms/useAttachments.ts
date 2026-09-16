'use client';

import { useCallback, useRef, useState } from 'react';
import { ATTACHMENT_TYPES, MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES } from '@aptentech/shared';

/**
 * Uploading files from an enquiry form.
 *
 * Each file is sent the moment it is chosen and reports its own outcome, so the visitor can
 * see a file has arrived while they are still writing the message. The alternative — holding
 * everything until submit — means a long silent wait at the one moment they are most likely
 * to give up, and one bad file failing the whole enquiry.
 *
 * What the form submits is not the files but their receipts. See `attachmentTokens` in the
 * shared schema for what a receipt is and why it works that way.
 */

export interface Attachment {
  /** Stable for the lifetime of the row, so React keeps the same element as status changes. */
  uid: string;
  name: string;
  bytes: number;
  status: 'uploading' | 'done' | 'error';
  /** The receipt, once the upload succeeds. Absent means there is nothing to submit. */
  token?: string;
  /** Why it failed, in words the visitor can act on. */
  error?: string;
}

const EXTENSIONS = new Set<string>(ATTACHMENT_TYPES.map((t) => t.ext));

export function useAttachments() {
  const [items, setItems] = useState<Attachment[]>([]);
  const counter = useRef(0);

  /** Updates one row without disturbing the others, and without depending on stale state. */
  const patch = useCallback((uid: string, next: Partial<Attachment>) => {
    setItems((prev) => prev.map((item) => (item.uid === uid ? { ...item, ...next } : item)));
  }, []);

  const remove = useCallback((uid: string) => {
    /*
      Removed from the list only. The uploaded file is left where it is rather than deleted.

      Deleting would need an endpoint that destroys a stored file on request, reachable by
      anyone, which is a worse thing to own than a few unreferenced files. Anything never
      claimed by an enquiry expires within a day on its own.
    */
    setItems((prev) => prev.filter((item) => item.uid !== uid));
  }, []);

  const add = useCallback(
    (files: FileList | File[]) => {
      const chosen = Array.from(files);
      if (!chosen.length) return;

      setItems((prev) => {
        const room = MAX_ATTACHMENTS - prev.length;
        if (room <= 0) return prev;

        const accepted: Attachment[] = [];

        for (const file of chosen.slice(0, room)) {
          const uid = `att-${(counter.current += 1)}`;
          const extension = file.name.split('.').pop()?.toLowerCase() ?? '';

          /*
            Checked here as well as on the server, and only here does it save anything.

            The server is the authority and re-checks the bytes themselves. This exists so
            somebody on a phone connection is told "that type is not supported" straight away
            instead of after uploading nine megabytes to be refused.
          */
          if (!EXTENSIONS.has(extension)) {
            accepted.push({
              uid,
              name: file.name,
              bytes: file.size,
              status: 'error',
              error: 'That file type is not supported.',
            });
            continue;
          }

          if (file.size > MAX_ATTACHMENT_BYTES) {
            accepted.push({
              uid,
              name: file.name,
              bytes: file.size,
              status: 'error',
              error: `Too large — the limit is ${Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB.`,
            });
            continue;
          }

          accepted.push({ uid, name: file.name, bytes: file.size, status: 'uploading' });
          void upload(file, uid);
        }

        return [...prev, ...accepted];
      });

      async function upload(file: File, uid: string) {
        const body = new FormData();
        body.append('file', file);

        try {
          const res = await fetch('/api/leads/attachments/', { method: 'POST', body });
          const payload = (await res.json().catch(() => null)) as
            | { success?: boolean; data?: { token?: string }; error?: { message?: string } }
            | null;

          if (!res.ok || !payload?.success || !payload.data?.token) {
            patch(uid, {
              status: 'error',
              // The server's message names the actual problem — wrong type, too large, too
              // many. Replacing it with something generic would leave the visitor guessing.
              error: payload?.error?.message ?? 'Upload failed. Please try again.',
            });
            return;
          }

          patch(uid, { status: 'done', token: payload.data.token });
        } catch {
          patch(uid, { status: 'error', error: 'Upload failed. Please check your connection.' });
        }
      }
    },
    [patch],
  );

  /** Only files that actually arrived have a receipt to submit. */
  const tokens = items.filter((item) => item.status === 'done' && item.token).map((item) => item.token!);

  return {
    items,
    add,
    remove,
    tokens,
    /** True while anything is still in flight, so submit can wait rather than lose a file. */
    busy: items.some((item) => item.status === 'uploading'),
    full: items.length >= MAX_ATTACHMENTS,
    clear: useCallback(() => setItems([]), []),
  };
}
