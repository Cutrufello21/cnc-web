import { ImageResponse } from '@vercel/og'

export const config = { runtime: 'edge' }

export default function handler() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0A2463 0%, #142f6e 50%, #1a3a7a 100%)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          position: 'relative',
        }}
      >
        {/* Subtle grid pattern overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.03,
            backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
            backgroundSize: '30px 30px',
          }}
        />

        {/* Logo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '32px',
          }}
        >
          <span
            style={{
              fontSize: '52px',
              fontWeight: 300,
              letterSpacing: '8px',
              color: 'rgba(255,255,255,0.9)',
            }}
          >
            CNC
          </span>
          <div
            style={{
              width: '2px',
              height: '48px',
              background: 'rgba(255,255,255,0.25)',
            }}
          />
          <span
            style={{
              fontSize: '42px',
              fontWeight: 700,
              letterSpacing: '6px',
              color: '#fff',
            }}
          >
            DELIVERY
          </span>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: '16px',
            letterSpacing: '4px',
            textTransform: 'uppercase',
            color: '#6495ED',
            marginBottom: '48px',
          }}
        >
          The Last Mile in Patient Care
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: '36px',
            fontWeight: 700,
            color: '#fff',
            textAlign: 'center',
            lineHeight: 1.3,
            maxWidth: '800px',
            marginBottom: '40px',
          }}
        >
          Reliable pharmacy delivery across Northeast Ohio — every day since 2007.
        </div>

        {/* Stats row */}
        <div
          style={{
            display: 'flex',
            gap: '48px',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: '28px', fontWeight: 700, color: '#6495ED' }}>200+</span>
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', letterSpacing: '1px' }}>ZIP CODES</span>
          </div>
          <div style={{ width: '1px', height: '36px', background: 'rgba(255,255,255,0.15)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: '28px', fontWeight: 700, color: '#6495ED' }}>Since 2007</span>
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', letterSpacing: '1px' }}>IN OPERATION</span>
          </div>
          <div style={{ width: '1px', height: '36px', background: 'rgba(255,255,255,0.15)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: '28px', fontWeight: 700, color: '#6495ED' }}>8AM–6PM</span>
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', letterSpacing: '1px' }}>DELIVERY WINDOW</span>
          </div>
        </div>

        {/* Domain */}
        <div
          style={{
            position: 'absolute',
            bottom: '28px',
            fontSize: '15px',
            color: 'rgba(255,255,255,0.35)',
            letterSpacing: '2px',
          }}
        >
          cncdelivery.com
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  )
}
