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

// --- Round-Robin Queue Generator (mirrors main app's queueLogic.js) ---

function generatePlayQueue(customerQueues) {
    const prioritySongs = [];
    const normalCustomerQueues = {};

    Object.entries(customerQueues).forEach(([id, data]) => {
        let songs = [];
        if (data.songs) {
            songs = Array.isArray(data.songs) ? [...data.songs] : Object.values(data.songs);
        }

        const pSongs = songs.filter(s => s.isPriority);
        const nSongs = songs.filter(s => !s.isPriority);

        if (pSongs.length > 0) {
            pSongs.forEach(s => prioritySongs.push({
                ...s,
                customerId: id,
                customerName: data.name,
                isPriority: true,
                firebaseKey: s.id || s.firebaseKey,
            }));
        }

        if (nSongs.length > 0) {
            normalCustomerQueues[id] = {
                ...data,
                songs: nSongs.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0)),
            };
        }
    });

    prioritySongs.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));

    const rrQueue = [];
    const customers = Object.entries(normalCustomerQueues)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => (a.firstOrderTime || 0) - (b.firstOrderTime || 0));

    let round = 1;
    let hasSongs = true;
    const customerIndices = {};
    customers.forEach(c => { customerIndices[c.id] = 0; });

    while (hasSongs) {
        hasSongs = false;
        for (const customer of customers) {
            const songs = customer.songs || [];
            const index = customerIndices[customer.id];
            if (index < songs.length) {
                const song = songs[index];
                rrQueue.push({
                    ...song,
                    customerId: customer.id,
                    customerName: customer.name,
                    round,
                    originalSongIndex: index,
                    firebaseKey: song.id || song.firebaseKey || `${customer.id}_${index}`,
                });
                customerIndices[customer.id]++;
                hasSongs = true;
            }
        }
        if (hasSongs) round++;
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
    let customerData = snapshot.val();

    const now = Date.now();

    // Init customer record if new
    if (!customerData) {
        customerData = { name: song.addedBy || 'Khách mới', firstOrderTime: now, songs: {} };
    }

    // Push new song under this customer
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

    // Update customer metadata
    if (!customerData.firstOrderTime) {
        await update(customerRef, { firstOrderTime: now, name: song.addedBy });
    } else {
        await update(customerRef, { name: song.addedBy });
    }

    // Regenerate playQueue
    await syncPlayQueue();

    return { key: newSongKey };
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
