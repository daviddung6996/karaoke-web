import { Innertube, UniversalCache } from 'youtubei.js';

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.r4fo.com',
  'https://pipedapi.adminforge.de',
];

const searchPiped = async (query) => {
  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${instance}/search?q=${encodeURIComponent(query)}&filter=videos`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      return (data.items || []).filter(v => v.type === 'stream').map(v => ({
        id: v.url?.replace('/watch?v=', '') || '',
        title: v.title || '',
        thumbnail: v.thumbnail || '',
        artist: v.uploaderName || '',
        duration: v.duration ? `${Math.floor(v.duration / 60)}:${String(v.duration % 60).padStart(2, '0')}` : '',
        views: v.views ? `${(v.views / 1000).toFixed(0)}K` : '0',
        viewCount: v.views || 0,
        tags: [],
      }));
    } catch (e) { continue; }
  }
  return null;
};

export default async function handler(req, res) {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'No query' });

  const effectiveQuery = q.toLowerCase().includes('karaoke') ? q : `${q} karaoke`;

  try {
    const yt = await Innertube.create({ cache: new UniversalCache(false), generate_session_locally: true });
    const searchResults = await yt.search(effectiveQuery);
    const rawItems = searchResults.videos || searchResults.results || [];

    if (rawItems.length > 0) {
      const videos = rawItems.filter(v => v.type === 'Video').map(v => {
        const title = v.title?.text || v.title?.toString() || '';
        const lt = title.toLowerCase();
        const tags = [];
        if (lt.includes('karaoke')) tags.push('Karaoke');
        if (lt.includes('remix')) tags.push('Remix');
        if (lt.includes('beat')) tags.push('Beat');
        if (lt.includes('tone nam')) tags.push('Tone Nam');
        if (lt.includes('tone nữ') || lt.includes('tone nu')) tags.push('Tone Nữ');
        const viewCount = v.view_count?.text ? parseInt(v.view_count.text.replace(/[^0-9]/g, '')) || 0 : 0;
        return {
          id: v.id, videoId: v.id, title, tags,
          thumbnail: v.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
          artist: v.author?.name || '',
          duration: v.duration?.text || '',
          views: viewCount > 1000000 ? `${(viewCount/1000000).toFixed(1)}M` : `${(viewCount/1000).toFixed(0)}K`,
          viewCount,
        };
      });
      return res.json(videos);
    }
  } catch (e) { /* fallback */ }

  const piped = await searchPiped(effectiveQuery);
  if (piped) return res.json(piped);

  res.status(500).json({ error: 'Search failed' });
}
