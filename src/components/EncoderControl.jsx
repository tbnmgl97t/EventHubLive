import React, { useState, useEffect, useRef } from 'react'
import Hls from 'hls.js'
import './EncoderControl.css'

const JW_PLAYER_ID = 'Sx2qhN0M'

const ENCODERS = [
  { id: 'blue',  label: 'Blue Encoder',  accent: '#3b82f6', glow: 'rgba(59,130,246,0.3)', mediaId: 'LOeW3t4d', streamUrl: 'https://cdn.jwplayer.com/live/broadcast/LOeW3t4d.m3u8', streamId: 'LOeW3t4d', ingestUrl: 'srt://ingest-07f51a1cb195.jwplive.com:8000/?streamid=#!::r=live/2U2EkO6H,m=publish' },
  { id: 'red',   label: 'Red Encoder',   accent: '#ef4444', glow: 'rgba(239,68,68,0.3)',  mediaId: 'ruOzZOR2', streamUrl: 'https://cdn.jwplayer.com/live/broadcast/ruOzZOR2.m3u8', streamId: 'ruOzZOR2', ingestUrl: 'srt://ingest-8887b9511ed6.jwplive.com:8000/?streamid=#!::r=live/gcstK3La,m=publish' },
  { id: 'green', label: 'Green Encoder', accent: '#22c55e', glow: 'rgba(34,197,94,0.3)',  mediaId: '2oVNTHgv', streamUrl: 'https://cdn.jwplayer.com/live/broadcast/2oVNTHgv.m3u8', streamId: '2oVNTHgv', ingestUrl: 'srt://ingest-4480e407b9c1.jwplive.com:8000/?streamid=#!::r=live/LO3YbueP,m=publish' },
]

function simulateStep(ms = 1800) {
  return new Promise(res => setTimeout(res, ms))
}

// ── Timer hook ──
function useTimer(running) {
  const [elapsed, setElapsed] = useState(0)
  const ref = useRef(null)

  useEffect(() => {
    if (running) {
      setElapsed(0)
      ref.current = setInterval(() => setElapsed(s => s + 1), 1000)
    } else {
      clearInterval(ref.current)
      setElapsed(0)
    }
    return () => clearInterval(ref.current)
  }, [running])

  const h = String(Math.floor(elapsed / 3600)).padStart(2, '0')
  const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')
  const s = String(elapsed % 60).padStart(2, '0')
  return { formatted: `${h}:${m}:${s}`, seconds: elapsed }
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatDate(ts) {
  return new Date(ts).toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

// ── Step Icon ──
function StepIcon({ status }) {
  if (status === 'done')    return <div className="ec-step-icon done">✓</div>
  if (status === 'error')   return <div className="ec-step-icon error">✕</div>
  if (status === 'running') return <div className="ec-step-icon running" />
  return <div className="ec-step-icon pending" />
}

// ── Preview Player (always-on, muted, small) ──
function PreviewPlayer({ streamUrl, accent, glow, isLive, previewWidth }) {
  const videoRef = useRef(null)
  const hlsRef   = useRef(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    setStatus('loading')

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: false, lowLatencyMode: true })
      hlsRef.current = hls
      hls.loadSource(streamUrl)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}); setStatus('playing') })
      hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) setStatus('error') })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl
      video.addEventListener('loadedmetadata', () => { video.play().catch(() => {}); setStatus('playing') })
      video.addEventListener('error', () => setStatus('error'))
    } else {
      setStatus('error')
    }

    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
      if (video) { video.pause(); video.src = '' }
    }
  }, [streamUrl])

  return (
    <div
      className={`ec-preview-player ${isLive ? 'live' : ''}`}
      style={{ '--accent': accent, '--glow': glow, width: previewWidth ? `${previewWidth}px` : undefined }}
    >
      <div className="ec-preview-player-video-wrap">
        <video ref={videoRef} muted playsInline style={{ display: status === 'playing' ? 'block' : 'none' }} />
        {status !== 'playing' && (
          <div className="ec-preview-player-status">
            {status === 'loading'
              ? <><div className="ec-preview-spinner" style={{ '--accent': accent }} /><span>Loading…</span></>
              : <span>⚠️</span>
            }
          </div>
        )}
      </div>
      <div className="ec-preview-player-footer">
        <span className="ec-preview-footer-label">Preview</span>
        <div className={`ec-preview-footer-dot ${isLive ? 'live' : ''}`} style={{ '--accent': accent }} />
      </div>
    </div>
  )
}

