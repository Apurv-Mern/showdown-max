'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { api, apiUpload } from '@/lib/api';
import { Modal } from '@/components/shared/Modal';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { cn } from '@/lib/utils';
import { PUBLIC_API_URL } from '@/lib/env';

const API_URL = PUBLIC_API_URL;

const ACCEPT_ALL = 'audio/mpeg,audio/mp3,video/mp4,image/jpeg,image/png,image/gif,image/webp';

/** Figma 232:3872 — upload panel gradient */
const BG_UPLOAD_PANEL =
  'bg-[linear-gradient(166deg,#1a1f35_0%,#191f32_12.5%,#171c30_25%,#161b2d_37.5%,#14192a_50%,#131828_62.5%,#121725_75%,#101523_87.5%,#0f1420_100%)]';

/** Figma 232:3896 — media card gradient */
const BG_MEDIA_CARD =
  'bg-[linear-gradient(139deg,#1a1f35_0%,#191f32_12.5%,#171c30_25%,#161b2d_37.5%,#14192a_50%,#131828_62.5%,#121725_75%,#101523_87.5%,#0f1420_100%)]';

interface MediaFile {
  filename: string;
  url: string;
  mediaType: string;
  size: number;
  createdAt: string;
}

interface MediaReference {
  questionId: number;
  questionOrder: number;
  questionPreview: string;
  quizId: number | null;
  quizTitle: string | null;
  roundId: number | null;
  roundName: string | null;
  roundOrder: number | null;
}

interface LibraryMediaFile extends MediaFile {
  references: MediaReference[];
}

function IconUploadLarge({ className }: { className?: string }) {
  return (
    <svg
      className={cn('size-16 text-[#00d9ff]', className)}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
    >
      <path
        d="M32 8v28M20 20l12-12 12 12"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 40v10a4 4 0 004 4h32a4 4 0 004-4V40"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconMusic({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M6 16V6l10-2v10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="4" cy="16" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="14" cy="14" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconVideo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="2" y="4" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M16 7l4-2v10l-4-2V7z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconImage({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect
        x="2.5"
        y="3.5"
        width="15"
        height="13"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="7" cy="8" r="1.5" fill="currentColor" />
      <path
        d="M3 15l4-4 3 3 3.5-3.5L17 15"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M2 3.5h8M4.5 3.5V2.5h3v1M4 3.5l.5 6h3l.5-6"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const PREVIEW_IMAGE_EXTS = new Set([
  'jpg',
  'jpeg',
  'jfif',
  'png',
  'gif',
  'webp',
  'bmp',
  'svg',
]);

function isPreviewableImageFile(file: MediaFile): boolean {
  const mt = String(file.mediaType || '').toLowerCase();
  if (mt === 'image' || PREVIEW_IMAGE_EXTS.has(mt)) return true;
  const ext = file.filename.includes('.')
    ? (file.filename.split('.').pop() || '').toLowerCase()
    : '';
  return PREVIEW_IMAGE_EXTS.has(ext);
}

function publicMediaFileUrl(filename: string) {
  return `${API_URL}/api/public/media/files/${encodeURIComponent(filename)}`;
}

function MediaInlinePlayer({
  filename,
  mediaType,
}: {
  filename: string;
  mediaType: string;
}) {
  const src = publicMediaFileUrl(filename);
  const t = String(mediaType || '').toLowerCase();

  if (t === 'mp3') {
    return (
      <audio
        key={filename}
        src={src}
        controls
        preload="metadata"
        className="h-10 w-full min-w-0 rounded-md"
      />
    );
  }

  if (t === 'mp4') {
    return (
      <video
        key={filename}
        src={src}
        controls
        playsInline
        preload="metadata"
        className="max-h-40 w-full rounded-md bg-black"
      />
    );
  }

  return null;
}

function MediaImagePreview({ filename }: { filename: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div className="mb-3 flex h-[140px] items-center justify-center rounded-[10px] bg-[#252b45]">
        <IconImage className="size-8 text-[#00d9ff]" />
      </div>
    );
  }
  return (
    <div className="mb-3 flex h-[140px] items-center justify-center overflow-hidden rounded-[10px] bg-[#1a1f2e]">
      <img
        src={publicMediaFileUrl(filename)}
        alt=""
        loading="lazy"
        decoding="async"
        className="max-h-full max-w-full object-contain"
        onError={() => setBroken(true)}
      />
    </div>
  );
}

