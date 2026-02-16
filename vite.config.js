import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { Innertube, UniversalCache } from 'youtubei.js'

let yt = null;
let ytCreatedAt = 0;
const SESSION_TTL = 1000 * 60 * 30;

const initYt = async (forceNew = false) => {
  if (forceNew || !yt || (Date.now() - ytCreatedAt > SESSION_TTL)) {
    console.log('[CW-YT] Creating/refreshing Innertube session...');
    yt = await Innertube.create({ cache: new UniversalCache(false), generate_session_locally: true });
    ytCreatedAt = Date.now();
  }
  return yt;
}

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
      }));
    } catch (e) {
      console.warn(`[CW-Piped] ${instance} failed:`, e.message);
    }
  }
  return null;
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'youtube-search-api',
      configureServer(server) {
        // Independent YouTube search — no dependency on main app
        server.middlewares.use('/api/yt/search', async (req, res) => {
          try {
            const url = new URL(req.url, `http://${req.headers.host}`);
            const query = url.searchParams.get('q');
            if (!query) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'No query' }));
            }

            const effectiveQuery = query.toLowerCase().includes('karaoke') ? query : `${query} karaoke`;

            // Try Innertube first (with retry)
            let rawItems = [];
            for (let attempt = 0; attempt < 2; attempt++) {
              try {
                const youtube = await initYt(attempt > 0);
                const searchResults = await youtube.search(effectiveQuery);
                rawItems = searchResults.videos || searchResults.results || [];
                if (rawItems.length > 0) break;
              } catch (innerErr) {
                console.warn(`[CW-YT] Innertube attempt ${attempt + 1} failed:`, innerErr.message);
                if (attempt === 0) yt = null;
              }
            }

            // Fallback to Piped API
            if (rawItems.length === 0) {
              console.log('[CW-YT] Innertube failed, trying Piped...');
              const pipedResults = await searchPiped(effectiveQuery);
              if (pipedResults && pipedResults.length > 0) {
                const withTags = pipedResults.map(v => {
                  const lt = v.title.toLowerCase();
                  const tags = [];
                  if (lt.includes('karaoke')) tags.push('Karaoke');
                  if (lt.includes('remix')) tags.push('Remix');
                  if (lt.includes('tone nam')) tags.push('Tone Nam');
                  if (lt.includes('tone nữ') || lt.includes('tone nu')) tags.push('Tone Nữ');
                  if (lt.includes('beat')) tags.push('Beat');
                  return { ...v, tags, cleanTitle: v.title };
                });
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify(withTags));
              }
            }

            // Normalize Innertube results
            const videos = rawItems
              .filter(v => v.type === 'Video')
              .map(v => {
                const title = v.title?.text || v.title?.toString() || '';
                const lt = title.toLowerCase();

                const tags = [];
                if (lt.includes('karaoke')) tags.push('Karaoke');
                if (lt.includes('remix')) tags.push('Remix');
                if (lt.includes('beat') || lt.includes('instrumental')) tags.push('Beat');
                if (lt.includes('tone nam')) tags.push('Tone Nam');
                if (lt.includes('tone nữ') || lt.includes('tone nu')) tags.push('Tone Nữ');
                if (lt.includes('song ca')) tags.push('Song Ca');

                let cleanTitle = title
                  .replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '')
                  .replace(/karaoke/gi, '').replace(/official.*?video/gi, '')
                  .replace(/mv/gi, '').replace(/lyrics?/gi, '')
                  .replace(/beat/gi, '').replace(/hd|4k/gi, '')
                  .replace(/[|]/g, '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
                if (cleanTitle.length < 2) cleanTitle = title;

                const viewCount = v.view_count?.text ? parseInt(v.view_count.text.replace(/[^0-9]/g, '')) || 0 : 0;
                const durationText = v.duration?.text || '';

                return {
                  id: v.id,
                  videoId: v.id,
                  title,
                  cleanTitle,
                  tags,
                  thumbnail: v.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
                  artist: v.author?.name || '',
                  duration: durationText,
                  views: viewCount > 1000000 ? `${(viewCount / 1000000).toFixed(1)}M` : viewCount > 1000 ? `${(viewCount / 1000).toFixed(0)}K` : String(viewCount),
                  viewCount,
                };
              });

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(videos));
          } catch (e) {
            console.error('[CW-YT] Search failed:', e.message);
            // Emergency Piped fallback
            try {
              const q = new URL(req.url, `http://${req.headers.host}`).searchParams.get('q') || '';
              const fallback = await searchPiped(q.toLowerCase().includes('karaoke') ? q : `${q} karaoke`);
              if (fallback && fallback.length > 0) {
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify(fallback));
              }
            } catch { /* give up */ }
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      }
    }
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // Google Suggestions — direct to Google, no dependency
      '/api/suggest': {
        target: 'https://suggestqueries.google.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/suggest/, '/complete/search'),
        headers: { 'User-Agent': 'Mozilla/5.0' },
      },
    },
  },
})
