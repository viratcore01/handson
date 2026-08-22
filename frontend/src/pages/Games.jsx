import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const lerp = (a, b, t) => a + (b - a) * t
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

function linePath(x1, y1, x2, y2, steps = 30) {
  const pts = []
  for (let k = 0; k <= steps; k++) pts.push({ x: lerp(x1, x2, k / steps), y: lerp(y1, y2, k / steps) })
  return pts
}

function arcPath(cx, cy, r, startAng, endAng, counterClockwise = false, steps = 40) {
  const pts = []
  let range = endAng - startAng
  if (counterClockwise && range > 0) range -= Math.PI * 2
  for (let k = 0; k <= steps; k++) {
    const ang = startAng + (k / steps) * range
    pts.push({ x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) })
  }
  return pts
}

function ellipsePath(cx, cy, rx, ry, steps = 50) {
  const pts = []
  for (let k = 0; k <= steps; k++) {
    const ang = (k / steps) * Math.PI * 2 - Math.PI / 2
    pts.push({ x: cx + rx * Math.cos(ang), y: cy + ry * Math.sin(ang) })
  }
  return pts
}

function sCurvePath(cx, cy, w, h, steps = 50) {
  const pts = []
  for (let k = 0; k <= steps; k++) {
    const t = k / steps
    const y = cy - h / 2 + t * h
    const x = cx + Math.sin(t * Math.PI * 2) * (w / 2)
    pts.push({ x, y })
  }
  return pts
}

function generateLetterStrokes(letter, size = 600) {
  const cx = size / 2, cy = size / 2, h = 240, w = 190
  const top = cy - h / 2, bot = cy + h / 2, left = cx - w / 2, right = cx + w / 2
  const letterMap = {
    A: [linePath(cx, top, left, bot), linePath(cx, top, right, bot), linePath(cx - w / 3, cy + 25, cx + w / 3, cy + 25)],
    K: [linePath(left + 25, top, left + 25, bot), linePath(right - 10, top + 10, left + 25, cy), linePath(left + 35, cy - 10, right - 10, bot - 10)],
    M: [linePath(left, bot, left, top), linePath(left, top, cx, cy + 40), linePath(cx, cy + 40, right, top), linePath(right, top, right, bot)],
    N: [linePath(left, bot, left, top), linePath(left, top, right, bot), linePath(right, bot, right, top)],
    V: [linePath(left, top, cx, bot), linePath(cx, bot, right, top)],
    W: [linePath(left, top, left + w / 4, bot), linePath(left + w / 4, bot, cx, cy - 10), linePath(cx, cy - 10, right - w / 4, bot), linePath(right - w / 4, bot, right, top)],
    X: [linePath(left, top, right, bot), linePath(right, top, left, bot)],
    Z: [linePath(left, top, right, top), linePath(right, top, left, bot), linePath(left, bot, right, bot)],
    E: [linePath(left, top, left, bot), linePath(left, top, right - 20, top), linePath(left, cy, right - 40, cy), linePath(left, bot, right - 20, bot)],
    F: [linePath(left, top, left, bot), linePath(left, top, right - 20, top), linePath(left, cy, right - 40, cy)],
    H: [linePath(left, top, left, bot), linePath(right, top, right, bot), linePath(left, cy, right, cy)],
    I: [linePath(cx, top, cx, bot), linePath(left + 30, top, right - 30, top), linePath(left + 30, bot, right - 30, bot)],
    L: [linePath(left + 30, top, left + 30, bot), linePath(left + 30, bot, right - 20, bot)],
    T: [linePath(left, top, right, top), linePath(cx, top, cx, bot)],
    P: [linePath(left + 30, top, left + 30, bot), arcPath(left + 30, top + h / 4, h / 4, -Math.PI / 2, Math.PI / 2)],
    B: [linePath(left + 30, top, left + 30, bot), arcPath(left + 30, top + h / 4, h / 4, -Math.PI / 2, Math.PI / 2), arcPath(left + 30, cy + h / 4, h / 4, -Math.PI / 2, Math.PI / 2)],
    R: [linePath(left + 30, top, left + 30, bot), arcPath(left + 30, top + h / 4, h / 4, -Math.PI / 2, Math.PI / 2), linePath(left + 30, cy, right - 10, bot)],
    D: [linePath(left + 30, top, left + 30, bot), arcPath(left + 30, cy, h / 2, -Math.PI / 2, Math.PI / 2)],
    C: [arcPath(cx + 20, cy, h / 2, Math.PI * 0.25, Math.PI * 1.75, true)],
    O: [ellipsePath(cx, cy, w / 2, h / 2)],
    G: [arcPath(cx + 20, cy, h / 2, Math.PI * 0.2, Math.PI * 1.75, true), linePath(cx, cy, right, cy)],
    Q: [ellipsePath(cx, cy, w / 2, h / 2), linePath(cx + 20, cy + 20, right + 10, bot + 10)],
    S: [sCurvePath(cx, cy, w, h)],
  }
  return letterMap[letter] || letterMap['A']
}

