import { useState, useEffect, useRef, useCallback } from 'react'
import './CardCarousel.css'

/* Apple iPhone-page style in-card carousel. Slides auto-advance on
   a timer, pagination pills at the bottom let the visitor jump to
   any slide, play/pause toggles the timer. Keyboard arrows work
   when the containing card is in view. Side peeks of prev/next
   slides sit at the edges. */
const SLIDE_DURATION_MS = 6000

export default function CardCarousel({ slides }) {
  const [active, setActive] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [inView, setInView] = useState(false)
  const rootRef = useRef(null)
  const timerRef = useRef(null)
  const startedAtRef = useRef(0)
  const [progressKey, setProgressKey] = useState(0)

  const go = useCallback(
    (idx) => {
      const next = (idx + slides.length) % slides.length
      setActive(next)
      setProgressKey((k) => k + 1)
      startedAtRef.current = performance.now()
    },
    [slides.length]
  )

  // Observe whether this card is on screen — don't tick or capture
  // keyboard while offscreen.
  useEffect(() => {
    if (!rootRef.current) return
    const obs = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio > 0.35),
      { threshold: [0, 0.35, 0.6] }
    )
    obs.observe(rootRef.current)
    return () => obs.disconnect()
  }, [])

  // Auto-advance timer — only runs while in view and playing.
  useEffect(() => {
    if (!inView || !playing) return
    startedAtRef.current = performance.now()
    timerRef.current = setTimeout(() => {
      go(active + 1)
    }, SLIDE_DURATION_MS)
    return () => clearTimeout(timerRef.current)
  }, [active, inView, playing, go])

  // Keyboard nav when in view.
  useEffect(() => {
    if (!inView) return
    const onKey = (e) => {
      if (e.key === 'ArrowRight') go(active + 1)
      else if (e.key === 'ArrowLeft') go(active - 1)
      else if (e.key === ' ') {
        e.preventDefault()
        setPlaying((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, inView, go])

  return (
    <div
      className="carousel"
      ref={rootRef}
      onMouseEnter={() => setPlaying(false)}
      onMouseLeave={() => setPlaying(true)}
    >
      <div className="carousel__viewport">
        <div
          className="carousel__track"
          style={{ transform: `translateX(calc(-${active} * 100%))` }}
        >
          {slides.map((slide, i) => (
            <div
              className={`carousel__slide ${i === active ? 'carousel__slide--active' : ''}`}
              key={i}
              aria-hidden={i !== active}
            >
              {slide.render()}
            </div>
          ))}
        </div>
      </div>

      <div className="carousel__controls">
        <div className="carousel__pills" role="tablist">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`carousel__pill ${i === active ? 'carousel__pill--active' : ''}`}
              onClick={() => go(i)}
              aria-label={`Slide ${i + 1} of ${slides.length}`}
            >
              {i === active && playing && inView && (
                <span
                  className="carousel__pill-fill"
                  key={progressKey}
                  style={{ animationDuration: `${SLIDE_DURATION_MS}ms` }}
                />
              )}
              {i === active && !playing && <span className="carousel__pill-fill carousel__pill-fill--paused" />}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="carousel__playpause"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? (
            <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor">
              <rect x="0" y="0" width="3" height="12" rx="0.5" />
              <rect x="7" y="0" width="3" height="12" rx="0.5" />
            </svg>
          ) : (
            <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor">
              <path d="M1 0 L10 6 L1 12 Z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
