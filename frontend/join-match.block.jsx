<div className="card join-card nice">
  <div className="card-icon">
    <svg
      width="44"
      height="44"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm8 2c-2.67 0-8 1.34-8 4v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1c0-2.66-5.33-4-8-4Zm-8 1c-2.42 0-7 1.21-7 3.6V19a1 1 0 0 0 1 1h6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </div>

  <h2 className="join-title">Join Match</h2>
  <p className="join-sub">Join an existing match with others</p>

  <div className="match-scroll">
    {openMatches.length === 0 && (
      <div className="empty-tile">No open matches available</div>
    )}

    {openMatches.map((m, idx) => (
      <div
        className="match-tile"
        key={m.id}
      >
        <div className="tile-header">
          <div className="tile-left">
            <div className="tile-title">Match #{idx + 1}</div>
            <div className="tile-id">
              {m.id.slice(0, 6)}…{m.id.slice(-3)}
            </div>
          </div>

          <div className="tile-right">
            <div className="tile-amount">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <path
                  d="M8 12h8M12 7v10"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
              <span>
                {m.amount} <b>SOL</b>
              </span>
            </div>
            <div className="tile-players">
              {m.players ? m.players : "2/4"} players
            </div>
          </div>
        </div>

        <button
          onClick={() => acceptMatch(m)}
          disabled={isAccepting}
          className="big-cta"
        >
          {isAccepting ? "Joining…" : "Join Match"}
        </button>
      </div>
    ))}
  </div>
</div>