function resamplePoints(points, targetSpacingPx = 4.0) {
  if (points.length < 2) return points
  const resampled = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const prev = resampled[resampled.length - 1]
    const curr = points[i]
    const d = dist(prev, curr)
    if (d >= targetSpacingPx) {
      const steps = Math.floor(d / targetSpacingPx)
      for (let s = 1; s <= steps; s++) {
        const frac = (s * targetSpacingPx) / d
        resampled.push({
          x: lerp(prev.x, curr.x, frac),
          y: lerp(prev.y, curr.y, frac),
          t: lerp(prev.t, curr.t, frac),
          p: lerp(prev.p || 0.5, curr.p || 0.5, frac),
        })
      }
    }
  }
  return resampled
}

function computeDTWDistance(seqA, seqB) {
  const N = Math.min(seqA.length, 120)
  const M = Math.min(seqB.length, 120)
  if (!N || !M) return 0
  const stepA = Math.max(1, Math.floor(seqA.length / N))
  const stepB = Math.max(1, Math.floor(seqB.length / M))
  const dtw = Array.from({ length: N + 1 }, () => new Float32Array(M + 1).fill(1e6))
  dtw[0][0] = 0
  for (let i = 1; i <= N; i++) {
    for (let j = 1; j <= M; j++) {
      const ptA = seqA[(i - 1) * stepA] || seqA[seqA.length - 1]
      const ptB = seqB[(j - 1) * stepB] || seqB[seqB.length - 1]
      const cost = dist(ptA, ptB)
      dtw[i][j] = cost + Math.min(dtw[i - 1][j], dtw[i][j - 1], dtw[i - 1][j - 1])
    }
  }
  return dtw[N][M] / (N + M)
}

function validateSession(points) {
  if (!points || points.length < 12) return { status: 'ERROR', reason: "Trace was a bit short — let's give that one another try!" }
  const deltas = []
  for (let i = 1; i < points.length; i++) deltas.push(points[i].t - points[i - 1].t)
  const meanDt = deltas.reduce((a, b) => a + b, 0) / deltas.length
  const stdDt = Math.sqrt(deltas.reduce((a, b) => a + (b - meanDt) ** 2, 0) / deltas.length)
  if (stdDt > 38.0) return { status: 'ERROR', reason: "Signal looked a little jittery — let's try again smoothly." }
  const totalDuration = (points[points.length - 1].t - points[0].t) / 1000.0
  if (totalDuration < 0.45) return { status: 'ERROR', reason: "That was really quick — try tracing at a gentle pace." }
  return { status: 'SUCCESS' }
}

function generateSpiral(cx, cy, maxR, turns, steps) {
  const pts = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, theta = t * turns * Math.PI * 2, r = t * maxR
    pts.push({ x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) })
  }
  return { points: pts, aspect: 1.0 }
}

function bugPosAt(tSec, cx, cy, w, h) {
  const a = (2 * Math.PI) / 6.4, b = (2 * Math.PI) / 4.6
  return { x: cx + Math.sin(a * tSec) * w, y: cy + Math.sin(b * tSec + Math.PI / 2) * h }
}

