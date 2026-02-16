import { initializeApp } from 'firebase/app';
import { getDatabase, ref, push, onValue } from 'firebase/database';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
};

let database = null;
let queueRef = null;
let firebaseReady = false;

try {
    if (firebaseConfig.databaseURL) {
        const app = initializeApp(firebaseConfig);
        database = getDatabase(app);
        queueRef = ref(database, 'queue');
        firebaseReady = true;
    } else {
        console.warn('[Firebase] databaseURL not configured. Running in offline mode.');
    }
} catch (err) {
    console.error('[Firebase] Init failed:', err.message);
}

export { firebaseReady };

export function addSongToQueue(song) {
    if (!firebaseReady) {
        console.warn('[Firebase] Offline — cannot add song');
        return Promise.reject(new Error('Firebase not configured'));
    }
    return push(queueRef, {
        videoId: song.videoId || '',
        title: song.title,
        cleanTitle: song.cleanTitle || song.title,
        artist: song.artist || '',
        addedBy: song.addedBy || 'Khách',
        thumbnail: song.thumbnail || '',
        addedAt: Date.now(),
        source: 'web',
    });
}

export function listenToQueue(callback) {
    if (!firebaseReady) {
        callback([]);
        return () => { };
    }
    return onValue(queueRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            callback([]);
            return;
        }
        const items = Object.entries(data).map(([key, val]) => ({
            ...val,
            id: key,
        }));
        // Sort: priority items first (higher priorityOrder = more recent = first),
        // then normal items by addedAt ascending (FIFO)
        items.sort((a, b) => {
            const aPri = a.priorityOrder || 0;
            const bPri = b.priorityOrder || 0;
            if (aPri > 0 && bPri > 0) return bPri - aPri;
            if (aPri > 0) return -1;
            if (bPri > 0) return 1;
            return (a.addedAt || 0) - (b.addedAt || 0);
        });
        callback(items);
    });
}

export function listenToNowPlaying(callback) {
    if (!firebaseReady) {
        callback(null);
        return () => { };
    }
    const npRef = ref(database, 'nowPlaying');
    return onValue(npRef, (snapshot) => {
        callback(snapshot.val() || null);
    });
}
