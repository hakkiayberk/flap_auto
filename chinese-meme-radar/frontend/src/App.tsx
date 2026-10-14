import { useState, useEffect, useCallback } from 'react'
import './App.css'

interface Trend {
  id: number
  title: string
  original_url: string
  source_platform: 'weibo' | 'bilibili' | string
  published_at: string | null
  first_detected_at: string | null
  source_account?: string | null
  category: string
  likes: number
  comments: number
  shares: number
  thumbnail_url: string | null
  trend_score: number
  growth_indicator: number
  is_analyzed: boolean
  context: { summary: string; analysis_status: string; score_note: string }
  suggestion?: { name: string | null; source_alias?: string; reason: string; confidence: string }
}

interface ReferenceExample {
  id: string
  source_entity: string
  observed_token_label: string
  chinese_candidate_name: string | null
  pattern: string
  explanation: string
  naming_rule: string
  observed_quote_asset: string
  source_post_url: string
  token_url: string
  timing_note: string
}

interface Stats {
  total_trends: number
  added_today: number
  average_score: number
  token_collisions: number
}

const PLATFORM_META: Record<string, { emoji: string; label: string; color: string }> = {
  x:        { emoji: '𝕏', label: 'X', color: '#cbd5e1' },
  weibo:    { emoji: '🇨🇳', label: 'Weibo',    color: '#e6162d' },
  bilibili: { emoji: '📺', label: 'Bilibili', color: '#00a1d6' },
}

function platformBadge(platform: string) {
  const meta = PLATFORM_META[platform] ?? { emoji: '🌐', label: platform, color: '#6366f1' }
  return (
    <span
      className="platform-badge"
      style={{ borderColor: meta.color, color: meta.color }}
    >
      {meta.emoji} {meta.label}
    </span>
  )
}

