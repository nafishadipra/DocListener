import { useEffect, useMemo, useRef, useState } from 'react';
import type { TtsVoiceInfo } from '../../shared/types';

interface AudioSettingsProps {
  rate: number;
  voiceName: string;
  voices: TtsVoiceInfo[];
  onRateChange: (rate: number) => void;
  onVoiceChange: (voiceName: string) => void;
}

const SPEED_PRESETS = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

function formatVoiceLabel(name: string): string {
  return name.replace(/\s*\(Natural\)/i, ' · Natural').trim();
}

function getBrowserLanguagePrefix(): string {
  const lang = typeof navigator !== 'undefined' ? navigator.language : 'en';
  return (lang.split('-')[0] || 'en').toLowerCase();
}

export function AudioSettings({
  rate,
  voiceName,
  voices,
  onRateChange,
  onVoiceChange,
}: AudioSettingsProps) {
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showAllLanguages, setShowAllLanguages] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  const primaryLang = useMemo(() => getBrowserLanguagePrefix(), []);

  useEffect(() => {
    if (!isVoiceOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsVoiceOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsVoiceOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isVoiceOpen]);

  const filteredVoices = useMemo(() => {
    const query = search.trim().toLowerCase();

    return voices
      .filter((voice) => {
        if (!showAllLanguages && !query) {
          const voiceLang = voice.lang.toLowerCase();
          if (voiceLang && !voiceLang.startsWith(primaryLang)) {
            return false;
          }
        }
        if (query) {
          return (
            voice.name.toLowerCase().includes(query) ||
            voice.lang.toLowerCase().includes(query)
          );
        }
        return true;
      })
      .sort((a, b) => {
        const aNatural = a.name.toLowerCase().includes('natural') ? 1 : 0;
        const bNatural = b.name.toLowerCase().includes('natural') ? 1 : 0;
        if (aNatural !== bNatural) return bNatural - aNatural;
        if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [voices, search, showAllLanguages, primaryLang]);

  const selectedLabel = voiceName ? formatVoiceLabel(voiceName) : 'System default voice';

  return (
    <section
      aria-label="Audio settings"
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5"
    >
      {/* Speed selector */}
      <div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-700">Speed</span>
          <span className="text-xs font-semibold tabular-nums text-slate-900">
            {rate.toFixed(2).replace(/\.00$/, '.0')}×
          </span>
        </div>

        <div
          role="group"
          aria-label="Narration speed"
          className="mt-2 grid grid-cols-6 gap-1"
        >
          {SPEED_PRESETS.map((preset) => {
            const isSelected = Math.abs(rate - preset) < 0.01;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => onRateChange(preset)}
                aria-pressed={isSelected}
                className={`rounded-lg py-1.5 text-xs font-medium tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1 ${
                  isSelected
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {preset}×
              </button>
            );
          })}
        </div>
      </div>

      {/* Clean searchable voice picker */}
      <div ref={pickerRef} className="relative">
        <span className="block text-xs font-medium text-slate-700">Voice</span>

        <button
          type="button"
          onClick={() => setIsVoiceOpen((open) => !open)}
          aria-haspopup="listbox"
          aria-expanded={isVoiceOpen}
          className="mt-1.5 flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left text-xs text-slate-800 transition hover:border-slate-300 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
        >
          <span className="truncate">{selectedLabel}</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${
              isVoiceOpen ? 'rotate-180' : ''
            }`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {isVoiceOpen && (
          <div
            role="dialog"
            aria-label="Choose voice"
            className="absolute right-0 left-0 z-20 mt-1.5 rounded-xl border border-slate-200 bg-white p-2 shadow-lg shadow-slate-900/5"
          >
            <div className="flex items-center gap-1.5 border-b border-slate-100 pb-2">
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search voices…"
                autoFocus
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:bg-white focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowAllLanguages((prev) => !prev)}
                title={showAllLanguages ? 'Showing all languages' : `Showing ${primaryLang.toUpperCase()} voices`}
                className={`shrink-0 rounded-lg px-2 py-1.5 text-[11px] font-medium transition ${
                  showAllLanguages
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {showAllLanguages ? 'All' : primaryLang.toUpperCase()}
              </button>
            </div>

            <ul role="listbox" className="mt-1.5 max-h-52 space-y-0.5 overflow-y-auto">
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={voiceName === ''}
                  onClick={() => {
                    onVoiceChange('');
                    setIsVoiceOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                    voiceName === ''
                      ? 'bg-slate-100 font-semibold text-slate-900'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>System default voice</span>
                  {voiceName === '' && <span aria-hidden="true">✓</span>}
                </button>
              </li>

              {filteredVoices.map((voice) => {
                const isSelected = voice.name === voiceName;
                return (
                  <li key={voice.name}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onVoiceChange(voice.name);
                        setIsVoiceOpen(false);
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                        isSelected
                          ? 'bg-slate-100 font-semibold text-slate-900'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="truncate">{formatVoiceLabel(voice.name)}</span>
                      <span className="shrink-0 text-[10px] text-slate-400">
                        {voice.isLocal ? 'Local' : 'Network'}
                      </span>
                    </button>
                  </li>
                );
              })}

              {filteredVoices.length === 0 && (
                <li className="px-2 py-3 text-center text-xs text-slate-400">
                  No matching voices
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
