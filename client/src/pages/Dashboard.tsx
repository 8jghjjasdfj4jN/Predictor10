import { useState, useRef, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  ALL_SEASON_FIXTURES,
  ALL_LEAGUES,
  LEAGUE_ACCENT,
  PAYMENTS,
  ROUNDS,
  generateLeaderboard,
  getFixturesByRoundGrouped,
  type SeasonFixture,
} from "@/lib/mockDataExtended";

// ─── COLOURS ─────────────────────────────────────────────────────────────────
const C = {
  bg:      "#070f09",
  card:    "rgba(255,255,255,0.05)",
  bdr:     "rgba(255,255,255,0.09)",
  em:      "#34d379",
  emDim:   "rgba(52,211,119,0.13)",
  emBdr:   "rgba(52,211,119,0.28)",
  txt:     "#eef5f0",
  mid:     "rgba(238,245,240,0.55)",
  dim:     "rgba(238,245,240,0.32)",
};

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  Open:      { bg: "rgba(52,211,119,0.12)",  color: "#6ee7a0", label: "Open"      },
  Submitted: { bg: "rgba(56,189,248,0.12)",  color: "#7dd3fc", label: "Submitted" },
  Locked:    { bg: "rgba(251,191,36,0.12)",  color: "#fcd34d", label: "Locked"    },
  Void:      { bg: "rgba(156,163,175,0.12)", color: "#9ca3af", label: "Void"      },
  Syncing:   { bg: "rgba(167,139,250,0.12)", color: "#c4b5fd", label: "Syncing"   },
  Completed: { bg: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)", label: "FT" },
};

