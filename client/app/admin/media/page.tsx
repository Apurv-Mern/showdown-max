'use client';

import { useEffect, useState, useRef } from 'react';
import { api, apiUpload } from '@/lib/api';
import { Button } from '@/components/shared/Button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

interface MediaFile {
  filename: string;
  url: string;
  mediaType: string;
  size: number;
  createdAt: string;
}

export default function MediaPage() {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      const res = await api.get<MediaFile[]>('/api/media/files');
      setFiles(res.data.filter((f) => f.filename !== '.gitkeep'));
    } catch (err) {
      console.error('Failed to fetch files:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploading(true);
      const data = await apiUpload('/api/media/upload', formData);
      fetchFiles();
    } catch (err: any) {
      alert(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (filename: string) => {
    if (!confirm(`Delete ${filename}?`)) return;
    try {
      await api.delete(`/api/media/files/${filename}`);
      setFiles((prev) => prev.filter((f) => f.filename !== filename));
    } catch (err) {
      console.error('Failed to delete file:', err);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Media Library</h1>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/mpeg,audio/mp3,video/mp4,image/jpeg,image/png,image/gif,image/webp"
            onChange={handleUpload}
            className="hidden"
          />
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading...' : '+ Upload File'}
          </Button>
        </div>
      </div>

      <p className="text-foreground/40 text-sm mb-6">Upload MP3 (audio), MP4 (video), and images (JPG/PNG/GIF/WebP) for questions. Max 50MB per file.</p>

      {loading ? (
        <LoadingSpinner />
      ) : files.length === 0 ? (
        <div className="text-center py-16 text-foreground/50">
          <p className="text-lg mb-4">No media files yet</p>
          <Button onClick={() => fileInputRef.current?.click()}>Upload your first file</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {files.map((file) => (
            <div
              key={file.filename}
              className="bg-surface border border-border rounded-xl p-4 flex items-center justify-between hover:border-primary/30 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${
                  file.mediaType === 'mp3' ? 'bg-primary/20' : file.mediaType === 'mp4' ? 'bg-warning/20' : 'bg-success/20'
                }`}>
                  {file.mediaType === 'mp3' ? '🎵' : file.mediaType === 'mp4' ? '🎬' : '🖼'}
                </div>
                <div>
                  <p className="font-medium text-sm">{file.filename}</p>
                  <div className="flex gap-3 text-xs text-foreground/30 mt-0.5">
                    <span>{file.mediaType?.toUpperCase() || 'Unknown'}</span>
                    <span>•</span>
                    <span>{formatSize(file.size)}</span>
                    <span>•</span>
                    <span>{new Date(file.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <a href={`${API_URL}${file.url}`} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="sm">Play</Button>
                </a>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigator.clipboard.writeText(`${API_URL}${file.url}`)}
                >
                  Copy URL
                </Button>
                <Button variant="danger" size="sm" onClick={() => handleDelete(file.filename)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
