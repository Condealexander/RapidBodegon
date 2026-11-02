type SeasonalBackgroundProps = {
  variant: 'login' | 'client';
};

const seasonalSymbols = ['❄️', '🎁', '✨', '🔔', '⭐', '🎄', '🕯️', '🧦'];
const lightColors = ['red', 'gold', 'green', 'red', 'gold', 'green', 'red'];

export const SeasonalBackground = ({ variant }: SeasonalBackgroundProps) => (
  <div
    className={`seasonal-background seasonal-background--${variant}`}
    aria-hidden="true"
  >
    <div className="seasonal-symbols">
      {seasonalSymbols.map((symbol, index) => (
        <span className="seasonal-symbol" key={`${symbol}-${index}`}>{symbol}</span>
      ))}
    </div>

    {variant === 'client' && (
      <>
        <div className="seasonal-light-string">
          {lightColors.map((color, index) => (
            <span className={`seasonal-light seasonal-light--${color}`} key={`${color}-${index}`} />
          ))}
        </div>
        <span className="seasonal-reindeer seasonal-reindeer--one">🦌</span>
        <span className="seasonal-reindeer seasonal-reindeer--two">🦌</span>
        <span className="seasonal-tree">🎄</span>
        <span className="seasonal-nutcracker">
          <svg className="seasonal-nutcracker-image" viewBox="0 0 52 118" fill="none">
            <path d="M10 19h32l-3 6H13l-3-6Z" fill="#FBBF24" />
            <path d="M15 7h22l3 12H12l3-12Z" fill="#B91C1C" />
            <path d="M26 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" fill="#FDE68A" />
            <path d="M14 25h24v20H14z" fill="#F2C08B" />
            <path d="M18 31h4m8 0h4" stroke="#1F2937" strokeWidth="2" strokeLinecap="round" />
            <path d="M18 37c2 4 5 4 8 1 3 3 6 3 8-1" stroke="#7F1D1D" strokeWidth="3" strokeLinecap="round" />
            <path d="M19 45h14l9 8v28H10V53l9-8Z" fill="#B91C1C" />
            <path d="M26 46v34" stroke="#FBBF24" strokeWidth="3" />
            <circle cx="26" cy="55" r="2" fill="#FDE68A" />
            <circle cx="26" cy="64" r="2" fill="#FDE68A" />
            <circle cx="26" cy="73" r="2" fill="#FDE68A" />
            <path d="M10 54 4 72m38-18 6 18" stroke="#B91C1C" strokeWidth="7" strokeLinecap="round" />
            <path d="M17 81v25m18-25v25" stroke="#1F2937" strokeWidth="8" strokeLinecap="round" />
            <path d="M12 108h11m6 0h11" stroke="#111827" strokeWidth="8" strokeLinecap="round" />
            <path d="M13 44h26" stroke="#FBBF24" strokeWidth="3" />
          </svg>
        </span>
      </>
    )}
  </div>
);