function ScoreBar({ score, max = 10000 }: { score: number; max?: number }) {
  const pct = Math.min((score / max) * 100, 100)
  return (
    <div className="score-bar-track">
      <div className="score-bar-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function App() {
  const [status, setStatus] = useState<string>('Loading...')
  const [trends, setTrends] = useState<Trend[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [platform, setPlatform] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [examples, setExamples] = useState<ReferenceExample[]>([])
  const [connections, setConnections] = useState<{ checks: { name: string; ready: boolean; detail: string }[]; x_discovery?: { status: string; watch_accounts: string[]; detail: string } } | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/trends/stats')
      if (res.ok) setStats(await res.json())
    } catch { setStatus('Disconnected') }
  }, [])

  const fetchTrends = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '50' })
    if (platform) params.set('platform', platform)
    try {
      const res = await fetch(`/api/trends?${params}`)
      if (!res.ok) throw new Error('Trend request failed')
      const data = await res.json()
      setTrends(data.items ?? [])
      setLastUpdated(new Date())
    } catch { setStatus('Disconnected') }
    finally { setLoading(false) }
  }, [platform])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const response = await fetch('/api/trends/refresh', { method: 'POST' })
      if (!response.ok) throw new Error('Refresh failed')
      await fetchStats()
      await fetchTrends()
    } catch { setStatus('Error') }
    finally { setRefreshing(false) }
  }

  useEffect(() => {
    fetch('/api/examples').then(r => r.ok ? r.json() : null).then(d => setExamples(d?.items ?? [])).catch(() => setExamples([]))
    fetch('/api/launch/status').then(r => r.ok ? r.json() : null).then(setConnections).catch(() => setConnections(null))
    fetch('/api/health')
      .then(r => r.json())
      .then(d => setStatus(d.status === 'healthy' ? 'Connected' : 'Error'))
      .catch(() => setStatus('Disconnected'))
  }, [])

  useEffect(() => {
    void Promise.resolve().then(() => { fetchStats(); fetchTrends() })
    const interval = setInterval(() => {
      fetch('/api/launch/status').then(r => r.ok ? r.json() : null).then(setConnections).catch(() => {})
      fetchStats()
      fetchTrends()
    }, 60_000)
    return () => clearInterval(interval)
  }, [fetchStats, fetchTrends])

  const statCards = [
    { label: 'Collected Trends',  value: stats?.total_trends ?? 0,      icon: '📡' },
    { label: 'Added Today',     value: stats?.added_today ?? 0,        icon: '🆕' },
    { label: 'Average Score',     value: (stats?.average_score ?? 0).toFixed(1), icon: '⭐' },
    { label: 'Token Collisions',value: 'Not checked',   icon: '⚡' },
  ]

  return (
    <div className="shell">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-icon">📡</span>
          <span className="logo-text">Meme Radar</span>
        </div>

        <nav className="sidebar-nav">
          {[
            { icon: '📊', label: 'Dashboard',       active: true  },
            { icon: '🧭', label: 'Trend Explorer',  active: false },
            { icon: '🐼', label: 'Animal Radar',    active: false },
            { icon: '🇨🇳', label: 'Chinese Meme',   active: false },
            { icon: '🔬', label: 'AI Token Lab',    active: false },
            { icon: '⚙️', label: 'Settings',         active: false },
          ].map(item => (
            <a key={item.label} href="#" className={`nav-item${item.active ? ' active' : ''}`}>
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className={`status-dot ${status === 'Connected' ? 'online' : 'offline'}`} />
          <span>API: {status}</span>
          {lastUpdated && (
            <div className="last-updated">
              Last updated: {lastUpdated.toLocaleTimeString('en-US')}
            </div>
          )}
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="main">
        {/* Topbar */}
        <header className="topbar">
          <div className="topbar-left">
            <h2 className="topbar-title">Overview</h2>
            <div className="platform-tabs">
              {['', 'weibo', 'bilibili', 'x'].map(p => (
                <button
                  key={p}
                  className={`tab-btn${platform === p ? ' selected' : ''}`}
                  onClick={() => setPlatform(p)}
                >
                  {p === '' ? '🌐 All' : PLATFORM_META[p]?.emoji + ' ' + PLATFORM_META[p]?.label}
                </button>
              ))}
            </div>
          </div>
          <button
            id="refresh-btn"
            className={`refresh-btn${refreshing ? ' spinning' : ''}`}
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? '⟳ Loading…' : '⟳ Refresh'}
          </button>
        </header>

        <div className="content">
          <section className="connection-panel">
            <h3>Launch Pipeline · Preparation Mode</h3>
            <p>X post → Flap tax token with post URL → confirmed deployment → 10-wallet buy</p>
            {connections ? connections.checks.map(c => (
              <div key={c.name}><strong>{c.ready ? '✓' : '○'} {c.name}</strong><span> — {c.detail}</span></div>
            )) : <p>Connection status unavailable.</p>}
          </section>
          <section className="x-watch-panel">
            <div className="x-watch-header"><h3>X Watchlist</h3><span>{connections?.x_discovery?.status === 'ok' ? 'Last poll succeeded' : connections?.x_discovery?.status === 'missing_credentials' ? 'Not connected' : 'Awaiting verified poll'}</span></div>
            <div className="x-watch-handles">
              {(connections?.x_discovery?.watch_accounts ?? []).map(handle => (
                <a key={handle} href={`https://x.com/${handle}`} target="_blank" rel="noopener noreferrer">@{handle} ↗</a>
              ))}
            </div>
            <p>{connections?.x_discovery?.detail ?? 'Checking source connection…'}</p>
          </section>
          {/* Stats Row */}
          <div className="stats-grid">
            {statCards.map(card => (
              <div key={card.label} className="stat-card">
                <div className="stat-icon">{card.icon}</div>
                <div>
                  <div className="stat-value">{card.value}</div>
                  <div className="stat-label">{card.label}</div>
                </div>
              </div>
            ))}
          </div>

          {examples.length > 0 && (
            <section className="reference-section">
              <h3>Reference Patterns</h3>
              <p className="reference-note">Naming examples only · Our first release uses BNB pools · Source popularity does not prove token demand</p>
              <div className="reference-grid">
                {examples.map(e => (
                  <article className="reference-card" key={e.id}>
                    <span className="category-tag">{e.pattern}</span>
                    <h4>{e.source_entity} → {e.observed_token_label}</h4>
                    <p>{e.explanation}</p>
                    <p className="reference-rule">{e.naming_rule}</p>
                    <small>{e.timing_note}</small>
                    <div className="reference-links">
                      <a href={e.source_post_url} target="_blank" rel="noopener noreferrer">Source post ↗</a>
                      <a href={e.token_url} target="_blank" rel="noopener noreferrer">Reference token ↗</a>
                    </div>
                    <small>Reference quote: {e.observed_quote_asset} · Candidate name: <span lang="zh">{e.chinese_candidate_name ?? 'Pending naming review'}</span></small>
                  </article>
                ))}
              </div>
            </section>
          )}
          {/* Feed */}
          <section className="feed-section">
            <div className="section-header">
              <h3 className="section-title">Latest Trends</h3>
              {loading && <span className="loading-pill">⟳ Updating…</span>}
            </div>

            {trends.length === 0 && !loading ? (
              <div className="empty-state">
                <span className="empty-icon">📭</span>
                <p>No trends collected yet.<br />
                  <button className="link-btn" onClick={handleRefresh}>Refresh now →</button>
                </p>
              </div>
            ) : (
              <div className="trend-list">
                {trends.map(t => (
                  <a
                    key={t.id}
                    href={t.original_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="trend-card"
                  >
                    {t.thumbnail_url && (
                      <img
                        src={t.thumbnail_url}
                        alt=""
                        className="trend-thumb"
                        loading="lazy"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    )}
                    <div className="trend-body">
                      <div className="trend-meta">
                        {platformBadge(t.source_platform)}
                        {t.source_account && <span className="category-tag">@{t.source_account}</span>}
                        {t.category && t.source_platform !== 'x' && (
                          <span className="category-tag">{t.category}</span>
                        )}
                      </div>
                      <div className="trend-title" lang="zh">{t.title}</div>
                      <p className="trend-context">{t.suggestion?.name ? <>Name candidate: <span lang="zh">{t.suggestion.name}</span> · Review required</> : t.suggestion?.source_alias ? <>Source hook: {t.suggestion.source_alias} · Chinese name review required</> : 'No reviewed name candidate'}</p>
                      <p className="trend-context">{t.suggestion?.reason ?? t.context?.summary}</p>
                      <small className="trend-context-note">{t.context?.score_note}</small>
                      <div className="trend-footer">
                        <div className="trend-stats">
                          {t.likes > 0 && <span>❤️ {t.likes.toLocaleString()}</span>}
                          {t.comments > 0 && <span>💬 {t.comments.toLocaleString()}</span>}
                          {t.shares > 0 && <span>🔁 {t.shares.toLocaleString()}</span>}
                        </div>
                        <div className="trend-score-wrap">
                          <ScoreBar score={t.trend_score} />
                          <span className="trend-score-num">{t.trend_score.toFixed(0)}</span>
                        </div>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