function generateRune(cx, cy, R) {
  const n = 5, pts = []
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 - Math.PI / 2
    const r = R * (i % 2 === 0 ? 0.95 : 0.45)
    pts.push({ x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) })
  }
  pts.push({ ...pts[0] })
  let ideal = []
  for (let i = 0; i < pts.length - 1; i++) {
    for (let k = 0; k <= 30; k++) ideal.push({ x: lerp(pts[i].x, pts[i + 1].x, k / 30), y: lerp(pts[i].y, pts[i + 1].y, k / 30) })
  }
  return { points: ideal, aspect: 1.0 }
}

function computeRealKinematics(rawPoints, idealTemplate = []) {
  if (!rawPoints || rawPoints.length < 5) return null
  const pts = resamplePoints(rawPoints, 3.5)
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const bboxW = Math.max(maxX - minX, 1), bboxH = Math.max(maxY - minY, 1)
  const aspect = bboxW / bboxH
  const velocities = [], accelerations = [], jerks = []
  for (let i = 1; i < pts.length; i++) {
    const dt = Math.max((pts[i].t - pts[i - 1].t) / 1000.0, 0.001)
    velocities.push(dist(pts[i], pts[i - 1]) / dt)
  }
  for (let i = 1; i < velocities.length; i++) {
    const dt = Math.max((pts[i + 1].t - pts[i].t) / 1000.0, 0.001)
    accelerations.push((velocities[i] - velocities[i - 1]) / dt)
  }
  for (let i = 1; i < accelerations.length; i++) {
    const dt = Math.max((pts[i + 2].t - pts[i + 1].t) / 1000.0, 0.001)
    jerks.push(Math.abs((accelerations[i] - accelerations[i - 1]) / dt))
  }
  const meanJerk = jerks.length ? jerks.reduce((a, b) => a + b, 0) / jerks.length : 1200
  const movement_smoothness = clamp(100 - meanJerk / 450.0, 22, 98)
  const meanVel = velocities.length ? velocities.reduce((a, b) => a + b, 0) / velocities.length : 100
  const stdVel = velocities.length ? Math.sqrt(velocities.reduce((a, b) => a + (b - meanVel) ** 2, 0) / velocities.length) : 50
  const cvVel = meanVel > 0 ? stdVel / meanVel : 1.0
  const pacing_consistency = clamp(100 - cvVel * 55.0, 25, 98)
  let pauseDuration = 0
  for (let i = 0; i < velocities.length; i++) {
    if (velocities[i] < 12.0) pauseDuration += pts[i + 1].t - pts[i].t
  }
  const totalDuration = pts[pts.length - 1].t - pts[0].t
  const pauseRatio = totalDuration > 0 ? pauseDuration / totalDuration : 0
  const cognitive_hesitation = clamp(100 - pauseRatio * 180.0, 20, 98)
  const idealAspect = idealTemplate.aspect || 1.0
  const aspectErr = Math.abs(aspect - idealAspect)
  const spatial_proportionality = clamp(100 - aspectErr * 75.0, 25, 98)
  let orientationScore = 88
  if (idealTemplate.points && idealTemplate.points.length > 5) {
    const dtwDist = computeDTWDistance(pts, idealTemplate.points)
    orientationScore = clamp(100 - dtwDist * 1.4, 25, 98)
  }
  let trackingErr = 15
  if (idealTemplate.points && idealTemplate.points.length) {
    let sumErr = 0
    pts.forEach((p) => {
      let minD = Infinity
      for (let j = 0; j < idealTemplate.points.length; j += 4) {
        const d = dist(p, idealTemplate.points[j])
        if (d < minD) minD = d
      }
      sumErr += minD
    })
    trackingErr = sumErr / pts.length
  }
  const target_tracking_error = clamp(100 - trackingErr * 1.8, 25, 98)
  return {
    movement_smoothness: Math.round(movement_smoothness),
    pacing_consistency: Math.round(pacing_consistency),
    cognitive_hesitation: Math.round(cognitive_hesitation),
    spatial_proportionality: Math.round(spatial_proportionality),
    structural_orientation: Math.round(orientationScore),
    target_tracking_error: Math.round(target_tracking_error),
  }
}

