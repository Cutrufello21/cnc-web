import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'
import BrandMark from './BrandMark'
import './Navbar.css'

const sections = ['services', 'coverage', 'about', 'team']

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [active, setActive] = useState('')

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 10)
      const height = document.documentElement.scrollHeight - window.innerHeight
      setScrollProgress(height > 0 ? (window.scrollY / height) * 100 : 0)

      // Determine active section
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
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav className={`navbar ${scrolled ? 'navbar--scrolled' : ''}`}>
      <div className="navbar__progress" style={{ width: `${scrollProgress}%` }} />
      <div className="navbar__inner container">
        <Link to="/" className="navbar__logo">
          <BrandMark variant="dark" />
        </Link>

        <div className={`navbar__links ${menuOpen ? 'navbar__links--open' : ''}`}>
          <Link to="/services" className={active === 'services' ? 'navbar__link--active' : ''} onClick={() => setMenuOpen(false)}>Services</Link>
          <a href="#coverage" className={active === 'coverage' ? 'navbar__link--active' : ''} onClick={() => setMenuOpen(false)}>Coverage</a>
          <a href="#about" className={active === 'about' ? 'navbar__link--active' : ''} onClick={() => setMenuOpen(false)}>About</a>
          <a href="#team" className={active === 'team' ? 'navbar__link--active' : ''} onClick={() => setMenuOpen(false)}>Team</a>
          <ThemeToggle />
          <Link to="/login" className="navbar__cta" onClick={() => setMenuOpen(false)}>
            Sign In
          </Link>
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
