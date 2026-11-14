import { useRef, useState } from 'react';
import { api } from '../api/client';
import { resizePhoto } from '../lib/image';

type Props = {
  label: string;
  hint: string;
  url: string | null;
  shape?: 'round' | 'square';
  onUploaded: (media: { id: string; url: string }) => void;
  onRemove?: () => void;
};

/** Pick a photo → shrink it in the browser → upload → hand back the new media id. */
export function PhotoPicker({ label, hint, url, shape = 'round', onUploaded, onRemove }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const photo = await resizePhoto(file);
      const media = await api.post<{ id: string; url: string }>('/api/media', { ...photo, alt: label });
      onUploaded(media);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="photo-picker">
      {url ? (
        <img className={`thumb${shape === 'square' ? ' square' : ''}`} src={url} alt="" />
      ) : (
        <span className={`thumb empty${shape === 'square' ? ' square' : ''}`}>No photo</span>
      )}
      <span style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
        <strong style={{ fontSize: 14 }}>{label}</strong>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{hint}</span>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => input.current?.click()} disabled={busy}>
            {busy ? <span className="spinner" /> : null}
            {busy ? 'Uploading…' : url ? 'Change' : 'Upload'}
          </button>
          {url && onRemove && (
            <button type="button" className="btn-link" onClick={onRemove}>
              Remove
            </button>
          )}
        </span>
        {error && <span style={{ fontSize: 13, color: 'var(--danger-text)' }}>{error}</span>}
      </span>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => choose(e.target.files?.[0])} />
    </div>
  );
}