export default function MediaPage() {
  const [libraryItems, setLibraryItems] = useState<LibraryMediaFile[]>([]);
  const [otherFiles, setOtherFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const browseInputRef = useRef<HTMLInputElement>(null);
  const mp3InputRef = useRef<HTMLInputElement>(null);
  const mp4InputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      const [libRes, allRes] = await Promise.all([
        api.get<LibraryMediaFile[]>('/api/media/library'),
        api.get<MediaFile[]>('/api/media/files'),
      ]);
      setLibraryItems(Array.isArray(libRes.data) ? libRes.data : []);
      const all = (allRes.data || []).filter((f) => f.filename !== '.gitkeep');
      setOtherFiles(
        all.filter((f) => {
          const t = String(f.mediaType || '').toLowerCase();
          return t !== 'mp3' && t !== 'mp4';
        }),
      );
    } catch (err: unknown) {
      console.error('Failed to fetch files:', err);
      toast.error('Failed to load media library');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const doUpload = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      setUploading(true);
      await apiUpload('/api/media/upload', formData);
      await fetchFiles();
      toast.success('Media uploaded');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      toast.error(message);
    } finally {
      setUploading(false);
      if (browseInputRef.current) browseInputRef.current.value = '';
      if (mp3InputRef.current) mp3InputRef.current.value = '';
      if (mp4InputRef.current) mp4InputRef.current.value = '';
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void doUpload(file);
  };

  const onDropZoneDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const onDropZoneDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const onDropZoneDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void doUpload(file);
  };

  const closeDeleteModal = () => {
    if (!deleteBusy) setDeleteTarget(null);
  };

  const executeDelete = async () => {
    const filename = deleteTarget;
    if (!filename) return;
    try {
      setDeleteBusy(true);
      const res = await api.delete<{ detachedQuestionCount?: number }>(
        `/api/media/files/${encodeURIComponent(filename)}`,
      );
      const n = res.data?.detachedQuestionCount ?? 0;
      setLibraryItems((prev) => prev.filter((f) => f.filename !== filename));
      setOtherFiles((prev) => prev.filter((f) => f.filename !== filename));
      setDeleteTarget(null);
      toast.success(
        n > 0 ? `Media deleted (${n} question${n === 1 ? '' : 's'} updated)` : 'Media deleted',
      );
    } catch (err: unknown) {
      console.error('Failed to delete file:', err);
      toast.error('Failed to delete file');
    } finally {
      setDeleteBusy(false);
    }
  };

  const openBrowse = () => browseInputRef.current?.click();

  return (
    <div className="pb-10" data-name="Admin Media Library">
      <Modal
        isOpen={deleteTarget !== null}
        onClose={closeDeleteModal}
        title="Delete this file?"
        className={cn(
          'max-w-md border-2 border-[rgba(0,217,255,0.35)] p-6 text-white shadow-[0_0_28px_rgba(0,217,255,0.12)] [&_h2]:text-white',
          BG_MEDIA_CARD,
        )}
      >
        <p className="mb-3 break-all text-sm font-medium text-white">
          <span className="text-[#99a1af]">File: </span>
          {deleteTarget}
        </p>
        <p className="mb-6 text-sm leading-relaxed text-amber-200/90">
          Any questions using this file will have their media cleared from the question. This cannot
          be undone.
        </p>
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            disabled={deleteBusy}
            onClick={closeDeleteModal}
            className="rounded-[10px] border border-white/20 bg-[#2e354c] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#3a4260] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={deleteBusy}
            onClick={() => void executeDelete()}
            className="rounded-[10px] border border-[rgba(255,0,128,0.45)] bg-[linear-gradient(180deg,#b91c5c_0%,#6b0a3a_100%)] px-5 py-2.5 text-sm font-bold text-white shadow-[0_0_14px_rgba(236,72,153,0.25)] transition hover:brightness-110 disabled:opacity-50"
          >
            {deleteBusy ? 'Deleting…' : 'Delete file'}
          </button>
        </div>
      </Modal>

      {/* Figma 232:3870 Heading */}
      <div className="mb-6" data-name="Heading 2">
        <h1 className="text-[30px] font-medium leading-9 text-white">Media Library</h1>
      </div>

      {/* Figma 232:3872 — drag & drop container */}
      {/* <section
        data-name="Container"
        className={cn(
          'relative mb-10 flex min-h-[280px] flex-col items-center rounded-2xl border-2 border-dashed border-[rgba(0,217,255,0.3)] px-6 py-10 shadow-[0_4px_5px_rgba(0,0,0,0.5)] transition-colors',
          BG_UPLOAD_PANEL,
          dragOver && 'border-[rgba(0,217,255,0.55)] ring-2 ring-[rgba(0,217,255,0.2)]',
        )}
        onDragOver={onDropZoneDragOver}
        onDragLeave={onDropZoneDragLeave}
        onDrop={onDropZoneDrop}
      > */}
      {/* <input
          ref={browseInputRef}
          type="file"
          accept={ACCEPT_ALL}
          onChange={handleFileInput}
          className="sr-only"
          aria-hidden
        />
        <input
          ref={mp3InputRef}
          type="file"
          accept="audio/mpeg,audio/mp3"
          onChange={handleFileInput}
          className="sr-only"
          aria-hidden
        />
        <input
          ref={mp4InputRef}
          type="file"
          accept="video/mp4"
          onChange={handleFileInput}
          className="sr-only"
          aria-hidden
        /> */}
      {/* 
        <button
          type="button"
          onClick={openBrowse}
          disabled={uploading}
          className="flex w-full max-w-3xl flex-col items-center rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(0,217,255,0.5)] disabled:opacity-50"
        >
          <span data-name="Icon" className="mb-4">
            <IconUploadLarge />
          </span>
          <h2
            data-name="Heading 3"
            className="mb-2 w-full text-center text-xl font-medium text-white"
          >
            Drag &amp; Drop Media Files
          </h2>
          <p data-name="Paragraph" className="mb-8 text-center text-base text-[#99a1af]">
            or click to browse
          </p>
        </button> */}

      {/* Figma 232:3881 — Upload MP3 / Upload MP4 */}
      {/* <div data-name="Container" className="flex flex-wrap items-center justify-center gap-4">
          <button
            type="button"
            data-name="Button"
            disabled={uploading}
            onClick={(e) => {
              e.stopPropagation();
              mp3InputRef.current?.click();
            }}
            className="flex h-12 min-w-[166px] items-center justify-center gap-2 rounded-[14px] border border-white/20 bg-[#2e354c] px-5 text-base font-medium text-white shadow-[0_4px_5px_rgba(0,0,0,0.5)] transition-colors hover:bg-[#3a4260] disabled:opacity-50"
          >
            <IconMusic className="size-5 shrink-0 text-white" />
            Upload MP3
          </button>
          <button
            type="button"
            data-name="Button"
            disabled={uploading}
            onClick={(e) => {
              e.stopPropagation();
              mp4InputRef.current?.click();
            }}
            className="flex h-12 min-w-[166px] items-center justify-center gap-2 rounded-[14px] border border-white/20 bg-[#2e354c] px-5 text-base font-medium text-white shadow-[0_4px_5px_rgba(0,0,0,0.5)] transition-colors hover:bg-[#3a4260] disabled:opacity-50"
          >
            <IconVideo className="size-5 shrink-0 text-white" />
            Upload MP4
          </button>
        </div> */}

      {/* {uploading && <p className="mt-4 text-sm text-[#99a1af]">Uploading…</p>} */}
      {/* </section> */}
      {/* 
      <p className="mb-8 text-sm text-[#99a1af]">
        Upload MP3 (audio), MP4 (video), and images (JPG/PNG/GIF/WebP) for questions. Max 50MB per
        file. MP3 and MP4 files below show which quiz and question use each file; deleting a file
        removes it from disk and clears it from those questions.
      </p> */}

      {loading ? (
        <LoadingSpinner />
      ) : libraryItems.length === 0 && otherFiles.length === 0 ? (
        <div
          data-name="Container"
          className={cn(
            'rounded-2xl border-2 border-[rgba(0,217,255,0.2)] py-16 text-center',
            BG_MEDIA_CARD,
          )}
        >
          <p className="text-lg text-[#99a1af]">
            No media files yet — use the area above to add files.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          <section data-name="MP3 MP4 Library">
            <h2 className="mb-4 text-lg font-semibold text-white">MP3 &amp; MP4 (quiz usage)</h2>
            {libraryItems.length === 0 ? (
              <div
                className={cn(
                  'rounded-2xl border-2 border-[rgba(0,217,255,0.2)] py-10 text-center text-[#99a1af]',
                  BG_MEDIA_CARD,
                )}
              >
                No audio or video files in storage yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
                {libraryItems.map((file) => {
                  const isMp3 = file.mediaType === 'mp3';
                  const isMp4 = file.mediaType === 'mp4';

                  return (
                    <article
                      key={file.filename}
                      data-name="Container"
                      className={cn(
                        'flex flex-col rounded-2xl border-2 border-[rgba(0,217,255,0.3)] p-4',
                        BG_MEDIA_CARD,
                      )}
                    >
                      <div className="mb-3 flex h-[100px] items-center justify-center rounded-[10px] bg-[#252b45]">
                        {isMp3 && <IconMusic className="size-8 text-[#00d9ff]" />}
                        {isMp4 && <IconVideo className="size-8 text-[#00d9ff]" />}
                      </div>
                      <p
                        className="mb-2 truncate text-sm font-medium text-white"
                        title={file.filename}
                      >
                        {file.filename}
                      </p>
                      <p className="mb-3 text-xs text-[#99a1af]">
                        {file.mediaType?.toUpperCase() || 'Unknown'} · {formatSize(file.size)} ·{' '}
                        {new Date(file.createdAt).toLocaleDateString()}
                      </p>

                      <div className="mb-3 grow rounded-lg border border-white/10 bg-black/25 p-3 text-left">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/50">
                          Used in
                        </p>
                        {file.references.length === 0 ? (
                          <p className="text-xs text-[#99a1af]">Not linked to any question.</p>
                        ) : (
                          <ul className="max-h-40 space-y-2 overflow-y-auto text-xs text-white/85">
                            {file.references.map((ref) => (
                              <li key={ref.questionId}>
                                {ref.quizId != null ? (
                                  <Link
                                    href={`/admin/quizzes/${ref.quizId}`}
                                    className="font-semibold text-[#00d9ff] hover:underline"
                                  >
                                    {ref.quizTitle || `Quiz #${ref.quizId}`}
                                  </Link>
                                ) : (
                                  <Link
                                    href="/admin/questions"
                                    className="font-semibold text-[#a78bfa] hover:underline"
                                  >
                                    Question bank
                                  </Link>
                                )}
                                <span className="text-white/50">
                                  {' '}
                                  · {ref.roundName ? `Round: ${ref.roundName}` : 'No round'} · Q #
                                  {ref.questionOrder}
                                </span>
                                <p className="mt-0.5 line-clamp-2 text-[11px] text-white/45">
                                  {ref.questionPreview}
                                </p>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="mt-auto flex flex-col gap-2">
                        <MediaInlinePlayer filename={file.filename} mediaType={file.mediaType} />
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(file.filename)}
                          className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-[rgba(255,0,128,0.3)] bg-[#252b45] py-2 text-sm text-white/90 transition-colors hover:bg-[#2e354c]"
                          aria-label={`Delete ${file.filename}`}
                        >
                          <IconTrash className="size-3" />
                          Delete
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {otherFiles.length > 0 ? (
            <section data-name="Other Media">
              <h2 className="mb-4 text-lg font-semibold text-white">Images &amp; other files</h2>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {otherFiles.map((file) => {
                  const showImageThumb = isPreviewableImageFile(file);

                  return (
                    <article
                      key={file.filename}
                      className={cn(
                        'flex flex-col rounded-2xl border-2 border-[rgba(0,217,255,0.3)] p-4',
                        BG_MEDIA_CARD,
                      )}
                    >
                      {showImageThumb ? (
                        <MediaImagePreview filename={file.filename} />
                      ) : (
                        <div className="mb-3 flex h-[140px] items-center justify-center rounded-[10px] bg-[#252b45]">
                          <span className="text-xs text-white/50">{file.mediaType || 'file'}</span>
                        </div>
                      )}
                      <p className="mb-3 truncate text-sm text-white" title={file.filename}>
                        {file.filename}
                      </p>
                      <p className="mb-3 text-xs text-[#99a1af]">
                        {file.mediaType?.toUpperCase() || 'Unknown'} · {formatSize(file.size)} ·{' '}
                        {new Date(file.createdAt).toLocaleDateString()}
                      </p>
                      <div className="mt-auto flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(file.filename)}
                          className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-[rgba(255,0,128,0.3)] bg-[#252b45] py-2 text-sm text-white/90 transition-colors hover:bg-[#2e354c]"
                          aria-label={`Delete ${file.filename}`}
                        >
                          <IconTrash className="size-3" />
                          Delete
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
