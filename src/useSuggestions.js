import { useState, useRef, useCallback, useEffect } from 'react';

export const useSuggestions = (query, isFocused) => {
    const [suggestions, setSuggestions] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const abortControllerRef = useRef(null);
    const debounceTimeoutRef = useRef(null);

    const fetchLogic = useCallback(async (input) => {
        if (!input || input.trim().length < 2) {
            setSuggestions([]);
            setIsLoading(false);
            return;
        }

        const normalizedQuery = input.trim();
        setIsLoading(true);

        if (abortControllerRef.current) abortControllerRef.current.abort();
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        try {
            const res = await fetch(
                `/api/suggest?client=firefox&ds=yt&q=${encodeURIComponent(normalizedQuery)}`,
                { signal }
            );

            if (!res.ok) throw new Error('Suggest failed');

            // Firefox client returns clean JSON: ["query", ["s1", "s2", ...]]
            const data = await res.json();

            if (Array.isArray(data) && Array.isArray(data[1])) {
                const mapped = data[1]
                    .filter(s => typeof s === 'string')
                    .slice(0, 8)
                    .map(s => ({
                        query: s,
                        source: 'suggest'
                    }));
                if (!signal.aborted) {
                    setSuggestions(mapped);
                }
            }

            if (!signal.aborted) setIsLoading(false);
        } catch (e) {
            if (e.name !== 'AbortError') console.warn("Suggestion failed", e);
            if (!signal.aborted) {
                setSuggestions([]);
                setIsLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);

        if (!isFocused || !query || query.trim().length < 2) {
            setSuggestions([]);
            setIsLoading(false);
            return;
        }

        debounceTimeoutRef.current = setTimeout(() => {
            fetchLogic(query);
        }, 200);

        return () => {
            if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
            if (abortControllerRef.current) abortControllerRef.current.abort();
        };
    }, [query, isFocused, fetchLogic]);

    return { suggestions, isLoading };
};