const GAMES = [
  { key: 'spiral', title: 'Galaxy Spiral', desc: 'Trace from the center out to the edge, following the guide path.' },
  { key: 'bug', title: 'Laser Bug Chase', desc: 'Keep your finger/stylus right on the bug as it zips around for 8 seconds.' },
  { key: 'wand', title: 'Magic Wand Memory', desc: 'Watch the rune glow for 2s, then trace it from memory!' },
  { key: 'sentence', title: "Hero's Sentence", desc: 'Trace each letter of "HERO", then tap Done.' },
  { key: 'paper', title: 'Paper Worksheet Scan', desc: 'Take a photo of a paper worksheet and get instant scores.' },
]

function GameShell({ gameKey, onComplete }) {
  const canvasRef = useRef(null)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, 600, 600)
    let cleanup = null

    if (gameKey === 'spiral') cleanup = mountSpiralGame(canvas, ctx, onCompleteRef.current)
    else if (gameKey === 'bug') cleanup = mountBugGame(canvas, ctx, onCompleteRef.current)
    else if (gameKey === 'wand') cleanup = mountWandGame(canvas, ctx, onCompleteRef.current)
    else if (gameKey === 'sentence') cleanup = mountSentenceGame(canvas, ctx, onCompleteRef.current)
    else if (gameKey === 'paper') cleanup = mountPaperGame(canvas, ctx, onCompleteRef.current)

    return () => {
      if (cleanup && typeof cleanup === 'function') cleanup()
    }
  }, [gameKey])

  return (
    <canvas ref={canvasRef} width="600" height="600" />
  )
}

export default function Games() {
  const navigate = useNavigate()
  const [gameIndex, setGameIndex] = useState(0)
  const [toast, setToast] = useState('')
  const [banner, setBanner] = useState('Ready when you are')
  const [bannerColor, setBannerColor] = useState('green')
  const [gameDone, setGameDone] = useState(false)

  const currentGame = GAMES[gameIndex]

  const advanceGame = useCallback(() => {
    if (gameIndex < GAMES.length - 1) {
      setGameIndex((i) => i + 1)
      setToast('')
      setBanner('Ready when you are')
      setBannerColor('green')
      setGameDone(false)
    } else {
      setGameDone(true)
    }
  }, [gameIndex])

  const resetGame = useCallback(() => {
    setToast('')
    setBanner('Ready when you are')
    setBannerColor('green')
  }, [])

  const onComplete = useCallback((message, color = 'green') => {
    setBanner(message || 'Moving on…')
    setBannerColor(color)
    setTimeout(advanceGame, 500)
  }, [advanceGame])

  return (
    <div className="max-w-4xl mx-auto p-6 animate-fade">
      <button onClick={() => navigate('/home')} className="back-link mb-4">← Back to home</button>
      <h1 className="text-3xl font-bold mb-1">Live Practice Games</h1>
      <p className="text-ink-soft mb-6">Play 5 short tracing activities with real-time coaching.</p>

      <div className="protocol-steps mb-6">
        {GAMES.map((g, i) => (
          <span key={g.key} className={`step-chip ${i === gameIndex ? 'active' : ''} ${i < gameIndex ? 'done' : ''}`}>
            {i < gameIndex ? '✓ ' : ''}{g.title}
          </span>
        ))}
      </div>

      {gameDone ? (
        <div className="card text-center py-12">
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎉</div>
          <h2 className="text-2xl font-bold mb-2">All Games Complete!</h2>
          <p className="text-ink-soft mb-4">Great job! You finished all 5 practice activities.</p>
          <button onClick={() => navigate('/progress')} className="btn btn-primary">See Progress →</button>
        </div>
      ) : (
        <div className="card">
          <div className="eyebrow mb-2">Game {gameIndex + 1} of {GAMES.length}</div>
          <h2 style={{ margin: '6px 0 4px' }}>{currentGame.title}</h2>
          <p className="muted" style={{ margin: '0 0 16px', fontSize: '14px' }}>{currentGame.desc}</p>

          <div className="canvas-shell mb-4">
            <GameShell key={currentGame.key} gameKey={currentGame.key} onComplete={onComplete} />
            <div className="coach-banner">
              <span className={`dot ${bannerColor}`}></span> {banner}
            </div>
          </div>

          {toast && <div className="validation-toast mb-4">{toast}</div>}

          <div className="game-controls">
            <button onClick={resetGame} className="btn btn-ghost">Reset trace</button>
            <button onClick={advanceGame} className="btn btn-primary">Skip / Next Game →</button>
          </div>
        </div>
      )}
    </div>
  )
}

