import React, { useEffect, useState } from "react";

export default function Leaderboard({ API }) {
  const [data, setData] = useState({ fastest: [], mostWins: [], totalRuns: 0 });
  const [loading, setLoading] = useState(true);

  async function fetchBoard() {
    try {
      const res = await fetch(`${API}/leaderboard?limit=10`);
      const j = await res.json();
      setData(j);
    } catch (_) {}
    setLoading(false);
  }

  useEffect(() => {
    fetchBoard();
    const iv = setInterval(fetchBoard, 10000);
    return () => clearInterval(iv);
  }, []);

  return (
    <section className="how-section">
      <h2>Leaderboard</h2>
      {loading ? <div className="empty-tile">Loading…</div> : (
        <div className="home-grid">
          <div className="card">
            <h3 style={{marginTop:0}}>Fastest WPM</h3>
            {data.fastest.length === 0 ? <div className="empty-tile">No runs yet</div> : (
              <ol style={{margin:0,paddingLeft:"1.2rem"}}>
                {data.fastest.map((e, i) => (
                  <li key={e.wallet+i} style={{margin:"6px 0", display:"flex", justifyContent:"space-between"}}>
                    <span>{e.wallet.slice(0,6)}…{e.wallet.slice(-3)}</span>
                    <span><b>{e.wpm.toFixed(1)}</b> WPM <span style={{color:"#9aa7c7"}}>({Math.round(e.accuracy)}%)</span></span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="card">
            <h3 style={{marginTop:0}}>Most Wins</h3>
            {data.mostWins.length === 0 ? <div className="empty-tile">No wins yet</div> : (
              <ol style={{margin:0,paddingLeft:"1.2rem"}}>
                {data.mostWins.map((e, i) => (
                  <li key={e.wallet+i} style={{margin:"6px 0", display:"flex", justifyContent:"space-between"}}>
                    <span>{e.wallet.slice(0,6)}…{e.wallet.slice(-3)}</span>
                    <span><b>{e.wins}</b> wins</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
      <p className="brand-sub" style={{marginTop:8}}>Total recorded runs: {data.totalRuns}</p>
    </section>
  );
}
