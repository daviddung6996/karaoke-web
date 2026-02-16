
import React from 'react';
import { Search, Sparkles } from 'lucide-react';

const SuggestDropdown = ({ suggestions, isLoading, onSelect, selectedIndex }) => {
    if (!suggestions.length && !isLoading) return null;

    return (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-slate-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
            {isLoading && !suggestions.length ? (
                <div className="p-4 flex items-center justify-center space-x-3">
                    <div className="animate-spin h-4 w-4 border-2 border-indigo-500 border-t-transparent rounded-full"></div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Đang tìm gợi ý...</span>
                </div>
            ) : (
                <div className="max-h-[300px] overflow-y-auto py-2">
                    {suggestions.map((item, index) => (
                        <div
                            key={index}
                            className={`px-4 py-3 flex items-center gap-3 cursor-pointer transition-colors ${index === selectedIndex ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50 text-slate-600'
                                }`}
                            onClick={() => onSelect(item.query)}
                        >
                            {item.source === 'ai' ? (
                                <Sparkles size={14} className="text-indigo-500" />
                            ) : (
                                <Search size={14} className="text-slate-400" />
                            )}
                            <span className="text-sm font-medium truncate">{item.query}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default SuggestDropdown;