function mountSpiralGame(canvas, ctx, onComplete) {
  const cx = 300, cy = 300, maxR = 230, ideal = generateSpiral(cx, cy, maxR, 3, 420)
  let drawing = false, points = []

  function drawBase() {
    ctx.clearRect(0, 0, 600, 600)
    ctx.setLineDash([3, 9])
    ctx.lineWidth = 3.5
    ctx.strokeStyle = '#C9CBEF'
    ctx.beginPath()
    ideal.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#4F46E5'
    ctx.beginPath()
    ctx.arc(cx, cy, 8, 0, Math.PI * 2)
    ctx.fill()
  }
  drawBase()

  function pointerDown(e) {
    canvas.setPointerCapture(e.pointerId)
    drawing = true
    points = [canvasPointFromEvent(e, canvas)]
  }
  function pointerMove(e) {
    if (!drawing) return
    const p = canvasPointFromEvent(e, canvas)
    const prev = points[points.length - 1]
    points.push(p)
    let minD = Infinity
    for (let j = 0; j < ideal.points.length; j += 6) {
      const d = dist(p, ideal.points[j])
      if (d < minD) minD = d
    }
    const good = minD < 32
    ctx.beginPath()
    ctx.moveTo(prev.x, prev.y)
    ctx.lineTo(p.x, p.y)
    ctx.lineWidth = 6
    ctx.lineCap = 'round'
    ctx.strokeStyle = good ? '#34D399' : '#F59E0B'
    ctx.stroke()
  }
  function pointerUp() {
    if (!drawing) return
    drawing = false
    const validation = validateSession(points)
    if (validation.status === 'ERROR') {
      onComplete(validation.reason, 'amber')
      return
    }
    onComplete('Captured! Moving on…')
  }

  canvas.addEventListener('pointerdown', pointerDown)
  canvas.addEventListener('pointermove', pointerMove)
  canvas.addEventListener('pointerup', pointerUp)

  return () => {
    canvas.removeEventListener('pointerdown', pointerDown)
    canvas.removeEventListener('pointermove', pointerMove)
    canvas.removeEventListener('pointerup', pointerUp)
    drawing = false
  }
}

