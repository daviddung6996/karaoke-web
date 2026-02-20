import { useState, useEffect, useRef } from 'react';
import { IconMic, IconMusic, IconSearch, IconList, IconPlus, IconX, IconCheck, IconPlay, IconStar, IconLoader } from './Icons';
import { addSongToQueue, addReservation, updateSlotWithSong, listenToQueue, listenToNowPlaying, startBeatChange, confirmBeatChange, cancelBeatChange } from './firebase';
import { searchVideos, formatViews } from './videoSearch';
import { useSuggestions } from './useSuggestions';
import SuggestDropdown from './SuggestDropdown';
import { useNameSuggestions } from './useNameSuggestions';
import BeatSelectionModal from './BeatSelectionModal';

const QUICK_TAGS = {
  'Trữ Tình & Bolero': ['Bolero', 'Nhạc Sống', 'Tân Cổ', 'Vọng Cổ', 'Trữ Tình Quê Hương', 'Nhạc Vàng', 'Bolero Remix', 'LK Bolero'],
  'Ca Sĩ Bolero': ['Tuấn Vũ', 'Giao Linh', 'Chế Linh', 'Thanh Tuyền', 'Hương Lan', 'Phi Nhung', 'Quang Lê', 'Lệ Quyên', 'Đan Nguyên', 'Thiên Quang', 'Phương Mỹ Chi'],
  'Ca Sĩ Bất Hủ': ['Tuấn Ngọc', 'Khánh Ly', 'Ngọc Sơn', 'Đàm Vĩnh Hưng', 'Như Quỳnh', 'Mỹ Tâm', 'Bằng Kiều', 'Lam Trường', 'Đan Trường', 'Cẩm Ly', 'Quang Dũng'],
  'Bài Hát Bất Hủ': ['Duyên Phận', 'Đêm Buồn Tỉnh Lẻ', 'Hai Lối Mộng', 'Tình Nhạt Phai', 'Xin Anh Giữ Trọn Tình Quê', 'Nỗi Buồn Hoa Phượng', 'Sầu Lẻ Bóng', 'Liên Khúc Nhạc Vàng'],
  'Nhạc Trẻ': ['Sơn Tùng', 'Jack', 'Mono', 'Hieuthuhai', 'Tăng Duy Tân', 'Hoàng Thùy Linh', 'Đức Phúc', 'Erik', 'Bích Phương', 'Min'],
};

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
  const [showReserveModal, setShowReserveModal] = useState(false);
  const [reserveName, setReserveName] = useState('');
  const [selectingSongForSlot, setSelectingSongForSlot] = useState(null); // slot ID being filled
  const [nameSelectedIndex, setNameSelectedIndex] = useState(-1); // For keyboard nav
  const [showBeatModal, setShowBeatModal] = useState(false);
  const [pendingTrack, setPendingTrack] = useState(null);
  const [selectedBeatOptions, setSelectedBeatOptions] = useState([]);
  const [showBeatChangeModal, setShowBeatChangeModal] = useState(false);

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

  const handleInteraction = () => {
    if (isFocused) {
      inputRef.current?.blur();
      setIsFocused(false);
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
      inputRef.current?.blur(); // Dismiss keyboard on enter
    }
  };

  const handleAddClick = (song) => {
    // If selecting song for an existing slot
    if (selectingSongForSlot) {
      handleSelectSongForSlot(song);
      return;
    }
    setPendingTrack(song);
    setShowBeatModal(true);
  };

  const handleBeatConfirm = (selectedBeat, beatOptions) => {
    setShowBeatModal(false);
    setSelectedSong(selectedBeat);
    setSelectedBeatOptions(beatOptions);
    if (savedName) {
      setGuestName(savedName);
      setIsEditingName(false);
    } else {
      setGuestName('');
      setIsEditingName(true);
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
        beatOptions: selectedBeatOptions.length > 0
          ? selectedBeatOptions.map(b => ({ videoId: b.videoId, title: b.title, thumbnail: b.thumbnail, beatLabel: b.beatLabel, viewCount: b.viewCount }))
          : null,
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
    inputRef.current?.blur();
    setQuery(tag);
    handleSearch(tag);
  };

  const handleReserve = async () => {
    const name = reserveName.trim() || savedName || 'Khách';
    try {
      await addReservation(name);
      setShowReserveModal(false);
      setReserveName('');
      setToast(`${name} đã giữ chỗ thành công!`);
      setTimeout(() => setToast(null), 2500);
      localStorage.setItem('karaoke_guest_name', name);
      setSavedName(name);
    } catch {
      setToast('Chưa kết nối được. Thử lại nhé!');
      setTimeout(() => setToast(null), 2500);
    }
  };

  const handleSelectSongForSlot = async (song) => {
    if (!selectingSongForSlot) return;
    try {
      await updateSlotWithSong(selectingSongForSlot, {
        videoId: song.videoId || '',
        title: song.title,
        cleanTitle: song.cleanTitle || song.title,
        artist: song.artist || '',
        thumbnail: song.thumbnail || '',
      });
      setSelectingSongForSlot(null);
      setToast(`Đã chọn bài "${song.cleanTitle || song.title}"`);
      setTimeout(() => setToast(null), 2500);
      setActiveTab('queue');
    } catch {
      setToast('Lỗi chọn bài. Thử lại nhé!');
      setTimeout(() => setToast(null), 2500);
    }
  };

  // ─── Beat Change (mid-song) ───
  const handleStartBeatChange = () => {
    if (!nowPlaying) return;
    const existingOptions = nowPlaying.beatOptions || [];
    setShowBeatChangeModal(true);
    startBeatChange(existingOptions).catch(() => {});
  };

  const handleBeatChangeConfirm = async (selectedBeat) => {
    setShowBeatChangeModal(false);
    if (!selectedBeat) return;
    await confirmBeatChange(selectedBeat).catch(() => {});
    setToast('Đã đổi beat thành công!');
    setTimeout(() => setToast(null), 2500);
  };

  const handleBeatChangeCancel = () => {
    setShowBeatChangeModal(false);
    cancelBeatChange().catch(() => {});
  };

  const mySlots = JSON.parse(localStorage.getItem('karaoke_mySlots') || '[]');

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
          {selectingSongForSlot && (
            <div className="slot-filling-banner">
              <span>🎵 Đang chọn bài cho chỗ đã giữ</span>
              <button onClick={() => setSelectingSongForSlot(null)} className="slot-filling-cancel">Hủy</button>
            </div>
          )}
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
              <div className="quick-tags-container" onTouchStart={handleInteraction}>
                {Object.entries(QUICK_TAGS).map(([category, tags]) => (
                  <div key={category} className="quick-tag-category">
                    <h3 className="category-title">{category}</h3>
                    <div className="quick-tags-row">
                      {tags.map((tag) => (
                        <button key={tag} className="quick-tag" onClick={() => handleQuickTag(tag)}>{tag}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            className="results-area"
            onTouchStart={handleInteraction}
            onScroll={handleInteraction}
          >
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
              <button className="btn-reserve" style={{ marginTop: '12px' }} onClick={() => {
                if (savedName) setReserveName(savedName);
                setShowReserveModal(true);
              }}>
                <IconPlus /> Giữ chỗ trước
              </button>
            </div>
          ) : (
            <div className="queue-list">
              {/* Reserve slot button */}
              <button className="btn-reserve" onClick={() => {
                if (savedName) {
                  setReserveName(savedName);
                }
                setShowReserveModal(true);
              }}>
                <IconPlus /> Giữ chỗ (không cần chọn bài ngay)
              </button>

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
                  {savedName && nowPlaying.addedBy === savedName && (
                    <button className="btn-change-beat" onClick={handleStartBeatChange}>
                      🎵 Đổi beat
                    </button>
                  )}
                </div>
              )}
              {queue.map((item, i) => {
                const isMySlot = mySlots.includes(item.id);
                const isWaiting = item.status === 'waiting' || (!item.videoId && !item.title);
                const isSkipped = item.status === 'skipped';
                return (
                  <div key={item.id || i} className={`queue-card ${i === 0 ? 'queue-card-next' : ''} ${isWaiting ? 'queue-card-waiting' : ''} ${isSkipped ? 'queue-card-skipped' : ''} ${item.wasSkipped && !isSkipped && !isWaiting ? 'queue-card-was-skipped' : ''}`} style={{ animationDelay: `${i * 30}ms` }}>
                    <div className="queue-number">{i + 1}</div>
                    <div className="queue-info">
                      <h3 className={`queue-title ${isWaiting ? 'queue-title-waiting' : ''}`}>
                        {isWaiting ? `⏳ Chờ chọn bài` : (item.cleanTitle || item.title)}
                      </h3>
                      <p className="queue-meta">
                        <span className="queue-singer">{item.addedBy}</span>
                        {!isWaiting && item.artist && <span className="queue-artist">• {item.artist}</span>}
                      </p>
                      {isWaiting && isMySlot && (
                        <button
                          className="btn-choose-song"
                          onClick={() => {
                            setSelectingSongForSlot(item.id);
                            setActiveTab('search');
                          }}
                        >
                          🎵 Chọn bài ngay
                        </button>
                      )}
                    </div>
                    {isSkipped ? (
                      <div className="skipped-badge">Đã bỏ qua</div>
                    ) : i === 0 ? (
                      <div className="next-badge"><IconPlay /> Sắp hát</div>
                    ) : (
                      <div className="queue-position">#{i + 1}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Beat Selection Modal (new song) */}
      <BeatSelectionModal
        isOpen={showBeatModal}
        onClose={() => setShowBeatModal(false)}
        onConfirm={handleBeatConfirm}
        track={pendingTrack}
      />

      {/* Beat Change Modal (mid-song) */}
      <BeatSelectionModal
        isOpen={showBeatChangeModal}
        onClose={handleBeatChangeCancel}
        onConfirm={(selectedBeat) => handleBeatChangeConfirm(selectedBeat)}
        track={nowPlaying}
      />

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

      {/* Reserve Modal */}
      {showReserveModal && (
        <div className="modal-overlay" onClick={() => setShowReserveModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h2 className="modal-title">Giữ chỗ</h2>
            <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '12px' }}>Giữ chỗ trong hàng chờ, chọn bài sau</p>
            <div className="modal-input-group">
              <label className="modal-label">Tên của bạn</label>
              <input
                type="text"
                placeholder="Ví dụ: Anh Tuấn, Chị Hoa..."
                value={reserveName}
                onChange={(e) => setReserveName(e.target.value)}
                className="modal-input"
                autoComplete="off"
              />
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowReserveModal(false)}>Hủy</button>
              <button className="btn-confirm" onClick={handleReserve} disabled={!reserveName.trim()}>Giữ chỗ</button>
            </div>
          </div>
        </div>
      )}

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
