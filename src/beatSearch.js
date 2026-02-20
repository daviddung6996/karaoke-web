// customer-web/src/beatSearch.js
// Search for beat/karaoke variants of a song

const beatCache = new Map();

function removeAccents(str) {
    if (!str) return '';
    return str.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase();
}

function normalizeForMatch(str) {
    return removeAccents(str)
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export async function searchBeatVariants(songTitle, artist, originalVideoId) {
    if (!songTitle) return [];

    const cacheKey = `${songTitle}|${artist || ''}|${originalVideoId || ''}`;
    if (beatCache.has(cacheKey)) return beatCache.get(cacheKey);

    const cleanTitle = songTitle
        .replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '')
        .replace(/karaoke/gi, '').replace(/beat/gi, '')
        .replace(/instrumental/gi, '').replace(/tone\s*(nam|nữ|nu)/gi, '')
        .replace(/nhạc sống/gi, '').replace(/phối mới/gi, '')
        .replace(/official.*video/gi, '').replace(/mv/gi, '')
        .replace(/lyrics?/gi, '').replace(/hd|4k/gi, '')
        .replace(/\|/g, '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

    const baseName = cleanTitle || songTitle;
    const normalizedBase = normalizeForMatch(baseName);

    const queries = [
        `${baseName} karaoke beat`.trim(),
        `${baseName} karaoke tone nữ`,
        `${baseName} karaoke tone nam`,
        `${baseName} karaoke phối mới`,
        `${baseName} karaoke remix`,
    ];

    const allResults = [];
    const seenIds = new Set();

    const searchPromises = queries.map(async (q) => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);
            const res = await fetch(
                `/api/yt/search?q=${encodeURIComponent(q)}`,
                { signal: controller.signal }
            );
            clearTimeout(timeoutId);
            if (!res.ok) return [];
            return await res.json();
        } catch {
            return [];
        }
    });

    const results = await Promise.all(searchPromises);

    for (const items of results) {
        for (const item of items) {
            const id = item.id || item.videoId;
            if (!id || seenIds.has(id)) continue;
            seenIds.add(id);

            const title = (item.title || '').toLowerCase();

            // STRICT RELEVANCE CHECK: Result title must contain the base song name
            const normalizedTitle = normalizeForMatch(item.title);
            if (!normalizedTitle.includes(normalizedBase)) {
                // Try word-based matching if full inclusion fails (handle minor variations)
                const baseWords = normalizedBase.split(/\s+/).filter(w => w.length > 2);
                const titleWords = normalizedTitle.split(/\s+/);
                const matchCount = baseWords.filter(w => titleWords.includes(w)).length;

                // Must match at least 80% of significant words (length > 2)
                if (baseWords.length > 0 && (matchCount / baseWords.length) < 0.8) {
                    continue;
                }
            }

            const isKaraoke = ['karaoke', 'beat', 'instrumental', 'nhạc sống', 'phối'].some(k => title.includes(k));
            if (!isKaraoke) continue;

            let beatLabel = 'Beat karaoke';
            if (title.includes('tone nữ') || title.includes('tone nu')) beatLabel = 'Beat tone nữ';
            else if (title.includes('tone nam')) beatLabel = 'Beat tone nam';
            else if (title.includes('phối mới') || title.includes('phoi moi')) beatLabel = 'Beat phối mới';
            else if (title.includes('nhạc sống')) beatLabel = 'Nhạc sống';
            else if (title.includes('remix')) beatLabel = 'Remix';
            else if (title.includes('song ca')) beatLabel = 'Song ca';

            allResults.push({
                videoId: id,
                title: item.title,
                cleanTitle: item.cleanTitle || item.title,
                thumbnail: item.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
                channel: item.artist || item.channelTitle || 'YouTube',
                artist: item.artist || '',
                viewCount: item.viewCount || 0,
                views: item.views || '0',
                duration: item.duration || '',
                beatLabel,
            });
        }
    }

    // Sort by views but keep the original video at top if applicable
    allResults.sort((a, b) => b.viewCount - a.viewCount);

    // Pin the original track at position 0
    if (originalVideoId) {
        const originalIdx = allResults.findIndex(r => r.videoId === originalVideoId);
        if (originalIdx >= 0) {
            const [original] = allResults.splice(originalIdx, 1);
            original.beatLabel = 'Bản đang chọn';
            allResults.unshift(original);
        }
    }

    const finalResults = allResults.slice(0, 15); // Show even more results for variety
    beatCache.set(cacheKey, finalResults);
    return finalResults;
}