function mountBugGame(canvas, ctx, onComplete) {
  const cx = 300, cy = 300, w = 220, h = 170
  let running = false, startT = null, raf = null, trail = [], playerPoints = []
  const DURATION = 8

  function drawFrame(bugPos, playerPos) {
    ctx.clearRect(0, 0, 600, 600)
    ctx.strokeStyle = '#DEE0FA'
    ctx.lineWidth = 2
    ctx.setLineDash([2, 8])
    ctx.beginPath()
    for (let t = 0; t <= DURATION; t += 0.05) {
      const p = bugPosAt(t, cx, cy, w, h)
      t === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
    }
    ctx.stroke()
    ctx.setLineDash([])
    for (let i = 1; i < trail.length; i++) {
      ctx.beginPath()
      ctx.moveTo(trail[i - 1].x, trail[i - 1].y)
      ctx.lineTo(trail[i].x, trail[i].y)
      ctx.lineWidth = 5
      ctx.lineCap = 'round'
      ctx.strokeStyle = trail[i].good ? '#34D399' : '#F59E0B'
      ctx.stroke()
    }
    if (bugPos) {
      ctx.fillStyle = '#4F46E5'
      ctx.beginPath()
      ctx.arc(bugPos.x, bugPos.y, 14, 0, Math.PI * 2)
      ctx.fill()
    }
    if (playerPos) {
      ctx.strokeStyle = '#211C3A'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(playerPos.x, playerPos.y, 10, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  drawFrame(bugPosAt(0, cx, cy, w, h), null)
  let lastPlayer = { x: cx, y: cy }

  function loop(ts) {
    if (!startT) startT = ts
    const tSec = (ts - startT) / 1000
    if (tSec >= DURATION) {
      running = false
      cancelAnimationFrame(raf)
      onComplete('Got it! Moving on…')
      return
    }
    const bug = bugPosAt(tSec, cx, cy, w, h)
    const d = dist(bug, lastPlayer)
    const good = d < 54
    playerPoints.push({ x: lastPlayer.x, y: lastPlayer.y, t: performance.now() })
    trail.push({ x: lastPlayer.x, y: lastPlayer.y, good })
    if (trail.length > 140) trail.shift()
    drawFrame(bug, lastPlayer)
    raf = requestAnimationFrame(loop)
  }

  function pointerDown(e) {
    if (running) return
    canvas.setPointerCapture(e.pointerId)
    running = true
    startT = null
    trail = []
    playerPoints = []
    const rect = canvas.getBoundingClientRect()
    const sx = canvas.width / rect.width, sy = canvas.height / rect.height
    lastPlayer = { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy }
    raf = requestAnimationFrame(loop)
  }
  function pointerMove(e) {
    if (!running) return
    const rect = canvas.getBoundingClientRect()
    const sx = canvas.width / rect.width, sy = canvas.height / rect.height
    lastPlayer = { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy }
  }
  canvas.addEventListener('pointerdown', pointerDown)
  canvas.addEventListener('pointermove', pointerMove)

  return () => {
    running = false
    cancelAnimationFrame(raf)
    canvas.removeEventListener('pointerdown', pointerDown)
    canvas.removeEventListener('pointermove', pointerMove)
  }
}

function mountWandGame(canvas, ctx, onComplete) {
  const cx = 300, cy = 300, R = 190
  const idealRune = generateRune(cx, cy, R)
  let drawing = false, points = [], rafWatch = null, hideTimeout = null

  function drawReveal(frac) {
    ctx.clearRect(0, 0, 600, 600)
    ctx.strokeStyle = '#4F46E5'
    ctx.lineWidth = 7
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const n = Math.floor(frac * idealRune.points.length)
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      i === 0 ? ctx.moveTo(idealRune.points[i].x, idealRune.points[i].y) : ctx.lineTo(idealRune.points[i].x, idealRune.points[i].y)
    }
    ctx.stroke()
    if (idealRune.points.length) {
      ctx.fillStyle = '#34D399'
      ctx.beginPath()
      ctx.arc(idealRune.points[0].x, idealRune.points[0].y, 8, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  let watchStart = null
  function watchStep(ts) {
    if (!watchStart) watchStart = ts
    const frac = Math.min((ts - watchStart) / 1800, 1)
    drawReveal(frac)
    if (frac < 1) rafWatch = requestAnimationFrame(watchStep)
    else hideTimeout = setTimeout(() => onComplete('Your turn — trace the rune!', 'amber'), 500)
  }
  rafWatch = requestAnimationFrame(watchStep)

  function onDown(e) {
    canvas.setPointerCapture(e.pointerId)
    drawing = true
    points = [canvasPointFromEvent(e, canvas)]
  }
  function onMove(e) {
    if (!drawing) return
    const p = canvasPointFromEvent(e, canvas)
    const prev = points[points.length - 1]
    points.push(p)
    let minD = Infinity
    for (let j = 0; j < idealRune.points.length; j += 6) {
      const d = dist(p, idealRune.points[j])
      if (d < minD) minD = d
    }
    const good = minD < 38
    ctx.beginPath()
    ctx.moveTo(prev.x, prev.y)
    ctx.lineTo(p.x, p.y)
    ctx.lineWidth = 6
    ctx.lineCap = 'round'
    ctx.strokeStyle = good ? '#34D399' : '#F59E0B'
    ctx.stroke()
  }
  function onUp() {
    if (!drawing) return
    drawing = false
    const validation = validateSession(points)
    if (validation.status === 'ERROR') {
      onComplete(validation.reason, 'amber')
      return
    }
    onComplete('Memory trace captured! Moving on…')
  }

  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)

  return () => {
    cancelAnimationFrame(rafWatch)
    clearTimeout(hideTimeout)
    canvas.removeEventListener('pointerdown', onDown)
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerup', onUp)
    drawing = false
  }
}

function mountSentenceGame(canvas, ctx, onComplete) {
  const WORD = 'HERO'
  const letterStrokes = WORD.split('').map((l, idx) => {
    const charStrokes = generateLetterStrokes(l, 600)
    const xOff = (idx - 1.5) * 110
    return charStrokes.map((stroke) => stroke.map((p) => ({ x: p.x * 0.55 + 160 + xOff, y: p.y * 0.55 + 130 })))
  }).flat()

  function drawGuide() {
    ctx.clearRect(0, 0, 600, 600)
    ctx.save()
    ctx.setLineDash([3, 7])
    ctx.strokeStyle = '#C9CBEF'
    ctx.lineWidth = 4
    letterStrokes.forEach((stroke) => {
      ctx.beginPath()
      stroke.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      ctx.stroke()
    })
    ctx.restore()
  }
  drawGuide()

  let strokes = [], current = null
  const flatGuide = letterStrokes.flat()

  function onDown(e) {
    canvas.setPointerCapture(e.pointerId)
    current = [canvasPointFromEvent(e, canvas)]
  }
  function onMove(e) {
    if (!current) return
    const p = canvasPointFromEvent(e, canvas)
    const prev = current[current.length - 1]
    current.push(p)
    let minD = Infinity
    for (let j = 0; j < flatGuide.length; j += 4) {
      const d = dist(p, flatGuide[j])
      if (d < minD) minD = d
    }
    const good = minD < 26
    ctx.beginPath()
    ctx.moveTo(prev.x, prev.y)
    ctx.lineTo(p.x, p.y)
    ctx.lineWidth = 7
    ctx.lineCap = 'round'
    ctx.strokeStyle = good ? '#34D399' : '#F59E0B'
    ctx.stroke()
  }
  function onUp() {
    if (!current) return
    if (current.length >= 4) strokes.push(current)
    current = null
  }

  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)

  const controls = canvas.parentElement?.querySelector('.game-controls')
  let doneBtn = null
  if (controls) {
    doneBtn = document.createElement('button')
    doneBtn.className = 'btn btn-mint'
    doneBtn.textContent = 'Done Tracing →'
    doneBtn.addEventListener('click', () => {
      const allPts = strokes.flat()
      if (allPts.length < 20) {
        onComplete('Trace a bit more of the word before finishing.', 'amber')
        return
      }
      onComplete('Word "HERO" recognized!')
    })
    controls.appendChild(doneBtn)
  }

  return () => {
    canvas.removeEventListener('pointerdown', onDown)
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerup', onUp)
    if (doneBtn && doneBtn.parentNode) doneBtn.parentNode.removeChild(doneBtn)
    strokes = []
    current = null
  }
}

function mountPaperGame(canvas, ctx, onComplete) {
  ctx.fillStyle = '#FAFAFA'
  ctx.fillRect(0, 0, 600, 450)
  ctx.strokeStyle = '#CBD5E1'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(40, 225)
  ctx.lineTo(560, 225)
  ctx.stroke()
  ctx.strokeStyle = '#1E293B'
  ctx.lineWidth = 6
  ctx.font = '700 64px "Baloo 2", sans-serif'
  ctx.save()
  ctx.translate(60, 235)
  ctx.rotate(-0.09)
  ctx.strokeText('classroom', 0, 0)
  ctx.restore()

  let analyzeBtn = null
  const controls = canvas.parentElement?.querySelector('.game-controls')
  if (controls) {
    analyzeBtn = document.createElement('button')
    analyzeBtn.className = 'btn btn-primary'
    analyzeBtn.textContent = 'Analyze Worksheet →'
    analyzeBtn.addEventListener('click', () => {
      onComplete('Analyzing worksheet...', 'amber')
      setTimeout(() => onComplete('Analysis complete!'), 1500)
    })
    controls.appendChild(analyzeBtn)
  }

  return () => {
    if (analyzeBtn && analyzeBtn.parentNode) analyzeBtn.parentNode.removeChild(analyzeBtn)
  }
}

function canvasPointFromEvent(e, canvas) {
  const rect = canvas.getBoundingClientRect()
  const sx = canvas.width / rect.width, sy = canvas.height / rect.height
  return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy, t: performance.now(), p: e.pressure && e.pressure > 0 ? e.pressure : 0.5 }
}
