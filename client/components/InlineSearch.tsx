import { useState, useRef, useEffect, type ReactNode } from 'react';
import './InlineSearch.css';

/* ── Inline SVG icons — no icon library dependency ─────────────────────── */

function SearchIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

/* ── Types ─────────────────────────────────────────────────────────────── */

export interface InlineSearchProps<T = unknown> {
  /** Called with debounced query string; should return search results */
  onSearch: (query: string) => Promise<T[]>;
  /** Render a single result item */
  renderResult: (item: T, index: number, isLast: boolean) => ReactNode;
  /** Called when user cancels / presses Escape */
  onClose: () => void;
  /** Placeholder text for the search input */
  placeholder?: string;
  /** Debounce delay in ms (default 300) */
  debounceMs?: number;
  /** Optional className on the container */
  className?: string;
  /** Extract a unique key from each result item (defaults to index) */
  getKey?: (item: T, index: number) => string | number;
  /** Custom empty-state message; receives the query string */
  emptyMessage?: (query: string) => ReactNode;
  /** Cancel button label (default "Cancel") */
  cancelLabel?: string;
}

/* ── Component ─────────────────────────────────────────────────────────── */

export default function InlineSearch<T = unknown>({
  onSearch,
  renderResult,
  onClose,
  placeholder = 'Search...',
  debounceMs = 300,
  className,
  getKey,
  emptyMessage,
  cancelLabel = 'Cancel',
}: InlineSearchProps<T>) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<T[] | null>(null);
  const [total, setTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      setTotal(0);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await onSearch(query.trim());
        setResults(res);
        setTotal(res.length);
      } catch {
        setResults([]);
        setTotal(0);
      } finally {
        setSearching(false);
      }
    }, debounceMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, debounceMs, onSearch]);

  const containerClass = ['is-container', className].filter(Boolean).join(' ');

  return (
    <div className={containerClass}>
      <div className="is-row">
        <div className="is-input-wrap">
          <SearchIcon size={16} className="is-search-icon" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="is-input"
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
            }}
          />
        </div>
        <button onClick={onClose} className="is-cancel">
          {cancelLabel}
        </button>
      </div>

      {query.trim() && (
        <p className="is-status">
          {searching
            ? 'Searching...'
            : results
              ? `${total} result${total !== 1 ? 's' : ''}`
              : ''}
        </p>
      )}

      {results && results.length > 0 && (
        <div className="is-results">
          <div className="is-card">
            {results.map((item, i) => (
              <div key={getKey ? getKey(item, i) : i}>
                {renderResult(item, i, i === results.length - 1)}
              </div>
            ))}
          </div>
        </div>
      )}

      {results && results.length === 0 && query.trim() && !searching && (
        <div className="is-empty">
          {emptyMessage
            ? emptyMessage(query)
            : <>No results matching &ldquo;{query}&rdquo;</>}
        </div>
      )}
    </div>
  );
}
