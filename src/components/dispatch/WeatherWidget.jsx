import { useState, useEffect } from 'react'
import './WeatherWidget.css'

const WEATHER_CODES = {
  0: { icon: '☀️', label: 'Clear' },
  1: { icon: '🌤️', label: 'Mostly Clear' },
  2: { icon: '⛅', label: 'Partly Cloudy' },
  3: { icon: '☁️', label: 'Overcast' },
  45: { icon: '🌫️', label: 'Fog' },
  48: { icon: '🌫️', label: 'Icy Fog' },
  51: { icon: '🌦️', label: 'Light Drizzle' },
  53: { icon: '🌦️', label: 'Drizzle' },
  55: { icon: '🌧️', label: 'Heavy Drizzle' },
  61: { icon: '🌧️', label: 'Light Rain' },
  63: { icon: '🌧️', label: 'Rain' },
  65: { icon: '🌧️', label: 'Heavy Rain' },
  66: { icon: '🌨️', label: 'Freezing Rain' },
  67: { icon: '🌨️', label: 'Heavy Freezing Rain' },
  71: { icon: '❄️', label: 'Light Snow' },
  73: { icon: '❄️', label: 'Snow' },
  75: { icon: '❄️', label: 'Heavy Snow' },
  77: { icon: '🌨️', label: 'Snow Grains' },
  80: { icon: '🌦️', label: 'Rain Showers' },
  81: { icon: '🌧️', label: 'Moderate Showers' },
  82: { icon: '🌧️', label: 'Heavy Showers' },
  85: { icon: '❄️', label: 'Snow Showers' },
  86: { icon: '❄️', label: 'Heavy Snow Showers' },
  95: { icon: '⛈️', label: 'Thunderstorm' },
  96: { icon: '⛈️', label: 'Thunderstorm + Hail' },
  99: { icon: '⛈️', label: 'Heavy Thunderstorm' },
}

const DANGEROUS_CODES = new Set([66, 67, 71, 73, 75, 77, 85, 86])

export default function WeatherWidget() {
  const [weather, setWeather] = useState(null)
  const [alertDismissed, setAlertDismissed] = useState(false)

  useEffect(() => {
    // Akron, OH coordinates
    fetch('https://api.open-meteo.com/v1/forecast?latitude=41.0814&longitude=-81.519&daily=weathercode,temperature_2m_max,temperature_2m_min,windspeed_10m_max&temperature_unit=fahrenheit&windspeed_unit=mph&timezone=America/New_York&forecast_days=2')
      .then(r => r.json())
      .then(d => {
        if (d.daily) {
          const tmrw = 1 // index 1 = tomorrow
          setWeather({
            high: Math.round(d.daily.temperature_2m_max[tmrw]),
            low: Math.round(d.daily.temperature_2m_min[tmrw]),
            code: d.daily.weathercode[tmrw],
            wind: Math.round(d.daily.windspeed_10m_max[tmrw]),
          })
        }
      })
      .catch(() => {})
  }, [])

  if (!weather) return null

  const info = WEATHER_CODES[weather.code] || { icon: '🌡️', label: 'Unknown' }
  const isDangerous = DANGEROUS_CODES.has(weather.code)

  return (
    <>
      <div className="wx">
        <span className="wx__icon">{info.icon}</span>
        <div className="wx__info">
          <span className="wx__temp">{weather.high}° / {weather.low}°</span>
          <span className="wx__label">{info.label} · {weather.wind}mph</span>
        </div>
      </div>
      {isDangerous && !alertDismissed && (
        <div className="wx__alert-toast">
          <span className="wx__alert-text">
            Weather Alert — Snow/ice expected. Notify drivers.
          </span>
          <button
            className="wx__alert-close"
            onClick={() => setAlertDismissed(true)}
            aria-label="Dismiss alert"
          >
            x
          </button>
        </div>
      )}
    </>
  )
}
