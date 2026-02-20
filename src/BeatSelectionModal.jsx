import { useState, useEffect } from 'react';
import { IconCheck, IconX } from './Icons';
import { searchBeatVariants } from './beatSearch';
import { formatViews } from './videoSearch';

function BeatSelectionModal({ isOpen, onClose, onConfirm, track }) {
    const [beatOptions, setBeatOptions] = useState([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!isOpen || !track) return;

        setIsLoading(true);
        setBeatOptions([]);
        setSelectedIndex(0);

        searchBeatVariants(track.cleanTitle || track.title, track.artist, track.videoId)
            .then((results) => {
                if (results.length > 0) {
                    setBeatOptions(results);
                } else {
                    setBeatOptions([{
                        videoId: track.videoId,
                        title: track.title,
                        cleanTitle: track.cleanTitle || track.title,
                        thumbnail: track.thumbnail,
                        artist: track.artist,
                        viewCount: track.viewCount || 0,
                        views: track.views || '0',
                        duration: track.duration || '',
                        beatLabel: 'Beat gốc',
                    }]);
                }
            })
            .finally(() => setIsLoading(false));
    }, [isOpen, track]);

    const handleConfirm = () => {
        const selectedBeat = beatOptions[selectedIndex];
        if (!selectedBeat) return;
        onConfirm(selectedBeat, beatOptions);
    };

    const handleSkip = () => {
        if (!track) return;
        onConfirm({
            videoId: track.videoId,
            title: track.title,
            cleanTitle: track.cleanTitle || track.title,
            thumbnail: track.thumbnail,
            artist: track.artist,
            viewCount: track.viewCount || 0,
            views: track.views || '0',
            duration: track.duration || '',
            beatLabel: 'Beat gốc',
        }, []);
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-handle" />
                <h2 className="modal-title">Chọn Beat</h2>

                <div className="beat-modal-song">
                    <p className="beat-modal-song-label">Chọn beat cho</p>
                    <p className="beat-modal-song-title">{track?.cleanTitle || track?.title}</p>
                    {track?.artist && <p className="beat-modal-song-artist">{track.artist}</p>}
                </div>

                {isLoading && (
                    <div className="beat-loading">
                        <div className="beat-loading-spinner" />
                        <p className="beat-loading-text">Đang tìm beat...</p>
                    </div>
                )}

                {!isLoading && beatOptions.length > 0 && (
                    <div className="beat-list">
                        {beatOptions.map((beat, index) => (
                            <div
                                key={beat.videoId}
                                className={`beat-item ${index === selectedIndex ? 'selected' : ''}`}
                                onClick={() => setSelectedIndex(index)}
                            >
                                <div className="beat-thumb">
                                    <img src={beat.thumbnail} alt="" loading="lazy" />
                                </div>
                                <div className="beat-info">
                                    <p className="beat-label">{beat.beatLabel}</p>
                                    <p className="beat-title">{beat.title}</p>
                                    <p className="beat-meta">
                                        {beat.artist}
                                        {beat.viewCount > 0 && ` · ${formatViews(beat.viewCount)} views`}
                                    </p>
                                </div>
                                {index === selectedIndex && (
                                    <div className="beat-check">
                                        <IconCheck />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                <div className="modal-actions">
                    <button className="beat-skip-btn" onClick={handleSkip}>Bỏ qua</button>
                    <button
                        className="btn-confirm"
                        onClick={handleConfirm}
                        disabled={isLoading || beatOptions.length === 0}
                    >
                        Xác nhận beat
                    </button>
                </div>
            </div>
        </div>
    );
}

export default BeatSelectionModal;
