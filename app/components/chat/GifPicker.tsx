import React, { useCallback, useEffect, useRef, useState } from "react";
import Modal from "~/components/ui/Modal";

export interface GifSelection {
  id: string;
  url: string;
  title: string;
}

interface GifItem {
  id: string;
  title: string;
  previewUrl: string;
  url: string;
}

interface GifPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (gif: GifSelection) => void;
}

const SEARCH_DEBOUNCE_MS = 400;

export default function GifPicker({ isOpen, onClose, onSelect }: GifPickerProps) {
  const [search, setSearch] = useState("");
  const [gifs, setGifs] = useState<GifItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadGifs = useCallback(async (query: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());

      const res = await fetch(`/api/chat-gifs?${params}`, { signal: controller.signal });
      const data = await res.json();

      if (controller.signal.aborted) return;

      if (!res.ok) {
        setError(data.error ?? "Failed to load GIFs");
        setGifs([]);
        return;
      }

      if (data.configured === false) {
        setNotConfigured(true);
        setGifs([]);
        return;
      }

      setNotConfigured(false);
      setGifs(data.gifs ?? []);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Failed to load GIFs");
      setGifs([]);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    setSearch("");
    setError(null);
    setNotConfigured(false);
    loadGifs("");
  }, [isOpen, loadGifs]);

  useEffect(() => {
    if (!isOpen) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      loadGifs(search);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, isOpen, loadGifs]);

  useEffect(() => {
    if (!isOpen) {
      abortRef.current?.abort();
    }
  }, [isOpen]);

  const handleSelect = (gif: GifItem) => {
    onSelect({ id: gif.id, url: gif.url, title: gif.title });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Choose a GIF" size="lg">
      <div className="flex flex-col gap-3 -mt-1">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search GIFs..."
          aria-label="Search GIFs"
          className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-night text-secondary dark:text-alabaster focus:outline-none focus:ring-2 focus:ring-primary/50"
        />

        {loading && gifs.length === 0 && (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-primary" />
          </div>
        )}

        {notConfigured && (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">
            GIF search is not configured yet. Ask your admin to add{" "}
            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
              GIPHY_API_KEY
            </code>{" "}
            to the server environment.
          </p>
        )}

        {error && !notConfigured && (
          <p className="text-sm text-red-500 text-center py-4">{error}</p>
        )}

        {!notConfigured && gifs.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[50vh] overflow-y-auto pr-1">
            {gifs.map((gif) => (
              <button
                key={gif.id}
                type="button"
                onClick={() => handleSelect(gif)}
                className="relative aspect-square overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800 hover:ring-2 hover:ring-primary focus:outline-none focus:ring-2 focus:ring-primary transition-shadow"
                title={gif.title}
              >
                <img
                  src={gif.previewUrl}
                  alt={gif.title || "GIF"}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}

        {!loading && !notConfigured && !error && gifs.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-8">No GIFs found.</p>
        )}

        <div className="flex justify-center pt-2 border-t border-gray-100 dark:border-gray-700">
          <a
            href="https://giphy.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <span>Powered by GIPHY</span>
          </a>
        </div>
      </div>
    </Modal>
  );
}
