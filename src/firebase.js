import { initializeApp } from 'firebase/app';
import { getDatabase, ref, push, onValue, get, set, update } from 'firebase/database';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
};

let database = null;
let firebaseReady = false;

try {
    if (firebaseConfig.databaseURL) {
        const app = initializeApp(firebaseConfig);
        database = getDatabase(app);
        firebaseReady = true;
    } else {
        console.warn('[Firebase] databaseURL not configured. Running in offline mode.');
    }
} catch (err) {
    console.error('[Firebase] Init failed:', err.message);
}

export { firebaseReady };

// --- Device Identity ---

const DEVICE_ID_KEY = 'karaoke_device_id';

function getDeviceId() {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
        id = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
}

// --- Queue Logic (mirrors main app's queueLogic.js exactly) ---

function parseSongs(songs) {
    if (!songs) return [];
    if (Array.isArray(songs)) return [...songs];
    return Object.values(songs);
}

function globalNextRound(customerQueues) {
    const rounds = [];
    for (const data of Object.values(customerQueues || {})) {
        const songs = parseSongs(data.songs);
        const normalSongs = songs.filter(s => !s.isPriority);
        if (normalSongs.length > 0) {
            rounds.push(data.startRound || 1);
        }
    }
    return rounds.length > 0 ? Math.min(...rounds) : 1;
}

function generatePlayQueue(customerQueues) {
    if (!customerQueues || Object.keys(customerQueues).length === 0) return [];

    const prioritySongs = [];
    const customers = [];

    for (const [id, data] of Object.entries(customerQueues)) {
        const songs = parseSongs(data.songs);
        const pSongs = songs.filter(s => s.isPriority);
        const nSongs = songs.filter(s => !s.isPriority)
            .sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));

        for (const s of pSongs) {
            prioritySongs.push({
                ...s,
                customerId: id,
                customerName: data.name,
                isPriority: true,
                firebaseKey: s.id || s.firebaseKey,
                status: s.status || (s.videoId ? 'ready' : 'waiting'),
            });
        }

        if (nSongs.length > 0) {
            customers.push({
                id,
                name: data.name,
                firstOrderTime: data.firstOrderTime || 0,
                startRound: data.startRound || 1,
                songs: nSongs,
            });
        }
    }

    prioritySongs.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
    customers.sort((a, b) => a.firstOrderTime - b.firstOrderTime);

    if (customers.length === 0) return prioritySongs;

    const minRound = Math.min(...customers.map(c => c.startRound));
    const maxRound = Math.max(...customers.map(c => c.startRound + c.songs.length - 1));

    const rrQueue = [];
    for (let round = minRound; round <= maxRound; round++) {
        for (const customer of customers) {
            const songIndex = round - customer.startRound;
            if (songIndex >= 0 && songIndex < customer.songs.length) {
                const song = customer.songs[songIndex];
                rrQueue.push({
                    ...song,
                    customerId: customer.id,
                    customerName: customer.name,
                    round,
                    originalSongIndex: songIndex,
                    firebaseKey: song.id || song.firebaseKey || `${customer.id}_${songIndex}`,
                    status: song.status || (song.videoId ? 'ready' : 'waiting'),
                });
            }
        }
    }

    return [...prioritySongs, ...rrQueue];
}

// --- Sync playQueue from customerQueues ---

async function syncPlayQueue() {
    if (!firebaseReady || !database) return;
    try {
        const snapshot = await get(ref(database, 'customerQueues'));
        const customerQueues = snapshot.val() || {};
        const newQueue = generatePlayQueue(customerQueues);
        await set(ref(database, 'playQueue'), newQueue.length > 0 ? newQueue : null);
    } catch (e) {
        console.error('[Firebase] Failed to sync play queue:', e);
    }
}

// --- Actions ---

