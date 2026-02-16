
// customer-web/src/videoSearch.js

export async function searchVideos(query) {
    if (!query?.trim()) return [];

    const searchQuery = query.toLowerCase().includes('karaoke') ? query : `${query} karaoke`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        // Fetch from proxied main app API
        const res = await fetch(
            `/api/yt/search?q=${encodeURIComponent(searchQuery)}`,
            { signal: controller.signal }
        );
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error(res.status);
        const items = await res.json();

        const validKeywords = ['karaoke', 'beat', 'instrumental', 'nhạc sống', 'tone', 'phối'];

        return items
            .filter(item => {
                const title = item.title.toLowerCase();
                return validKeywords.some(keyword => title.includes(keyword));
            })
            .map(item => {
                // Calculate score: Base on ViewCount (Quality) * Relevance (Context)
                let baseScore = item.viewCount || 0;
                let multiplier = 1.0;

                const title = item.title.toLowerCase();
                const q = query.toLowerCase();
                const qWords = q.split(/\s+/).filter(w => w.length > 0);

                // 1. Exact Phrase Match
                if (title.includes(q)) multiplier *= 2.0;

                // 2. Tone Match
                if (q.includes('tone nam') && title.includes('tone nam')) multiplier *= 3.0;
                if (q.includes('tone nữ') && title.includes('tone nữ')) multiplier *= 3.0;
                if (q.includes('tone nu') && title.includes('tone nữ')) multiplier *= 3.0;

                // 3. Keyword Bonus
                if (title.includes('karaoke')) multiplier *= 1.2;
                if (title.includes('beat') || title.includes('instrumental')) multiplier *= 1.1;

                // 4. Word Context
                let wordMatches = 0;
                qWords.forEach(word => {
                    if (title.includes(word)) wordMatches++;
                });
                multiplier += (wordMatches * 0.1);

                // 5. All Words Present
                if (wordMatches === qWords.length) multiplier *= 1.5;

                // 6. Penalties
                const negatives = ['live', 'concert', 'fancam', 'cover', 'remix'];
                negatives.forEach(neg => {
                    if (title.includes(neg) && !q.includes(neg)) {
                        multiplier *= 0.5;
                    }
                });

                if ((title.includes('official') || title.includes('mv')) && !title.includes('karaoke')) {
                    multiplier *= 0.5;
                }

                let score = baseScore * multiplier;
                if (score === 0 && wordMatches > 0) score = 1000 * multiplier;

                // Extract tags (ui helper)
                const tags = [];
                const t = title.toLowerCase();
                if (t.includes('tone nam')) tags.push('Tone Nam');
                if (t.includes('tone nữ') || t.includes('tone nu')) tags.push('Tone Nữ');
                if (t.includes('beat')) tags.push('Beat');
                if (t.includes('remix')) tags.push('Remix');
                if (t.includes('song ca')) tags.push('Song Ca');
                if (t.includes('nhạc sống')) tags.push('Nhạc Sống');

                return {
                    ...item,
                    score,
                    tags,
                    videoId: item.id || item.videoId,
                    isApi: true
                };
            })
            .sort((a, b) => b.score - a.score);

    } catch (e) {
        console.error("YouTube search failed:", e.message);
        return [];
    }
}

export function formatViews(count) {
    if (!count) return null;
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(0)}K`;
    return String(count);
}
