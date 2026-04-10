'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { api, apiUpload } from '@/lib/api';
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

function IconPlay({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="currentColor" aria-hidden>
      <path d="M2.5 1.5L10.5 6 2.5 10.5V1.5z" />
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

export default function MediaPage() {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const browseInputRef = useRef<HTMLInputElement>(null);
  const mp3InputRef = useRef<HTMLInputElement>(null);
  const mp4InputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      const res = await api.get<MediaFile[]>('/api/media/files');
      setFiles(res.data.filter((f) => f.filename !== '.gitkeep'));
    } catch (err: unknown) {
      console.error('Failed to fetch files:', err);
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

  const handleDelete = async (filename: string) => {
    if (!confirm(`Delete ${filename}?`)) return;
    try {
      await api.delete(`/api/media/files/${filename}`);
      setFiles((prev) => prev.filter((f) => f.filename !== filename));
      toast.success('Media deleted');
    } catch (err: unknown) {
      console.error('Failed to delete file:', err);
      toast.error('Failed to delete file');
    }
  };

  const openBrowse = () => browseInputRef.current?.click();

  return (
    <div className="pb-10" data-name="Admin Media Library">
      {/* Figma 232:3870 Heading */}
      <div className="mb-6" data-name="Heading 2">
        <h1 className="text-[30px] font-medium leading-9 text-white">Media Library</h1>
      </div>

      {/* Figma 232:3872 — drag & drop container */}
      <section
        data-name="Container"
        className={cn(
          'relative mb-10 flex min-h-[280px] flex-col items-center rounded-2xl border-2 border-dashed border-[rgba(0,217,255,0.3)] px-6 py-10 shadow-[0_4px_5px_rgba(0,0,0,0.5)] transition-colors',
          BG_UPLOAD_PANEL,
          dragOver && 'border-[rgba(0,217,255,0.55)] ring-2 ring-[rgba(0,217,255,0.2)]',
        )}
        onDragOver={onDropZoneDragOver}
        onDragLeave={onDropZoneDragLeave}
        onDrop={onDropZoneDrop}
      >
        <input
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
        />

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
        </button>

        {/* Figma 232:3881 — Upload MP3 / Upload MP4 */}
        <div data-name="Container" className="flex flex-wrap items-center justify-center gap-4">
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
        </div>

        {uploading && <p className="mt-4 text-sm text-[#99a1af]">Uploading…</p>}
      </section>

      <p className="mb-8 text-sm text-[#99a1af]">
        Upload MP3 (audio), MP4 (video), and images (JPG/PNG/GIF/WebP) for questions. Max 50MB per
        file.
      </p>

      {loading ? (
        <LoadingSpinner />
      ) : files.length === 0 ? (
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
        <div
          data-name="Container"
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {files.map((file) => {
            const isMp3 = file.mediaType === 'mp3';
            const isMp4 = file.mediaType === 'mp4';
            const isImage = !isMp3 && !isMp4;

            return (
              <article
                key={file.filename}
                data-name="Container"
                className={cn(
                  'flex flex-col rounded-2xl border-2 border-[rgba(0,217,255,0.3)] p-4',
                  BG_MEDIA_CARD,
                )}
              >
                <div
                  data-name="Container"
                  className="mb-3 flex h-[140px] items-center justify-center rounded-[10px] bg-[#252b45]"
                >
                  {isMp3 && <IconMusic className="size-8 text-[#00d9ff]" />}
                  {isMp4 && <IconVideo className="size-8 text-[#00d9ff]" />}
                  {isImage && <IconImage className="size-8 text-[#00d9ff]" />}
                </div>
                <p
                  data-name="Paragraph"
                  className="mb-3 truncate text-sm text-white"
                  title={file.filename}
                >
                  {file.filename}
                </p>
                <p className="mb-3 text-xs text-[#99a1af]">
                  {file.mediaType?.toUpperCase() || 'Unknown'} · {formatSize(file.size)} ·{' '}
                  {new Date(file.createdAt).toLocaleDateString()}
                </p>
                <div data-name="Container" className="mt-auto flex gap-2">
                  <a
                    href={`${API_URL}${file.url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-1 items-center justify-center rounded-[10px] border border-[rgba(0,217,255,0.3)] bg-[#252b45] py-2 text-[#00d9ff] transition-colors hover:bg-[#2e354c]"
                    aria-label={`Play or open ${file.filename}`}
                  >
                    <IconPlay className="size-3" />
                  </a>
                  <button
                    type="button"
                    data-name="Button"
                    onClick={() => handleDelete(file.filename)}
                    className="flex flex-1 items-center justify-center rounded-[10px] border border-[rgba(255,0,128,0.3)] bg-[#252b45] py-2 text-white/90 transition-colors hover:bg-[#2e354c]"
                    aria-label={`Delete ${file.filename}`}
                  >
                    <IconTrash className="size-3" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