function Pill({ state }: { state: string }) {
  const s = STATUS_STYLES[state] || STATUS_STYLES.Open;
  return (
    <span style={{ background: s.bg, color: s.color, borderRadius: 999, padding: "0.2rem 0.6rem", fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

function AccentDot({ id }: { id: string }) {
  return <span style={{ width: 7, height: 7, borderRadius: "50%", background: LEAGUE_ACCENT[id] || C.em, display: "inline-block", flexShrink: 0 }} />;
}

// ─── HOME TAB ─────────────────────────────────────────────────────────────────
function HomeTab({ activeLeagueId, setActiveLeagueId }: { activeLeagueId: string; setActiveLeagueId: (id: string) => void }) {
  const { user } = useAuth();
  const userName = user?.name || "";
  const joinedLeagues = ALL_LEAGUES.filter(l => l.joined);
  const activeLeague = ALL_LEAGUES.find(l => l.id === activeLeagueId) || joinedLeagues[0];
  const leagueTable = useMemo(() => generateLeaderboard(activeLeagueId, userName), [activeLeagueId, userName]);
  const myRow = leagueTable.find(r => r.isMe);
  const myRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (myRowRef.current) {
      setTimeout(() => myRowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
    }
  }, [activeLeagueId]);

  return (
    <div style={{ padding: "1rem 1rem 0" }}>
      {/* League switcher pills */}
      <div style={{ display: "flex", gap: "0.5rem", overflowX: "auto", paddingBottom: "0.5rem", marginBottom: "1rem", scrollbarWidth: "none" }}>
        {joinedLeagues.map(l => (
          <button key={l.id} onClick={() => setActiveLeagueId(l.id)} style={{
            flexShrink: 0, padding: "0.4rem 0.9rem", borderRadius: 999, cursor: "pointer",
            border: activeLeagueId === l.id ? `1px solid ${LEAGUE_ACCENT[l.id]}66` : "1px solid rgba(255,255,255,0.1)",
            background: activeLeagueId === l.id ? `${LEAGUE_ACCENT[l.id]}1a` : "rgba(255,255,255,0.04)",
            color: activeLeagueId === l.id ? "#fff" : C.dim,
            fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.1em",
            display: "flex", alignItems: "center", gap: "0.4rem",
          }}>
            <AccentDot id={l.id} />{l.name}
          </button>
        ))}
      </div>

      {/* My position card */}
      <div style={{ background: C.emDim, border: `1px solid ${C.emBdr}`, borderRadius: "1.2rem", padding: "1rem 1.1rem", marginBottom: "1rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.24em", textTransform: "uppercase", color: C.em, marginBottom: "0.25rem" }}>
            {activeLeague.name} · Round 3
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900, fontSize: "3rem", color: "#fff", lineHeight: 1 }}>{myRow?.pos ?? "—"}</span>
            <span style={{ fontSize: "0.72rem", color: C.mid, fontWeight: 600 }}>of {activeLeague.players}</span>
          </div>
          <div style={{ fontSize: "0.78rem", color: C.mid, marginTop: "0.2rem" }}>
            <span style={{ color: "#fff", fontWeight: 700 }}>{myRow?.pts ?? 0} pts</span>
            {"  ·  "}{myRow?.results} results · {myRow?.scores} exact
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: C.dim, marginBottom: "0.3rem" }}>Next deadline</div>
          <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#fff" }}>Fri 24 Oct</div>
          <div style={{ fontSize: "0.7rem", color: C.mid }}>18:00</div>
        </div>
      </div>

      {/* Full leaderboard table */}
      <div style={{ background: "#111a13", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "1.2rem", overflow: "hidden", marginBottom: "1rem" }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "42px 1fr 46px 46px 52px", padding: "0.6rem 0.8rem", background: "rgba(0,0,0,0.3)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          {["#", "Player", "Res", "Sc", "Pts"].map((h, i) => (
            <span key={h} style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: C.dim, textAlign: i > 1 ? "center" : "left" }}>{h}</span>
          ))}
        </div>
        {/* Rows */}
        <div style={{ maxHeight: "55vh", overflowY: "auto", scrollbarWidth: "thin" }}>
          {leagueTable.map((row, i) => (
            <div
              key={i}
              ref={row.isMe ? myRowRef : null}
              style={{
                display: "grid", gridTemplateColumns: "42px 1fr 46px 46px 52px",
                padding: "0.6rem 0.8rem", alignItems: "center",
                background: row.isMe ? "rgba(52,211,119,0.1)" : i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.15)",
                borderTop: row.isMe ? "1px solid rgba(52,211,119,0.3)" : "none",
                borderBottom: row.isMe ? "1px solid rgba(52,211,119,0.3)" : "1px solid rgba(255,255,255,0.04)",
              }}
            >
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "1rem", color: row.isMe ? C.em : row.pos <= 3 ? "#fff" : C.mid }}>{row.pos}</span>
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", minWidth: 0 }}>
                {row.isMe && <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.em, flexShrink: 0 }} />}
                <span style={{ fontSize: "0.82rem", fontWeight: row.isMe ? 700 : 500, color: row.isMe ? "#fff" : C.txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</span>
                {row.isMe && <span style={{ fontSize: "0.58rem", fontWeight: 800, color: C.em, background: "rgba(52,211,119,0.15)", borderRadius: 999, padding: "0.1rem 0.35rem", flexShrink: 0, letterSpacing: "0.1em" }}>YOU</span>}
              </div>
              <span style={{ fontSize: "0.8rem", color: C.mid, textAlign: "center" }}>{row.results}</span>
              <span style={{ fontSize: "0.8rem", color: C.mid, textAlign: "center" }}>{row.scores}</span>
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "1rem", color: row.isMe ? C.em : "#fff", textAlign: "center" }}>{row.pts}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── PREDICT TAB ──────────────────────────────────────────────────────────────
function PredictTab() {
  const CURRENT_ROUND = 3;
  const [openRounds, setOpenRounds] = useState<Set<number>>(new Set([CURRENT_ROUND]));
  const [predictions, setPredictions] = useState<Record<string, { h: number | null; a: number | null }>>(() => {
    const map: Record<string, { h: number | null; a: number | null }> = {};
    ALL_SEASON_FIXTURES.forEach(f => { map[f.id] = { h: f.homePredicted, a: f.awayPredicted }; });
    return map;
  });
  const [saved, setSaved] = useState<number | null>(null);

  const toggleRound = (r: number) => {
    setOpenRounds(prev => {
      const next = new Set(prev);
      next.has(r) ? next.delete(r) : next.add(r);
      return next;
    });
  };

  const updatePred = (id: string, side: "h" | "a", val: string) => {
    const n = val === "" ? null : parseInt(val);
    if (n !== null && (isNaN(n) || n < 0 || n > 20)) return;
    setPredictions(prev => ({ ...prev, [id]: { ...prev[id], [side]: n } }));
  };

  const handleSave = (roundId: number) => {
    setSaved(roundId);
    setTimeout(() => setSaved(null), 2000);
  };

  const getPointsBadge = (pts?: number) => {
    if (pts === undefined || pts === null) return null;
    const color = pts === 5 ? "#6ee7a0" : pts === 2 ? "#7dd3fc" : "#9ca3af";
    const bg = pts === 5 ? "rgba(52,211,119,0.15)" : pts === 2 ? "rgba(56,189,248,0.12)" : "rgba(156,163,175,0.1)";
    const label = pts === 5 ? "+5" : pts === 2 ? "+2" : "0";
    return <span style={{ fontSize: "0.68rem", fontWeight: 800, color, background: bg, borderRadius: 999, padding: "0.15rem 0.5rem", letterSpacing: "0.1em" }}>{label}</span>;
  };

  return (
    <div style={{ padding: "1rem" }}>
      <div style={{ marginBottom: "1rem" }}>
        <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.26em", textTransform: "uppercase", color: C.em, marginBottom: "0.2rem" }}>2025/26 Season</div>
        <div style={{ fontSize: "0.75rem", color: C.dim }}>All 9 rounds · Predictions close the day before each kickoff</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {ROUNDS.map(round => {
          const isOpen = openRounds.has(round.id);
          const isCurrent = round.id === CURRENT_ROUND;
          const fixtures = getFixturesByRoundGrouped(round.id);
          const gwNums = Array.from(fixtures.keys()).sort((a, b) => a - b);
          const roundFixtures = Array.from(fixtures.values()).flat();
          const roundPts = round.status === "Completed" ? round.totalPoints : null;

          return (
            <div key={round.id} style={{ background: C.card, border: isCurrent ? `1px solid ${C.emBdr}` : `1px solid ${C.bdr}`, borderRadius: "1.1rem", overflow: "hidden" }}>
              {/* Round header — always visible, tap to expand */}
              <button
                onClick={() => toggleRound(round.id)}
                style={{ width: "100%", padding: "0.9rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "1rem", color: "#fff", letterSpacing: "0.04em" }}>{round.label}</span>
                      {isCurrent && <span style={{ fontSize: "0.6rem", fontWeight: 700, color: C.em, background: "rgba(52,211,119,0.12)", borderRadius: 999, padding: "0.15rem 0.5rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>Current</span>}
                    </div>
                    <div style={{ fontSize: "0.7rem", color: C.dim, marginTop: "0.1rem" }}>{round.gameweeks} · {roundFixtures.length} fixtures</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  {round.status === "Completed" && roundPts !== null && (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "1.2rem", color: C.em, lineHeight: 1 }}>{roundPts}pts</div>
                      <div style={{ fontSize: "0.6rem", color: C.dim, letterSpacing: "0.1em" }}>Rank #{round.rank}</div>
                    </div>
                  )}
                  {round.status === "Upcoming" && (
                    <span style={{ fontSize: "0.65rem", fontWeight: 700, color: C.dim, letterSpacing: "0.14em", textTransform: "uppercase" }}>Upcoming</span>
                  )}
                  <span style={{ color: C.dim, fontSize: "1rem", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>▾</span>
                </div>
              </button>

              {/* Expanded fixture list */}
              {isOpen && (
                <div style={{ borderTop: `1px solid ${C.bdr}` }}>
                  {gwNums.map(gw => {
                    const gwFixtures = fixtures.get(gw) || [];
                    return (
                      <div key={gw}>
                        {/* GW label */}
                        <div style={{ padding: "0.5rem 1rem 0.25rem", fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: C.dim, background: "rgba(0,0,0,0.15)" }}>
                          Gameweek {gw}
                        </div>

                        {/* Fixtures */}
                        {gwFixtures.map(f => {
                          const pred = predictions[f.id];
                          const editable = f.state === "Open";
                          const isVoid = f.state === "Void";

                          return (
                            <div key={f.id} style={{ padding: "0.7rem 1rem", borderBottom: `1px solid rgba(255,255,255,0.04)`, opacity: isVoid ? 0.5 : 1 }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.45rem" }}>
                                <span style={{ fontSize: "0.65rem", color: C.dim }}>{f.kickoffLabel}</span>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                  {getPointsBadge(f.pointsEarned)}
                                  <Pill state={f.state} />
                                </div>
                              </div>

                              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "0.4rem" }}>
                                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: C.txt, textAlign: "right" }}>{f.homeTeam}</span>

                                {/* Score display / inputs */}
                                <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                                  {f.state === "Completed" ? (
                                    // Actual result + user prediction below
                                    <div style={{ textAlign: "center" }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                                        <span style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.08)", borderRadius: "0.5rem", fontSize: "1rem", fontWeight: 800, color: "#fff" }}>{f.actualHome}</span>
                                        <span style={{ color: C.dim, fontWeight: 700 }}>–</span>
                                        <span style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.08)", borderRadius: "0.5rem", fontSize: "1rem", fontWeight: 800, color: "#fff" }}>{f.actualAway}</span>
                                      </div>
                                      {pred?.h !== null && pred?.a !== null && (
                                        <div style={{ fontSize: "0.6rem", color: C.dim, textAlign: "center", marginTop: "0.2rem" }}>
                                          pred: {pred.h}–{pred.a}
                                        </div>
                                      )}
                                    </div>
                                  ) : editable ? (
                                    <>
                                      <input
                                        type="number" min="0" max="20"
                                        value={pred?.h ?? ""}
                                        onChange={e => updatePred(f.id, "h", e.target.value)}
                                        placeholder="–"
                                        style={{ width: 36, height: 36, textAlign: "center", fontSize: "1rem", fontWeight: 800, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "0.55rem", color: "#fff", outline: "none", fontFamily: "inherit" }}
                                        onFocus={e => { e.target.style.borderColor = "rgba(52,211,119,0.5)"; }}
                                        onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.15)"; }}
                                      />
                                      <span style={{ color: C.dim, fontWeight: 700 }}>–</span>
                                      <input
                                        type="number" min="0" max="20"
                                        value={pred?.a ?? ""}
                                        onChange={e => updatePred(f.id, "a", e.target.value)}
                                        placeholder="–"
                                        style={{ width: 36, height: 36, textAlign: "center", fontSize: "1rem", fontWeight: 800, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "0.55rem", color: "#fff", outline: "none", fontFamily: "inherit" }}
                                        onFocus={e => { e.target.style.borderColor = "rgba(52,211,119,0.5)"; }}
                                        onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.15)"; }}
                                      />
                                    </>
                                  ) : (
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                                      <span style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.06)", borderRadius: "0.55rem", fontSize: "1rem", fontWeight: 800, color: pred?.h !== null ? "#fff" : C.dim }}>{pred?.h ?? "–"}</span>
                                      <span style={{ color: C.dim, fontWeight: 700 }}>–</span>
                                      <span style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.06)", borderRadius: "0.55rem", fontSize: "1rem", fontWeight: 800, color: pred?.a !== null ? "#fff" : C.dim }}>{pred?.a ?? "–"}</span>
                                    </div>
                                  )}
                                </div>

                                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: C.txt }}>{f.awayTeam}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}

                  {/* Save button for active rounds */}
                  {round.status !== "Completed" && (
                    <div style={{ padding: "0.75rem 1rem" }}>
                      <button
                        onClick={() => handleSave(round.id)}
                        style={{ width: "100%", padding: "0.75rem", background: C.emDim, border: `1px solid ${C.emBdr}`, borderRadius: "0.75rem", color: "#fff", fontSize: "0.82rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit" }}
                      >
                        {saved === round.id ? "✓ Predictions Saved" : `Save Round ${round.id} Predictions`}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── LEAGUES TAB ──────────────────────────────────────────────────────────────
function LeaguesTab() {
  const [joined, setJoined] = useState<Set<string>>(new Set(ALL_LEAGUES.filter(l => l.joined).map(l => l.id)));
  const [confirmLeague, setConfirmLeague] = useState<typeof ALL_LEAGUES[0] | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleConfirmJoin = () => {
    if (!confirmLeague) return;
    setProcessing(true);
    setTimeout(() => {
      setJoined(prev => new Set([...prev, confirmLeague.id]));
      setProcessing(false);
      setConfirmLeague(null);
    }, 1200);
  };

  return (
    <div style={{ padding: "1rem" }}>
      <div style={{ marginBottom: "1rem" }}>
        <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.26em", textTransform: "uppercase", color: C.em, marginBottom: "0.2rem" }}>Round 3 · Available Leagues</div>
        <div style={{ fontSize: "0.75rem", color: C.dim }}>Enter as many leagues as you like. Pay per round, per entry.</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
        {ALL_LEAGUES.map(l => {
          const isIn = joined.has(l.id);
          const accent = LEAGUE_ACCENT[l.id];
          return (
            <div key={l.id} style={{ background: C.card, border: isIn ? `1px solid ${accent}44` : `1px solid ${C.bdr}`, borderRadius: "1.1rem", padding: "1rem", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: accent, borderRadius: "1.1rem 0 0 1.1rem" }} />
              <div style={{ paddingLeft: "0.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.6rem" }}>
                  <div>
                    <div style={{ fontSize: "0.92rem", fontWeight: 800, color: "#fff", marginBottom: "0.12rem" }}>{l.name}</div>
                    <div style={{ fontSize: "0.7rem", color: C.dim }}>{l.players} players · {l.prize} prize pool</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900, fontSize: "1.5rem", color: accent, lineHeight: 1 }}>£{l.entry}</div>
                    <div style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: C.dim }}>per round</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{
                    fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", borderRadius: 999, padding: "0.2rem 0.55rem",
                    color: l.status === "Open" ? "#6ee7a0" : l.status === "Limited" ? "#fcd34d" : "#f87171",
                    background: l.status === "Open" ? "rgba(52,211,119,0.1)" : l.status === "Limited" ? "rgba(251,191,36,0.1)" : "rgba(248,113,113,0.1)",
                  }}>{l.status}</span>
                  {isIn ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span style={{ fontSize: "0.72rem", fontWeight: 700, color: accent }}>✓ Entered</span>
                      <button onClick={() => setConfirmLeague(l)} style={{ padding: "0.35rem 0.75rem", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 999, color: C.mid, fontSize: "0.7rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                        Enter Again
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmLeague(l)} style={{ padding: "0.42rem 0.9rem", background: C.emDim, border: `1px solid ${C.emBdr}`, borderRadius: 999, color: "#fff", fontSize: "0.76rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                      Enter · £{l.entry}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirmation modal */}
      {confirmLeague && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100, padding: "0 0 0" }}>
          <div style={{ width: "100%", maxWidth: 480, background: "#0e1f13", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "1.5rem 1.5rem 0 0", padding: "1.5rem", boxShadow: "0 -20px 60px rgba(0,0,0,0.5)" }}>
            <div style={{ width: 36, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.15)", margin: "0 auto 1.25rem" }} />
            <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.24em", textTransform: "uppercase", color: C.em, marginBottom: "0.4rem" }}>Confirm Entry</div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "1.4rem", color: "#fff", marginBottom: "0.5rem" }}>{confirmLeague.name}</div>
            <div style={{ fontSize: "0.82rem", color: C.mid, marginBottom: "1.25rem", lineHeight: 1.6 }}>
              Round 3 entry · <strong style={{ color: "#fff" }}>£{confirmLeague.entry}.00</strong> will be charged.<br />
              You can enter multiple times. Each entry is separate.
            </div>
            <div style={{ display: "flex", gap: "0.6rem" }}>
              <button onClick={() => setConfirmLeague(null)} style={{ flex: 1, padding: "0.85rem", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "0.85rem", color: C.mid, fontSize: "0.85rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
              <button onClick={handleConfirmJoin} style={{ flex: 2, padding: "0.85rem", background: C.emDim, border: `1px solid ${C.emBdr}`, borderRadius: "0.85rem", color: "#fff", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                {processing ? "Processing…" : `Pay £${confirmLeague.entry} & Enter`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ACCOUNT TAB ──────────────────────────────────────────────────────────────
function AccountTab() {
  const { user, logout, updateName } = useAuth();
  const [editing, setEditing] = useState(false);
  const [nameVal, setNameVal] = useState(user?.name || "");
  const [saved, setSaved] = useState(false);

  const handleSaveName = () => {
    updateName(nameVal);
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const joinedLeagues = ALL_LEAGUES.filter(l => l.joined);

  return (
    <div style={{ padding: "1rem" }}>
      {/* Profile */}
      <div style={{ background: C.card, border: `1px solid ${C.bdr}`, borderRadius: "1.2rem", padding: "1.1rem", marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.9rem", marginBottom: "0.9rem" }}>
          <div style={{ width: 50, height: 50, borderRadius: "50%", background: "linear-gradient(135deg,#0d2e1a,#1a4a28)", border: `2px solid ${C.em}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900, fontSize: "1.1rem", color: C.em }}>{user?.avatar}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: C.dim, marginBottom: "0.2rem" }}>Display Name (shown on leaderboard)</div>
            {editing ? (
              <div style={{ display: "flex", gap: "0.45rem" }}>
                <input value={nameVal} onChange={e => setNameVal(e.target.value)} style={{ flex: 1, padding: "0.4rem 0.65rem", background: "rgba(255,255,255,0.07)", border: `1px solid ${C.emBdr}`, borderRadius: "0.6rem", color: "#fff", fontSize: "0.9rem", outline: "none", fontFamily: "inherit" }} />
                <button onClick={handleSaveName} style={{ padding: "0.4rem 0.75rem", background: C.emDim, border: `1px solid ${C.emBdr}`, borderRadius: "0.6rem", color: "#fff", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Save</button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <span style={{ fontSize: "0.95rem", fontWeight: 800, color: "#fff" }}>{user?.name}</span>
                <button onClick={() => setEditing(true)} style={{ fontSize: "0.68rem", fontWeight: 700, color: C.em, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
                {saved && <span style={{ fontSize: "0.68rem", color: C.em }}>✓ Saved</span>}
              </div>
            )}
          </div>
        </div>
        <div style={{ fontSize: "0.75rem", color: C.dim }}>{user?.email}</div>
      </div>

      {/* Active leagues */}
      <div style={{ marginBottom: "1rem" }}>
        <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: C.dim, marginBottom: "0.5rem" }}>Active This Round</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
          {joinedLeagues.map(l => (
            <div key={l.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: "0.85rem", padding: "0.7rem 0.9rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
                <AccentDot id={l.id} />
                <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#fff" }}>{l.name}</span>
              </div>
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: LEAGUE_ACCENT[l.id] }}>£{l.entry} / round</span>
            </div>
          ))}
        </div>
      </div>

      {/* Payment history */}
      <div style={{ marginBottom: "1rem" }}>
        <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: C.dim, marginBottom: "0.5rem" }}>Payment History</div>
        <div style={{ background: "#111a13", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "1rem", overflow: "hidden" }}>
          {PAYMENTS.map((p, i) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.7rem 0.9rem", borderBottom: i < PAYMENTS.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
              <div>
                <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#fff" }}>{p.league} · {p.round}</div>
                <div style={{ fontSize: "0.7rem", color: C.dim }}>{p.date}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 800, color: C.em }}>{p.amount}</div>
                <span style={{ fontSize: "0.6rem", fontWeight: 700, color: "#6ee7a0", background: "rgba(52,211,119,0.1)", borderRadius: 999, padding: "0.1rem 0.4rem", letterSpacing: "0.1em" }}>{p.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sign out */}
      <button onClick={logout} style={{ width: "100%", padding: "0.85rem", background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.18)", borderRadius: "0.9rem", color: "#fca5a5", fontSize: "0.84rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit" }}>
        Sign Out
      </button>
    </div>
  );
}

// ─── NAV ICONS ────────────────────────────────────────────────────────────────
const HomeIcon = ({ active }: { active: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "#34d379" : "rgba(238,245,240,0.4)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);
const PredictIcon = ({ active }: { active: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "#34d379" : "rgba(238,245,240,0.4)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>
);
const LeagueIcon = ({ active }: { active: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "#34d379" : "rgba(238,245,240,0.4)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>
  </svg>
);
const AccountIcon = ({ active }: { active: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "#34d379" : "rgba(238,245,240,0.4)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
type Tab = "home" | "predict" | "leagues" | "account";

const NAV: { id: Tab; label: string; Icon: React.FC<{ active: boolean }> }[] = [
  { id: "home",    label: "Home",    Icon: HomeIcon    },
  { id: "predict", label: "Predict", Icon: PredictIcon },
  { id: "leagues", label: "Leagues", Icon: LeagueIcon  },
  { id: "account", label: "Account", Icon: AccountIcon },
];

export default function Dashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("home");
  const [activeLeagueId, setActiveLeagueId] = useState("premier-ten");

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Manrope', system-ui, sans-serif" }}>
      {/* Centred column — 480px max on desktop */}
      <div style={{ maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", minHeight: "100vh", position: "relative", borderLeft: "1px solid rgba(255,255,255,0.04)", borderRight: "1px solid rgba(255,255,255,0.04)" }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.8rem 1rem 0.65rem", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0, background: "rgba(7,15,9,0.95)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{ width: 30, height: 30, background: "linear-gradient(135deg,#0d2e1a,#1a4a28)", border: "1px solid rgba(52,211,119,0.3)", borderRadius: "0.55rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900, fontSize: "0.85rem", color: "#34d379", lineHeight: 1 }}>P</span>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: "0.55rem", color: "rgba(52,211,119,0.7)", marginTop: 3 }}>10</span>
          </div>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "1.05rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#fff" }}>
            Predictor<span style={{ color: "#34d379" }}>10</span>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
          <span style={{ fontSize: "0.72rem", fontWeight: 600, color: C.dim }}>Hi, {user?.name.split(" ")[0]}</span>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#0d2e1a,#1a4a28)", border: "1px solid rgba(52,211,119,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900, fontSize: "0.72rem", color: "#34d379" }}>{user?.avatar}</span>
          </div>
        </div>
      </div>

      {/* Page content */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: "5rem" }}>
        {tab === "home"    && <HomeTab activeLeagueId={activeLeagueId} setActiveLeagueId={setActiveLeagueId} />}
        {tab === "predict" && <PredictTab />}
        {tab === "leagues" && <LeaguesTab />}
        {tab === "account" && <AccountTab />}
      </div>

      {/* Bottom nav */}
      <div style={{ position: "sticky", bottom: 0, zIndex: 20, padding: "0.5rem 0.75rem calc(0.5rem + env(safe-area-inset-bottom))", background: "rgba(7,15,9,0.96)", backdropFilter: "blur(16px)", borderTop: "1px solid rgba(255,255,255,0.07)", marginTop: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "0.25rem" }}>
          {NAV.map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button key={id} onClick={() => setTab(id)} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.2rem", padding: "0.45rem 0.25rem", borderRadius: "0.8rem", border: "none", cursor: "pointer", background: active ? "rgba(52,211,119,0.1)" : "transparent", fontFamily: "inherit" }}>
                <Icon active={active} />
                <span style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: active ? "#34d379" : "rgba(238,245,240,0.35)" }}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
      </div>
    </div>
  );
}