// ── Live Player ──
function LivePlayer({ mediaId, accent, solo }) {
  return (
    <div className={`ec-player-section${solo ? ' solo' : ''}`}>
      <div className="ec-player-label">
        <div className="ec-player-label-dot" style={{ '--accent': accent }} />
        Live Preview
      </div>
      <div className="ec-player-wrap" style={{ '--accent': accent }}>
        <iframe
          src={`https://cdn.jwplayer.com/players/${mediaId}-${JW_PLAYER_ID}.html?autostart=true&mute=true`}
          title="Live Preview"
          frameBorder="0"
          allow="autoplay; fullscreen"
          allowFullScreen
          scrolling="auto"
        />
      </div>
    </div>
  )
}

// ── YouTube Mock Player ──
function YouTubeMockPlayer({ streamUrl }) {
  const videoRef = useRef(null)
  const hlsRef   = useRef(null)
  const [status, setStatus]   = useState('loading')
  const [viewers, setViewers] = useState(Math.floor(Math.random() * 800) + 120)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    setStatus('loading')
    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: false, lowLatencyMode: true })
      hlsRef.current = hls
      hls.loadSource(streamUrl)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}); setStatus('playing') })
      hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) setStatus('error') })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl
      video.addEventListener('loadedmetadata', () => { video.play().catch(() => {}); setStatus('playing') })
      video.addEventListener('error', () => setStatus('error'))
    } else { setStatus('error') }
    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
      if (video) { video.pause(); video.src = '' }
    }
  }, [streamUrl])

  useEffect(() => {
    const interval = setInterval(() => {
      setViewers(v => Math.max(1, v + Math.floor(Math.random() * 15) - 7))
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="ec-yt-player-section">
      <div className="ec-yt-player-label">
        <span className="ec-yt-logo">
          <svg viewBox="0 0 24 17" xmlns="http://www.w3.org/2000/svg">
            <path d="M23.5 2.7S23.2.9 22.4.2C21.4-.8 20.3-.8 19.8-.8 16.5-1 12-1 12-1s-4.5 0-7.8.2C3.7-.8 2.6-.8 1.6.2.8.9.5 2.7.5 2.7S.2 4.8.2 6.9v1.9c0 2.1.3 4.2.3 4.2s.3 1.8 1.1 2.5c1 1 2.4.97 3 1.07C6.5 16.77 12 16.8 12 16.8s4.5 0 7.8-.2c.5-.08 1.6-.08 2.6-1.08.8-.7 1.1-2.5 1.1-2.5s.3-2.1.3-4.2V6.9C23.8 4.8 23.5 2.7 23.5 2.7z"/>
            <polygon points="9.5,12 9.5,4.8 16.2,8.4" fill="#fff"/>
          </svg>
          YouTube
        </span>
        <span style={{ marginLeft: '0.4rem', color: '#475569', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>Live</span>
      </div>
      <div className="ec-yt-player-wrap">
        <video
          ref={videoRef}
          muted
          playsInline
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: status === 'playing' ? 'block' : 'none' }}
        />
        {status !== 'playing' && (
          <div className="ec-yt-mock-screen">
            {status === 'loading'
              ? <><div className="ec-player-spinner" style={{ '--accent': '#ff0000' }} /><span style={{ color: '#666', fontSize: '0.8rem' }}>Connecting…</span></>
              : <span style={{ fontSize: '1.5rem' }}>⚠️</span>
            }
          </div>
        )}
        {status === 'playing' && (
          <div style={{ position: 'absolute', top: '0.6rem', right: '0.75rem' }}>
            <div className="ec-yt-live-badge">
              <div className="ec-yt-live-dot" />
              Live
            </div>
          </div>
        )}
        <div className="ec-yt-controls-bar">
          <div className="ec-yt-controls-left">
            <div className="ec-yt-viewer-count">👁 {viewers.toLocaleString()} watching</div>
          </div>
        </div>
      </div>
    </div>
  )
}

const DEST_OPTIONS = [
  { key: 'website',        label: 'Website' },
  { key: 'youtubeMain',    label: 'YouTube Main Channel' },
  { key: 'youtubeWeather', label: 'YouTube Weather Channel' },
  { key: 'facebook',       label: 'Facebook' },
  { key: 'app',            label: 'App' },
]

const EMPTY_DESTS = { website: false, youtubeMain: false, youtubeWeather: false, facebook: false, app: false }

// ── Copy Field ──
function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="ec-copy-field">
      <span className="ec-copy-field-label">{label}</span>
      <div className="ec-copy-field-row">
        <span className="ec-copy-field-value">{value}</span>
        <button className="ec-copy-field-btn" onClick={handleCopy} title={copied ? 'Copied!' : 'Copy'}>
          {copied
            ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          }
        </button>
      </div>
    </div>
  )
}