export async function addSongToQueue(song) {
    if (!firebaseReady || !database) {
        console.warn('[Firebase] Offline — cannot add song');
        return Promise.reject(new Error('Firebase not configured'));
    }

    const deviceId = getDeviceId();
    const customerRef = ref(database, `customerQueues/${deviceId}`);
    const snapshot = await get(customerRef);
    const customerData = snapshot.val();
    const now = Date.now();

    // Read all customerQueues to compute fair startRound (NOT from playQueue)
    const allSnapshot = await get(ref(database, 'customerQueues'));
    const allQueues = allSnapshot.val() || {};
    const nextRound = globalNextRound(allQueues);

    if (!customerData) {
        // Brand new customer → join at current active round
        await update(customerRef, {
            name: song.addedBy || 'Khách mới',
            firstOrderTime: now,
            startRound: nextRound,
        });
    } else {
        // Existing customer — check if they have any remaining normal songs
        const songs = customerData.songs ? Object.values(customerData.songs) : [];
        const hasNormalSongs = songs.some(s => !s.isPriority);

        if (!hasNormalSongs) {
            // Returning customer → bump startRound
            const bumped = Math.max(customerData.startRound || 1, nextRound);
            await update(customerRef, { startRound: bumped, name: song.addedBy });
        } else {
            await update(customerRef, { name: song.addedBy });
        }
    }

    // Add song
    const songsRef = ref(database, `customerQueues/${deviceId}/songs`);
    const newSongRef = push(songsRef);
    const newSongKey = newSongRef.key;

    await set(newSongRef, {
        id: newSongKey,
        videoId: song.videoId || '',
        title: song.title,
        cleanTitle: song.cleanTitle || song.title,
        artist: song.artist || '',
        addedBy: song.addedBy || 'Khách',
        thumbnail: song.thumbnail || '',
        addedAt: now,
        isPriority: false,
        source: 'web',
    });

    await syncPlayQueue();
    return { key: newSongKey };
}

export async function addReservation(guestName) {
    if (!firebaseReady || !database) {
        console.warn('[Firebase] Offline — cannot add reservation');
        return Promise.reject(new Error('Firebase not configured'));
    }

    const deviceId = getDeviceId();
    const customerRef = ref(database, `customerQueues/${deviceId}`);
    const snapshot = await get(customerRef);
    const customerData = snapshot.val();
    const now = Date.now();

    const allSnapshot = await get(ref(database, 'customerQueues'));
    const allQueues = allSnapshot.val() || {};
    const nextRound = globalNextRound(allQueues);

    if (!customerData) {
        await update(customerRef, {
            name: guestName || 'Khách mới',
            firstOrderTime: now,
            startRound: nextRound,
        });
    } else {
        const songs = customerData.songs ? Object.values(customerData.songs) : [];
        const hasNormalSongs = songs.some(s => !s.isPriority);
        if (!hasNormalSongs) {
            const bumped = Math.max(customerData.startRound || 1, nextRound);
            await update(customerRef, { startRound: bumped, name: guestName });
        } else {
            await update(customerRef, { name: guestName });
        }
    }

    const songsRef = ref(database, `customerQueues/${deviceId}/songs`);
    const newSongRef = push(songsRef);
    const newSongKey = newSongRef.key;

    await set(newSongRef, {
        id: newSongKey,
        videoId: null,
        title: null,
        cleanTitle: null,
        artist: null,
        addedBy: guestName || 'Khách',
        thumbnail: null,
        addedAt: now,
        isPriority: false,
        source: 'web',
        status: 'waiting',
    });

    await syncPlayQueue();

    // Save slot ID to localStorage for ownership tracking
    const mySlots = JSON.parse(localStorage.getItem('karaoke_mySlots') || '[]');
    mySlots.push(newSongKey);
    localStorage.setItem('karaoke_mySlots', JSON.stringify(mySlots));

    return { key: newSongKey };
}

export async function updateSlotWithSong(songId, songData) {
    if (!firebaseReady || !database || !songId) return;

    const deviceId = getDeviceId();
    const songRef = ref(database, `customerQueues/${deviceId}/songs/${songId}`);
    const snapshot = await get(songRef);
    if (!snapshot.exists()) return;

    await update(songRef, {
        videoId: songData.videoId,
        title: songData.title,
        cleanTitle: songData.cleanTitle || songData.title,
        artist: songData.artist || '',
        thumbnail: songData.thumbnail || '',
        status: 'ready',
    });

    await syncPlayQueue();
}

// --- Listeners ---

export function listenToQueue(callback) {
    if (!firebaseReady || !database) {
        callback([]);
        return () => { };
    }
    // Listen to the generated playQueue (new system)
    return onValue(ref(database, 'playQueue'), (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            callback([]);
            return;
        }
        // playQueue is stored as array (numeric keys) or null
        const items = Object.values(data).map(item => ({
            ...item,
            id: item.firebaseKey || item.id,
        }));
        callback(items);
    });
}

export function listenToNowPlaying(callback) {
    if (!firebaseReady || !database) {
        callback(null);
        return () => { };
    }
    return onValue(ref(database, 'nowPlaying'), (snapshot) => {
        callback(snapshot.val() || null);
    });
}
