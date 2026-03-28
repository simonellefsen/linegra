import React from 'react';
import { Upload as UploadIcon, Link2, Image as ImageIcon, Music, Video, File, Trash2, Globe } from 'lucide-react';
import { MediaItem, MediaType } from '../../types';

interface MediaTabProps {
  canEdit: boolean;
  mediaItems: MediaItem[];
  onUploadClick: () => void;
  onLinkMedia: () => void;
  onUpdateMedia: (id: string, updates: Partial<MediaItem>) => void;
  onRemoveMedia: (id: string) => void;
}

const getMediaTypeIcon = (type: MediaType) => {
  switch (type) {
    case 'audio':
      return Music;
    case 'video':
      return Video;
    case 'document':
      return File;
    default:
      return ImageIcon;
  }
};

const MediaTab: React.FC<MediaTabProps> = ({ canEdit, mediaItems, onUploadClick, onLinkMedia, onUpdateMedia, onRemoveMedia }) => (
  <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
    <div className="flex items-center justify-between">
      <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em]">Visual & Audio Archive</p>
      <div className="flex gap-2">
        <button
          onClick={onUploadClick}
          disabled={!canEdit}
          className="text-[9px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <UploadIcon className="w-3.5 h-3.5" /> Upload
        </button>
        <button
          onClick={onLinkMedia}
          disabled={!canEdit}
          className="text-[9px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 rounded-xl hover:bg-blue-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Link2 className="w-3.5 h-3.5" /> Link URL
        </button>
      </div>
    </div>

    <div className="grid grid-cols-1 gap-6">
      {mediaItems.map((media) => {
        const TypeIcon = getMediaTypeIcon(media.type || 'image');
        return (
          <div key={media.id} className="group bg-white border border-slate-100 rounded-[40px] overflow-hidden shadow-sm hover:shadow-xl transition-all p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-500">
                  <TypeIcon className="w-5 h-5" />
                </div>
                <div>
                  <select
                    value={media.type}
                    onChange={(e) => onUpdateMedia(media.id, { type: e.target.value as MediaType })}
                    disabled={!canEdit}
                    className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-transparent border-none outline-none cursor-pointer disabled:opacity-50"
                  >
                    {['image', 'audio', 'video', 'document'].map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-tight">{media.source === 'local' ? 'Local File' : 'External Link'}</p>
                </div>
              </div>
              <button onClick={() => onRemoveMedia(media.id)} className="text-slate-300 hover:text-rose-500 p-2 disabled:opacity-40" disabled={!canEdit}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {media.type === 'image' && media.url && (
              <div className="aspect-video rounded-[28px] overflow-hidden bg-slate-50 border border-slate-100">
                <img src={media.url} className="w-full h-full object-contain" />
              </div>
            )}

            <div className="space-y-3 px-2">
              <input
                value={media.caption}
                onChange={(e) => onUpdateMedia(media.id, { caption: e.target.value })}
                placeholder="Add a descriptive caption..."
                disabled={!canEdit}
                className="w-full font-bold text-slate-900 border-none outline-none bg-transparent disabled:opacity-60"
              />
              <textarea
                value={media.description || ''}
                onChange={(e) => onUpdateMedia(media.id, { description: e.target.value })}
                placeholder="Describe what this media shows..."
                disabled={!canEdit}
                rows={3}
                className="w-full resize-none rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none disabled:opacity-60"
              />
              <div className="flex items-center gap-4 flex-wrap">
                <select
                  value={media.category}
                  onChange={(e) => onUpdateMedia(media.id, { category: e.target.value as MediaItem['category'] })}
                  disabled={!canEdit}
                  className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100 outline-none cursor-pointer disabled:opacity-50"
                >
                  {['Portrait', 'Family', 'Location', 'Document', 'Event', 'Other'].map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
                {media.source === 'remote' && (
                  <div className="relative flex-1 min-w-[200px] group/url">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                    <input
                      value={media.url}
                      onChange={(e) => onUpdateMedia(media.id, { url: e.target.value })}
                      placeholder="Paste URL..."
                      disabled={!canEdit}
                      className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-medium outline-none disabled:opacity-60"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {mediaItems.length === 0 && (
        <p className="text-center py-20 text-xs text-slate-400 italic">No media has been linked to this person yet.</p>
      )}
    </div>
  </div>
);

export default MediaTab;
