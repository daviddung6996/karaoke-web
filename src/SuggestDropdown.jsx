import { useEffect, useRef } from 'react';
import { Search, Sparkles, Music, User } from 'lucide-react';

const SuggestDropdown = ({ suggestions, isLoading, onSelect, selectedIndex }) => {
    const listRef = useRef(null);

    // Auto-scroll logic
    useEffect(() => {
        if (selectedIndex >= 0 && listRef.current) {
            const selectedElement = listRef.current.children[selectedIndex];
            if (selectedElement) {
                selectedElement.scrollIntoView({
                    block: 'nearest',
                    behavior: 'smooth'
                });
            }
        }
    }, [selectedIndex]);

    if (!suggestions.length && !isLoading) return null;

    return (
        <div className="suggest-dropdown">
            {isLoading && !suggestions.length ? (
                <div className="suggest-loading">
                    <div className="suggest-spinner"></div>
                    <span className="suggest-loading-text">Đang tìm gợi ý...</span>
                </div>
            ) : (
                <div
                    ref={listRef}
                    className="suggest-list custom-scrollbar"
                >
                    {suggestions.map((item, index) => {
                        const isSelected = index === selectedIndex;
                        return (
                            <div
                                key={`${item.source}-${item.query}-${index}`}
                                className={`suggest-item ${isSelected ? 'selected' : ''}`}
                                onClick={() => onSelect(item.query)}
                            >
                                <div className={`suggest-icon-wrapper ${isSelected ? 'selected' : ''}`}>
                                    {item.source === 'ai' ? (
                                        <Sparkles size={16} />
                                    ) : item.source === 'history' ? (
                                        <Search size={16} />
                                    ) : (
                                        <Music size={16} />
                                    )}
                                </div>

                                <span className={`suggest-text ${isSelected ? 'selected' : ''}`}>
                                    {item.query}
                                </span>

                                {isSelected && (
                                    <span className="suggest-badge">
                                        ENTER
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default SuggestDropdown;
