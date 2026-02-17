import { useState, useEffect, useRef } from 'react';
import { IconMic, IconMusic, IconSearch, IconList, IconPlus, IconX, IconCheck, IconPlay, IconStar, IconLoader } from './Icons';
import { addSongToQueue, listenToQueue, listenToNowPlaying } from './firebase';
import { searchVideos, formatViews } from './videoSearch';
import { useSuggestions } from './useSuggestions';
import SuggestDropdown from './SuggestDropdown';
import { useNameSuggestions } from './useNameSuggestions';

const QUICK_TAGS = ['Bolero', 'Sơn Tùng', 'Đàm Vĩnh Hưng', 'Như Quỳnh', 'Quang Lê', 'Jack'];

const formatTime = (s) => {
  if (!s || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

function NowPlayingProgress({ nowPlaying }) {
  const [progress, setProgress] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const duration = nowPlaying?.duration || 0;

  useEffect(() => {
    if (!duration || duration <= 0) { setProgress(0); setTimeLeft(0); return; }

    const calc = () => {
      // Use updatedAt + elapsed time since last sync for smooth interpolation
      const serverTime = nowPlaying.currentTime || 0;
      const updatedAt = nowPlaying.updatedAt || nowPlaying.startedAt || Date.now();
      const elapsed = (Date.now() - updatedAt) / 1000;
      const estimated = Math.min(serverTime + elapsed, duration);
      setCurrentTime(estimated);
      setProgress(Math.min((estimated / duration) * 100, 100));
      setTimeLeft(Math.max(duration - estimated, 0));
    };

    calc();
    const interval = setInterval(calc, 1000);
    return () => clearInterval(interval);
  }, [nowPlaying?.currentTime, nowPlaying?.updatedAt, duration]);

  if (!duration || duration <= 0) return null;

  const isAlmostDone = timeLeft > 0 && timeLeft <= 60;

  return (
    <div className="np-progress">
      <div className="np-progress-bar">
        <div className="np-progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="np-progress-info">
        <span className="np-time">{formatTime(currentTime)}</span>
        {isAlmostDone ? (
          <span className="np-time-left np-almost-done">Sắp xong!</span>
        ) : (
          <span className="np-time-left">còn {formatTime(timeLeft)}</span>
        )}
        <span className="np-time">{formatTime(duration)}</span>
      </div>
    </div>
  );
}

function App() {
  const [query, setQuery] = useState('');
  const [ytResults, setYtResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [queue, setQueue] = useState([]);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [guestName, setGuestName] = useState('');
  const [showNameModal, setShowNameModal] = useState(false);
  const [selectedSong, setSelectedSong] = useState(null);
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState('search');
  const [savedName, setSavedName] = useState(''); // Store persisted name
  const [isEditingName, setIsEditingName] = useState(false); // Toggle between modes
  const [nameSelectedIndex, setNameSelectedIndex] = useState(-1); // For keyboard nav

  // Name suggestions
  const nameSuggestions = useNameSuggestions(guestName);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const inputRef = useRef(null);
  const searchTimerRef = useRef(null);

  const { suggestions, isLoading: isSuggesting } = useSuggestions(query, isFocused);

  useEffect(() => {
    const unsubQueue = listenToQueue(setQueue);
    const unsubNP = listenToNowPlaying(setNowPlaying);
    return () => { unsubQueue(); unsubNP(); };
  }, []);

  // Load saved name on mount
  useEffect(() => {
    const saved = localStorage.getItem('karaoke_guest_name');
    if (saved) setSavedName(saved);
  }, []);

  const handleSearch = async (searchQuery) => {
    const q = searchQuery || query;
    if (!q.trim()) return;

    if (searchQuery) setQuery(searchQuery);

    setIsFocused(false);
    setSelectedIndex(-1);
    setIsSearching(true);

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    try {
      const videos = await searchVideos(q);
      setYtResults(videos);
    } catch (error) {
      console.error("Search failed", error);
      setYtResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e) => {
    if (!suggestions.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        handleSearch(suggestions[selectedIndex].query);
      } else {
        handleSearch();
      }
    }
  };

  const handleAddClick = (song) => {
    setSelectedSong(song);
    if (savedName) {
      setGuestName(savedName);
      setIsEditingName(false); // Show confirm screen
    } else {
      setGuestName('');
      setIsEditingName(true); // Show input screen
    }
    setShowNameModal(true);
  };

  const handleConfirm = async () => {
    if (!selectedSong) return;
    const name = guestName.trim() || 'Khách';
    try {
      await addSongToQueue({
        title: selectedSong.title,
        cleanTitle: selectedSong.cleanTitle || selectedSong.title,
        artist: selectedSong.artist,
        videoId: selectedSong.videoId || '',
        thumbnail: selectedSong.thumbnail || '',
        addedBy: name,
      });
      setShowNameModal(false);
      setSelectedSong(null);
      setToast(`Đã thêm "${selectedSong.cleanTitle || selectedSong.title}"`);
      setTimeout(() => setToast(null), 2500);

      // Update persistence
      localStorage.setItem('karaoke_guest_name', name);
      setSavedName(name);
    } catch {
      setToast('Chưa kết nối được. Thử lại nhé!');
      setTimeout(() => setToast(null), 2500);
    }
  };

  const handleQuickTag = (tag) => {
    setQuery(tag);
    handleSearch(tag);
    inputRef.current?.focus();
  };

  const handleNameKeyDown = (e) => {
    if (!showNameSuggestions || nameSuggestions.length === 0) {
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setNameSelectedIndex(prev => (prev < nameSuggestions.length - 1 ? prev + 1 : 0)); // Loop
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setNameSelectedIndex(prev => (prev > 0 ? prev - 1 : nameSuggestions.length - 1)); // Loop
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (nameSelectedIndex >= 0 && nameSuggestions[nameSelectedIndex]) {
        setGuestName(nameSuggestions[nameSelectedIndex]);
        setShowNameSuggestions(false);
        setNameSelectedIndex(-1);
      }
    } else if (e.key === 'Escape') {
      setShowNameSuggestions(false);
    }
  };

  // Reset index when suggestions change
  useEffect(() => {
    setNameSelectedIndex(-1);
  }, [guestName]);

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <img src="/logo.svg" alt="Logo" className="header-logo" />
          <div>
            <h1 className="header-title">Karaoke Sáu Nhàn</h1>
            <p className="header-sub">Chọn bài hát yêu thích</p>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav className="tabs">
        <button
          className={`tab ${activeTab === 'search' ? 'tab-active' : ''}`}
          onClick={() => { setActiveTab('search'); setTimeout(() => inputRef.current?.focus(), 50); }}
        >
          <IconSearch size={14} />
          Tìm Bài
        </button>
        <button
          className={`tab ${activeTab === 'queue' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('queue')}
        >
          <IconList size={14} />
          Hàng Chờ
          {(queue.length > 0 || nowPlaying) && <span className="badge">{queue.length + (nowPlaying ? 1 : 0)}</span>}
        </button>
      </nav>

      {/* Search Tab */}
      {activeTab === 'search' && (
        <div className="content">
          <div className="search-section">
            <div className="search-box-container" style={{ position: 'relative' }}>
              <div className="search-box">
                <span className="search-icon"><IconSearch size={15} /></span>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Tên bài hát hoặc ca sĩ..."
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelectedIndex(-1);
                    if (!isFocused) setIsFocused(true);
                  }}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                  className="search-input"
                  autoFocus
                  enterKeyHint="search"
                />
                {query && (
                  <button className="clear-btn" onClick={() => { setQuery(''); setYtResults([]); inputRef.current?.focus(); }}>
                    <IconX />
                  </button>
                )}
              </div>

              {/* Suggestions Dropdown */}
              {isFocused && query.trim().length >= 2 && (
                <SuggestDropdown
                  suggestions={suggestions}
                  isLoading={isSuggesting}
                  onSelect={handleSearch}
                  selectedIndex={selectedIndex}
                />
              )}
            </div>

            {!query && (
              <div className="quick-tags">
                {QUICK_TAGS.map((tag) => (
                  <button key={tag} className="quick-tag" onClick={() => handleQuickTag(tag)}>{tag}</button>
                ))}
              </div>
            )}
          </div>

          <div className="results-area">
            {/* Empty State */}
            {!query && (
              <div className="empty-state">
                <div className="empty-icon"><IconMusic /></div>
                <p>Nhập tên bài hát để tìm</p>
                <p className="empty-hint">Hoặc chọn nhanh ca sĩ ở trên</p>
              </div>
            )}

            {query && ytResults.length === 0 && !isSearching && (
              <div className="empty-state">
                <div className="empty-icon"><IconMusic /></div>
                <p>Không tìm thấy bài hát</p>
                <p className="empty-hint">Thử tên khác hoặc tên ca sĩ nhé</p>
              </div>
            )}

            {/* YouTube Results */}
            {isSearching && (
              <div className="section-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <IconLoader /> Đang tìm trên YouTube...
              </div>
            )}

            {ytResults.length > 0 && (
              <div className="result-section">
                <div className="section-label">YouTube Karaoke</div>
                {ytResults.map((video, i) => (
                  <div
                    key={video.videoId || video.id || i}
                    className="yt-card"
                    onClick={() => handleAddClick(video)}
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    {/* Thumbnail */}
                    <div className="yt-thumb">
                      {video.thumbnail ? (
                        <img src={video.thumbnail} alt="" loading="lazy" />
                      ) : (
                        <div className="yt-thumb-placeholder"><IconMusic /></div>
                      )}
                      {video.duration && <span className="yt-duration">{video.duration}</span>}
                    </div>

                    {/* Info */}
                    <div className="yt-info">
                      <h3 className="yt-title">{video.cleanTitle || video.title}</h3>

                      <div className="yt-meta-row">
                        {video.score > 50000 && (
                          <span className="yt-badge-ngon">
                            <IconStar /> NGON
                          </span>
                        )}
                        {video.views && (
                          <span className="yt-views">{formatViews(video.viewCount)} lượt xem</span>
                        )}
                      </div>

                      <div className="yt-tags-row">
                        {video.tags && video.tags.slice(0, 3).map((tag, j) => (
                          <span key={j} className={`yt-tag ${tag.includes('Tone') ? 'yt-tag-tone' : tag === 'Remix' ? 'yt-tag-remix' : ''}`}>
                            {tag}
                          </span>
                        ))}
                      </div>

                      <div className="yt-artist-row">
                        <span className="yt-artist-dot" />
                        <span className="yt-artist">{video.artist}</span>
                      </div>
                    </div>

                    <button className="add-btn-yt" aria-label="Thêm">
                      <IconPlus />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Queue Tab */}
      {activeTab === 'queue' && (
        <div className="content">
          {!nowPlaying && queue.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><IconList size={32} /></div>
              <p>Chưa có bài nào</p>
              <p className="empty-hint">Chuyển sang "Tìm Bài" để chọn nhé!</p>
            </div>
          ) : (
            <div className="queue-list">
              {nowPlaying && (
                <div className="queue-card now-playing-card">
                  <div className="np-top-row">
                    <div className="now-playing-icon">🎤</div>
                    <div className="queue-info">
                      <h3 className="queue-title">{nowPlaying.cleanTitle || nowPlaying.title}</h3>
                      <p className="queue-meta">
                        <span className="queue-singer">{nowPlaying.addedBy}</span>
                        {nowPlaying.artist && <span className="queue-artist">• {nowPlaying.artist}</span>}
                      </p>
                    </div>
                    <div className="now-playing-badge">Đang hát</div>
                  </div>
                  <NowPlayingProgress nowPlaying={nowPlaying} />
                </div>
              )}
              {queue.map((item, i) => (
                <div key={item.id || i} className={`queue-card ${i === 0 ? 'queue-card-next' : ''}`} style={{ animationDelay: `${i * 30}ms` }}>
                  <div className="queue-number">{i + 1}</div>
                  <div className="queue-info">
                    <h3 className="queue-title">{item.cleanTitle || item.title}</h3>
                    <p className="queue-meta">
                      <span className="queue-singer">{item.addedBy}</span>
                      {item.artist && <span className="queue-artist">• {item.artist}</span>}
                    </p>
                  </div>
                  {i === 0 ? (
                    <div className="next-badge"><IconPlay /> Sắp hát</div>
                  ) : (
                    <div className="queue-position">#{i + 1}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Name Modal */}
      {showNameModal && (
        <div className="modal-overlay" onClick={() => { setShowNameModal(false); setGuestName(''); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h2 className="modal-title">{isEditingName ? 'Đặt bài hát' : 'Xác nhận'}</h2>
            <div className="modal-song">
              <p className="modal-song-title">{selectedSong?.cleanTitle || selectedSong?.title}</p>
              <p className="modal-song-artist">{selectedSong?.artist}</p>
            </div>

            {isEditingName ? (
              <div className="modal-input-group">
                <label className="modal-label">Tên của bạn</label>
                <div className="input-wrapper">
                  <input
                    type="text"
                    placeholder="Ví dụ: Anh Tuấn, Chị Hoa..."
                    value={guestName}
                    onChange={(e) => {
                      setGuestName(e.target.value);
                      setShowNameSuggestions(true);
                    }}
                    onFocus={() => setShowNameSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowNameSuggestions(false), 200)}
                    className="modal-input"
                    style={{ paddingRight: '48px' }}
                    autoComplete="off"
                    onKeyDown={handleNameKeyDown}
                  />
                  {guestName.trim() && (
                    <button className="input-submit-btn" onClick={handleConfirm} title="Xác nhận">
                      <IconCheck />
                    </button>
                  )}
                  {showNameSuggestions && nameSuggestions.length > 0 && (
                    <div className="name-suggestions">
                      {nameSuggestions.map((name, i) => (
                        <div
                          key={i}
                          className={`name-suggestion-item ${i === nameSelectedIndex ? 'active' : ''}`}
                          onClick={() => {
                            setGuestName(name);
                            setShowNameSuggestions(false);
                          }}
                        >
                          {name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="modal-confirm-group">
                <p className="confirm-label">Hát với tên:</p>
                <h3 className="confirm-name">{savedName}</h3>
                <button
                  className="btn-change-name"
                  onClick={() => {
                    setIsEditingName(true);
                    setGuestName('');
                  }}
                >
                  Đổi tên khác
                </button>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => { setShowNameModal(false); setGuestName(''); }}>Hủy</button>
              <button className="btn-confirm" onClick={handleConfirm}>
                {isEditingName ? 'Thêm vào hàng chờ' : 'Đồng ý'}
              </button>
            </div>
          </div>
        </div>
      )
      }

      {/* Toast */}
      {
        toast && (
          <div className="toast"><IconCheck /><span>{toast}</span></div>
        )
      }
    </div >
  );
}

export default App;