// ── FAST Channel Player ──
function FastChannelPlayer() {
  return (
    <div className="ec-fast-channel-section">
      <div className="ec-fast-channel-header">
        <div className="ec-fast-channel-title">
          <div className="ec-fast-channel-dot" />
          FAST Channel
        </div>
        <span className="ec-fast-channel-subtitle">Always-on monitoring feed</span>
      </div>
      <div className="ec-fast-channel-player-wrap">
        <iframe
          src="https://cdn.jwplayer.com/players/BKRDxhn8-Sx2qhN0M.html?autostart=true&mute=true"
          title="FAST Channel"
          frameBorder="0"
          allow="autoplay; fullscreen"
          allowFullScreen
          scrolling="auto"
        />
      </div>
    </div>
  )
}

// ── Go-Live Modal ──
function GoLiveModal({ encoder, onClose, onComplete }) {
  const [title, setTitle] = useState('')
  const [destinations, setDestinations] = useState({ ...EMPTY_DESTS })
  const [steps, setSteps] = useState(null)

  const accent = encoder.accent
  const anySelected = Object.values(destinations).some(Boolean)

  function toggleDest(key) {
    setDestinations(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function buildSteps(dests) {
    const list = []
    if (dests.website) {
      list.push({ key: 'feed',         label: `Enabling live feed on ${encoder.label} page`,         status: 'pending' })
      list.push({ key: 'publish',      label: `Publishing the ${encoder.label} page`,                status: 'pending' })
      list.push({ key: 'videoTitle',   label: `Changing title of ${encoder.label} Video page`,       status: 'pending' })
      list.push({ key: 'videoPublish', label: `Publishing ${encoder.label} Video page`,              status: 'pending' })
    }
    if (dests.youtubeMain)    list.push({ key: 'ytMain',    label: `Publishing ${encoder.label} to Main YouTube`,    status: 'pending' })
    if (dests.youtubeWeather) list.push({ key: 'ytWeather', label: `Publishing ${encoder.label} to Weather YouTube`, status: 'pending' })
    if (dests.facebook)       list.push({ key: 'facebook',  label: `Publishing ${encoder.label} to Facebook`,        status: 'pending' })
    if (dests.app) {
      list.push({ key: 'appFeed',    label: `Enabling live feed on ${encoder.label} App page`, status: 'pending' })
      list.push({ key: 'appPublish', label: `Publishing the ${encoder.label} App page`,        status: 'pending' })
    }
    return list
  }

  function setStepStatus(key, status) {
    setSteps(prev => prev.map(s => s.key === key ? { ...s, status } : s))
  }

  async function runSteps(stepList) {
    for (const step of stepList) {
      setStepStatus(step.key, 'running')
      await simulateStep(1600)
      setStepStatus(step.key, 'done')
    }
    await new Promise(res => setTimeout(res, 400))
    onComplete(title, destinations)
  }

  async function handleStart() {
    if (!title.trim() || !anySelected) return
    const list = buildSteps(destinations)
    setSteps(list)
    runSteps(list)
  }

  const allDone = steps && steps.every(s => s.status === 'done')

  return (
    <div className="ec-overlay" onClick={e => { if (!steps && e.target === e.currentTarget) onClose() }}>
      <div className="ec-modal" style={{ '--accent': accent }}>
        {!steps ? (
          <>
            <h2>Go Live — {encoder.label}</h2>
            <div className="ec-form-group">
              <label>Event Title</label>
              <input
                type="text"
                placeholder="Enter live event title…"
                value={title}
                onChange={e => setTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleStart()}
                autoFocus
              />
            </div>
            <div className="ec-form-group">
              <label className="ec-destinations-label">Destinations</label>
              <div className="ec-destinations-list">
                {DEST_OPTIONS.map(dest => (
                  <label key={dest.key} className="ec-checkbox-row">
                    <input
                      type="checkbox"
                      checked={destinations[dest.key]}
                      onChange={() => toggleDest(dest.key)}
                    />
                    <span>{dest.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="ec-modal-actions">
              <button className="ec-btn-cancel" onClick={onClose}>Cancel</button>
              <button className="ec-btn-confirm" style={{ background: accent }} onClick={handleStart} disabled={!title.trim() || !anySelected}>
                Start Broadcasting
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>Broadcasting…</h2>
            <p className="ec-confirm-title" style={{ color: accent }}>{title}</p>
            <div className="ec-status-panel">
              <h3>Status</h3>
              <div className="ec-status-steps">
                {steps.map(step => (
                  <div key={step.key} className="ec-status-step">
                    <StepIcon status={step.status} />
                    <span className={`ec-step-label ${step.status}`}>{step.label}</span>
                  </div>
                ))}
              </div>
            </div>
            {allDone && (
              <div className="ec-modal-actions">
                <button className="ec-btn-confirm" style={{ background: accent }} onClick={onClose}>Done</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Confirm End Modal ──
function ConfirmEndModal({ encoder, destinations, onClose, onConfirm }) {
  const [steps, setSteps] = useState(null)

  function buildSteps() {
    const list = []
    if (destinations.website) {
      list.push({ key: 'videoUnpublish', label: `Unpublishing ${encoder.label} Video page`,                      status: 'pending' })
      list.push({ key: 'videoTitle',     label: `Setting ${encoder.label} Video page back to default title`,     status: 'pending' })
      list.push({ key: 'unpublish',      label: `Unpublishing the ${encoder.label} page`,                        status: 'pending' })
      list.push({ key: 'feed',           label: `Disabling live feed on ${encoder.label} page`,                  status: 'pending' })
    }
    if (destinations.youtubeMain)    list.push({ key: 'ytMain',      label: `Unpublishing ${encoder.label} from Main YouTube`,    status: 'pending' })
    if (destinations.youtubeWeather) list.push({ key: 'ytWeather',   label: `Unpublishing ${encoder.label} from Weather YouTube`, status: 'pending' })
    if (destinations.facebook)       list.push({ key: 'facebook',    label: `Unpublishing ${encoder.label} from Facebook`,        status: 'pending' })
    if (destinations.app)            list.push({ key: 'appUnpublish',label: `Unpublishing the ${encoder.label} App page`,         status: 'pending' })
    return list
  }

  function setStepStatus(key, status) {
    setSteps(prev => prev.map(s => s.key === key ? { ...s, status } : s))
  }

  async function handleConfirm() {
    const list = buildSteps()
    setSteps(list)
    for (const step of list) {
      setStepStatus(step.key, 'running')
      await simulateStep(1500)
      setStepStatus(step.key, 'done')
    }
    await new Promise(res => setTimeout(res, 400))
    onConfirm()
  }

  const allDone = steps && steps.every(s => s.status === 'done')

  return (
    <div className="ec-overlay" onClick={e => { if (!steps && e.target === e.currentTarget) onClose() }}>
      <div className="ec-modal">
        {!steps ? (
          <>
            <h2>End Live Stream?</h2>
            <p style={{ color: '#94a3b8', marginTop: '0.5rem', fontSize: '0.9rem' }}>
              This will end the live broadcast on <strong style={{ color: encoder.accent }}>{encoder.label}</strong>. This action cannot be undone.
            </p>
            <div className="ec-modal-actions">
              <button className="ec-btn-cancel" onClick={onClose}>Keep Streaming</button>
              <button className="ec-btn-confirm ec-btn-danger" onClick={handleConfirm}>End Stream</button>
            </div>
          </>
        ) : (
          <>
            <h2>Ending Stream…</h2>
            <div className="ec-status-panel" style={{ marginTop: '0.5rem' }}>
              <h3>Status</h3>
              <div className="ec-status-steps">
                {steps.map(step => (
                  <div key={step.key} className="ec-status-step">
                    <StepIcon status={step.status} />
                    <span className={`ec-step-label ${step.status}`}>{step.label}</span>
                  </div>
                ))}
              </div>
            </div>
            {allDone && (
              <div className="ec-modal-actions">
                <button className="ec-btn-confirm ec-btn-danger" onClick={onConfirm}>Done</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Encoder Row ──
function EncoderRow({ encoder, onBroadcastEnd, streams247 = [], streamsLoading, selectedStreamId = '', onSelectStream, readOnly }) {
  const [modal, setModal]           = useState(null)
  const [isLive, setIsLive]         = useState(false)
  const [liveTitle, setLiveTitle]   = useState('')
  const [destinations, setDestinations] = useState({ ...EMPTY_DESTS })
  const [startedAt, setStartedAt]   = useState(null)
  const [previewWidth, setPreviewWidth] = useState(null)
  const cardRef = useRef(null)
  const { formatted: timerDisplay, seconds: elapsed } = useTimer(isLive)

  useEffect(() => {
    const card = cardRef.current
    if (!card) return
    const observer = new ResizeObserver(entries => {
      const h = entries[0].contentRect.height
      if (h > 0) setPreviewWidth(Math.round(h * 16 / 9))
    })
    observer.observe(card)
    return () => observer.disconnect()
  }, [])

  function handleButtonClick() {
    setModal(isLive ? 'confirmEnd' : 'goLive')
  }

  function handleGoLiveComplete(title, dests) {
    setLiveTitle(title)
    setDestinations(dests)
    setStartedAt(Date.now())
    setIsLive(true)
    setModal(null)
  }

  function handleEndStream() {
    const endedAt = Date.now()
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    onBroadcastEnd({ encoder, title: liveTitle, destinations, duration: elapsed, startedAt, endedAt, timezone })
    setIsLive(false)
    setLiveTitle('')
    setDestinations({ ...EMPTY_DESTS })
    setStartedAt(null)
    setModal(null)
  }

  const { accent, glow } = encoder
  const hasYouTube = destinations.youtubeMain || destinations.youtubeWeather

  const selectedChannel   = streams247.find(ch => ch.id === selectedStreamId) || null
  const effectiveMediaId  = selectedChannel?.id         || encoder.mediaId
  const effectiveStreamUrl = selectedChannel?.stream_url || encoder.streamUrl
  const effectiveStreamId  = selectedChannel?.id         || encoder.streamId

  return (
    <>
      <div className="ec-encoder-row-wrapper">
        <div
          ref={cardRef}
          className={`ec-encoder-card ${isLive ? 'live' : ''}`}
          style={{ '--accent': accent, '--glow': glow }}
        >
          <div className="ec-encoder-card-top">
            <div className="ec-encoder-info">
              <div className="ec-color-dot" style={{ background: accent }} />
              <div>
                <div className="ec-encoder-label">{encoder.label}</div>
                {isLive && (
                  <div className="ec-live-badge">
                    <div className="ec-live-dot" style={{ background: accent }} />
                    <span className="ec-live-text" style={{ color: accent }}>Live</span>
                    <span className="ec-live-timer">{timerDisplay}</span>
                  </div>
                )}
                {isLive && liveTitle && (
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.2rem' }}>{liveTitle}</div>
                )}
                {isLive && (
                  <div className="ec-live-destinations">
                    {destinations.website        && <span className="ec-live-dest-badge">Website</span>}
                    {destinations.youtubeMain    && <span className="ec-live-dest-badge yt">▶ YT Main</span>}
                    {destinations.youtubeWeather && <span className="ec-live-dest-badge yt">▶ YT Weather</span>}
                    {destinations.facebook       && <span className="ec-live-dest-badge fb">Facebook</span>}
                    {destinations.app            && <span className="ec-live-dest-badge">App</span>}
                  </div>
                )}
              </div>
            </div>

            <button
              className={`ec-go-live-btn ${isLive ? 'live' : 'idle'}`}
              style={isLive ? { borderColor: accent, color: accent } : { background: accent }}
              onClick={handleButtonClick}
              disabled={readOnly}
              title={readOnly ? 'Read-only access — cannot start or stop streams' : undefined}
            >
              {isLive ? '⏹ End Stream' : `Go Live on ${encoder.label}`}
            </button>
          </div>

          {!isLive && (
            <div className="ec-stream-credentials">
              <div className="ec-stream-select-row">
                <span className="ec-copy-field-label">24/7 STREAM</span>
                <select
                  className="ec-stream-select"
                  value={selectedStreamId}
                  onChange={e => onSelectStream(e.target.value)}
                >
                  <option value="">{streamsLoading ? 'Loading streams…' : 'Default preview'}</option>
                  {streams247.map(ch => (
                    <option key={ch.id} value={ch.id}>{ch.name}</option>
                  ))}
                </select>
              </div>
              <CopyField label="Stream ID" value={effectiveStreamId} />
              <CopyField label="Stream URL" value={encoder.ingestUrl} />
            </div>
          )}

          {isLive && !hasYouTube && (
            <LivePlayer mediaId={effectiveMediaId} accent={accent} solo />
          )}
          {isLive && hasYouTube && (
            <div className="ec-players-row">
              <LivePlayer mediaId={effectiveMediaId} accent={accent} />
              <YouTubeMockPlayer streamUrl={effectiveStreamUrl} />
            </div>
          )}
        </div>

        {!isLive && (
          <PreviewPlayer
            streamUrl={effectiveStreamUrl}
            accent={accent}
            glow={glow}
            isLive={isLive}
            previewWidth={previewWidth}
          />
        )}
      </div>

      {modal === 'goLive' && (
        <GoLiveModal encoder={encoder} onClose={() => setModal(null)} onComplete={handleGoLiveComplete} />
      )}
      {modal === 'confirmEnd' && (
        <ConfirmEndModal encoder={encoder} destinations={destinations} onClose={() => setModal(null)} onConfirm={handleEndStream} />
      )}
    </>
  )
}

// ── Live Stream History ──
function BroadcastHistory({ history, onClear, loading }) {
  const [confirming, setConfirming] = useState(false)
  const [page, setPage] = useState(1)
  const PER_PAGE = 5

  const totalPages = Math.max(1, Math.ceil(history.length / PER_PAGE))
  const safePage   = Math.min(page, totalPages)
  const pageItems  = history.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE)

  useEffect(() => { setPage(1) }, [history.length])

  function pageNumbers() {
    const pages = []
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || Math.abs(i - safePage) <= 1) {
        pages.push(i)
      } else if (pages[pages.length - 1] !== '…') {
        pages.push('…')
      }
    }
    return pages
  }

  if (loading) {
    return (
      <div className="ec-history-section">
        <div className="ec-history-header"><h2>Live Stream History</h2></div>
        <div className="ec-history-empty" style={{ color: '#475569' }}>
          <span style={{ display: 'inline-block', animation: 'ec-pulse 1.2s ease-in-out infinite' }}>Loading history…</span>
        </div>
      </div>
    )
  }

  if (history.length === 0) {
    return (
      <div className="ec-history-section">
        <div className="ec-history-header"><h2>Live Stream History</h2></div>
        <div className="ec-history-empty">No broadcasts yet</div>
      </div>
    )
  }

  return (
    <div className="ec-history-section">
      {confirming && (
        <div className="ec-overlay" onClick={() => setConfirming(false)}>
          <div className="ec-modal" onClick={e => e.stopPropagation()}>
            <h2>Clear History?</h2>
            <p style={{ color: '#94a3b8', marginTop: '0.5rem', fontSize: '0.9rem' }}>
              This will permanently remove all broadcast history. This action cannot be undone.
            </p>
            <div className="ec-modal-actions">
              <button className="ec-btn-cancel" onClick={() => setConfirming(false)}>Cancel</button>
              <button className="ec-btn-confirm ec-btn-danger" onClick={() => { setConfirming(false); onClear() }}>Clear History</button>
            </div>
          </div>
        </div>
      )}
      <div className="ec-history-header">
        <h2>Live Stream History</h2>
        <button className="ec-btn-clear" onClick={() => setConfirming(true)}>Clear History</button>
      </div>
      <div className="ec-history-list">
        {pageItems.map((item, i) => (
          <div key={i} className="ec-history-item">
            <div className="ec-history-color-dot" style={{ background: item.encoder.accent }} />
            <div className="ec-history-info">
              <div className="ec-history-title">{item.title}</div>
              <div className="ec-history-meta">
                <span className="ec-history-encoder" style={{ color: item.encoder.accent }}>{item.encoder.label}</span>
                <span className="ec-history-duration">⏱ {formatDuration(item.duration)}</span>
                {item.startedAt && <span className="ec-history-date">▶ {formatDate(item.startedAt)}</span>}
                <span className="ec-history-date">⏹ {formatDate(item.endedAt)}</span>
                {item.timezone && <span className="ec-history-timezone">{item.timezone}</span>}
                {item.destinations?.website        && <span className="ec-history-dest-badge">Website</span>}
                {item.destinations?.youtubeMain    && <span className="ec-history-yt-badge">▶ YT Main</span>}
                {item.destinations?.youtubeWeather && <span className="ec-history-yt-badge">▶ YT Weather</span>}
                {item.destinations?.facebook       && <span className="ec-history-dest-badge">Facebook</span>}
                {item.destinations?.app            && <span className="ec-history-dest-badge">App</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="ec-pagination">
          <button className="ec-page-btn" onClick={() => setPage(p => p - 1)} disabled={safePage === 1}>‹</button>
          {pageNumbers().map((p, i) =>
            p === '…'
              ? <span key={`ellipsis-${i}`} className="ec-page-info">…</span>
              : <button key={p} className={`ec-page-btn ${p === safePage ? 'active' : ''}`} onClick={() => setPage(p)}>{p}</button>
          )}
          <button className="ec-page-btn" onClick={() => setPage(p => p + 1)} disabled={safePage === totalPages}>›</button>
        </div>
      )}
    </div>
  )
}

// ── Encoder Control ──
export default function EncoderControl({ token, tenantId, readOnly }) {
  const [history, setHistory]           = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [streams247, setStreams247]         = useState([])
  const [streamsLoading, setStreamsLoading] = useState(true)
  const [streamSelections, setStreamSelections] = useState(() => {
    try { return JSON.parse(localStorage.getItem('encoderStreamSelections') || '{}') } catch { return {} }
  })

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = localStorage.getItem('encoderBroadcastHistory')
        if (saved) setHistory(JSON.parse(saved))
      } catch {}
      setHistoryLoading(false)
    }, 400)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!token || !tenantId) { setStreamsLoading(false); return }
    fetch('/api/channels', { headers: { Authorization: `Bearer ${token}`, 'X-Tenant-Id': tenantId } })
      .then(r => r.ok ? r.json() : { channels: [] })
      .then(data => setStreams247((data.channels || []).filter(ch => ch.stream_type === '24/7')))
      .catch(() => setStreams247([]))
      .finally(() => setStreamsLoading(false))
  }, [token, tenantId])

  function handleBroadcastEnd(entry) {
    setHistory(prev => {
      const next = [entry, ...prev]
      localStorage.setItem('encoderBroadcastHistory', JSON.stringify(next))
      return next
    })
  }

  function handleClearHistory() {
    localStorage.removeItem('encoderBroadcastHistory')
    setHistory([])
  }

  function handleSelectStream(encoderId, channelId) {
    setStreamSelections(prev => {
      const next = { ...prev, [encoderId]: channelId || undefined }
      if (!channelId) delete next[encoderId]
      localStorage.setItem('encoderStreamSelections', JSON.stringify(next))
      return next
    })
  }

  return (
    <div className="ec-root">
      <div className="ec-encoders">
        {ENCODERS.map(enc => (
          <EncoderRow
            key={enc.id}
            encoder={enc}
            onBroadcastEnd={handleBroadcastEnd}
            streams247={streams247}
            streamsLoading={streamsLoading}
            selectedStreamId={streamSelections[enc.id] || ''}
            onSelectStream={channelId => handleSelectStream(enc.id, channelId)}
            readOnly={readOnly}
          />
        ))}
      </div>
      <FastChannelPlayer />
      <BroadcastHistory history={history} onClear={handleClearHistory} loading={historyLoading} />
    </div>
  )
}
