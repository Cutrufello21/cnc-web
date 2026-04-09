import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import BrandMark from './BrandMark'
import './Navbar.css'

const sections = ['services', 'coverage', 'about', 'team']

export default function Navbar() {
  const [pastHero, setPastHero] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [active, setActive] = useState('')
  const heroRef = useRef(null)

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY

      // Re-query each time so we catch the hero after it mounts
      if (!heroRef.current) heroRef.current = document.querySelector('.hero')

      // Past hero = hero bottom has scrolled above the top of the viewport
      if (heroRef.current) {
        const rect = heroRef.current.getBoundingClientRect()
        setPastHero(rect.bottom <= 0)
      }

      const height = document.documentElement.scrollHeight - window.innerHeight
      setScrollProgress(height > 0 ? (y / height) * 100 : 0)

      // Active section highlight
      let current = ''
      for (const id of sections) {
        const el = document.getElementById(id)
        if (el) {
          const rect = el.getBoundingClientRect()
          if (rect.top <= 200) current = id
        }
      }
      setActive(current)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  const mode = pastHero ? 'solid' : 'transparent'
  // Hero is light/white in every state — always use the navy BrandMark.
  // (BrandMark naming is inverted: "dark" variant = navy text on light.)
  const brandVariant = 'dark'

  return (
    <nav className={`navbar navbar--${mode}`}>
      <div className="navbar__progress" style={{ width: `${scrollProgress}%` }} />
      <div className="navbar__inner container">
        <Link to="/" className="navbar__logo">
          <BrandMark variant={brandVariant} size="sm" />
        </Link>

        <div className={`navbar__links ${menuOpen ? 'navbar__links--open' : ''}`}>
          <a href="#services" className={active === 'services' ? 'navbar__link--active' : ''} onClick={() => setMenuOpen(false)}>Services</a>
          <a href="#coverage" className={active === 'coverage' ? 'navbar__link--active' : ''} onClick={() => setMenuOpen(false)}>Coverage</a>
          <a href="#about" className={active === 'about' ? 'navbar__link--active' : ''} onClick={() => setMenuOpen(false)}>About</a>
          <a href="#team" className={active === 'team' ? 'navbar__link--active' : ''} onClick={() => setMenuOpen(false)}>Team</a>
          <Link to="/login" className="navbar__signin" onClick={() => setMenuOpen(false)}>
            Sign In
          </Link>
          <a href="#contact" className="navbar__cta" onClick={() => setMenuOpen(false)}>
            Request Consultation
          </a>
        </div>

        <button
          className="navbar__hamburger"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <span className={`navbar__hamburger-line ${menuOpen ? 'open' : ''}`} />
          <span className={`navbar__hamburger-line ${menuOpen ? 'open' : ''}`} />
        </button>
      </div>
    </nav>
  )
}
