"use client";

interface CrossfaderProps {
  /** 0 = full deck A, 1 = full deck B */
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

/**
 * DJ crossfader slider — horizontal, styled in the ClawDJ red/orange theme.
 * value is 0–1: 0 = Deck A only, 1 = Deck B only.
 */
export function Crossfader({ value, onChange, disabled = false }: CrossfaderProps) {
  const pct = Math.round(value * 100);

  return (
    <div className="flex flex-col items-center gap-2 w-full max-w-xs mx-auto select-none">
      {/* Labels */}
      <div className="flex justify-between w-full text-xs font-bold">
        <span
          className="transition-colors"
          style={{ color: value < 0.5 ? "#ef4444" : "#6b7280" }}
        >
          A
        </span>
        <span className="text-gray-600 text-xs font-mono">
          {pct === 50 ? "C" : pct < 50 ? `${100 - pct}% A` : `${pct}% B`}
        </span>
        <span
          className="transition-colors"
          style={{ color: value > 0.5 ? "#f97316" : "#6b7280" }}
        >
          B
        </span>
      </div>

      {/* Track + thumb */}
      <div className="relative w-full h-8 flex items-center">
        {/* Track background */}
        <div className="absolute inset-x-0 h-2 rounded-full bg-gray-800 overflow-hidden">
          {/* A side (red) */}
          <div
            className="absolute left-0 top-0 h-full rounded-l-full transition-all duration-75"
            style={{
              width: `${(1 - value) * 50}%`,
              background: "linear-gradient(to right, #991b1b, #ef4444)",
              opacity: value < 0.5 ? 1 : 0.3,
            }}
          />
          {/* B side (orange) */}
          <div
            className="absolute right-0 top-0 h-full rounded-r-full transition-all duration-75"
            style={{
              width: `${value * 50}%`,
              background: "linear-gradient(to left, #9a3412, #f97316)",
              opacity: value > 0.5 ? 1 : 0.3,
            }}
          />
        </div>

        {/* Center marker */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-4 bg-gray-600 rounded-full" />

        {/* Range input */}
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(value * 100)}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          disabled={disabled}
          className="relative w-full h-8 opacity-0 cursor-pointer disabled:cursor-not-allowed"
          style={{ WebkitAppearance: "none" }}
          aria-label="Crossfader"
        />

        {/* Visual thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-5 h-8 rounded bg-white shadow-lg pointer-events-none transition-all duration-75 border border-gray-300"
          style={{ left: `calc(${value * 100}% - 10px)` }}
        />
      </div>
    </div>
  );
}
