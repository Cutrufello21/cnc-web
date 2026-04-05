import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import zipcodes from 'zipcodes'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

const ZIP_LIST = [
  '43903','43908','43986','43988','44023','44056','44067','44087',
  '44125','44128','44129','44131','44133','44134','44136','44137',
  '44139','44141','44146','44147','44149','44201','44202','44203',
  '44210','44211','44212','44215','44216','44217','44221','44222',
  '44223','44224','44230','44232','44233','44236','44237','44240',
  '44241','44242','44243','44250','44251','44255','44256','44258',
  '44260','44262','44264','44265','44266','44270','44272','44273',
  '44274','44276','44278','44280','44281','44282','44285','44286',
  '44301','44302','44303','44304','44305','44306','44307','44308',
  '44309','44310','44311','44312','44313','44314','44315','44316',
  '44317','44319','44320','44321','44325','44326','44328','44333',
  '44334','44372','44396','44398','44411','44460','44601','44606',
  '44608','44612','44613','44614','44615','44618','44620','44621',
  '44622','44624','44626','44627','44630','44632','44640','44641',
  '44643','44644','44645','44646','44647','44650','44651','44652',
  '44656','44657','44662','44663','44666','44667','44671','44675',
  '44677','44678','44680','44681','44683','44685','44688','44691',
  '44701','44702','44703','44704','44705','44706','44707','44708',
  '44709','44710','44711','44714','44718','44720','44721','44730',
  '44735','44750','44767','44799'
]

const pins = ZIP_LIST
  .map(zip => {
    const info = zipcodes.lookup(zip)
    if (!info) return null
    return { zip, city: info.city, lat: info.latitude, lng: info.longitude }
  })
  .filter(Boolean)

// Pharmacy HQ locations
const HQ = [
  { lat: 41.0758, lng: -81.5193, label: 'SHSP — Akron', color: '#0A2463' },
  { lat: 40.7914, lng: -81.3939, label: 'Aultman — Canton', color: '#16a34a' },
]

export default function ServiceMap() {
  const containerRef = useRef(null)
  const mapRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !mapboxgl.accessToken) return

    const prefersDark = document.documentElement.getAttribute('data-theme') === 'dark'

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: prefersDark
        ? 'mapbox://styles/mapbox/dark-v11'
        : 'mapbox://styles/mapbox/light-v11',
      center: [-81.20, 41.00],
      zoom: 8.5,
      scrollZoom: false,
      attributionControl: false,
      pitchWithRotate: false,
      dragRotate: false,
    })

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left')

    map.on('load', () => {
      // ZIP code coverage dots
      map.addSource('zips', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: pins.map(p => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
            properties: { zip: p.zip, city: p.city },
          })),
        },
      })

      // Glow ring
      map.addLayer({
        id: 'zip-glow',
        type: 'circle',
        source: 'zips',
        paint: {
          'circle-radius': 18,
          'circle-color': '#0A2463',
          'circle-opacity': 0.04,
        },
      })

      // Solid dot
      map.addLayer({
        id: 'zip-dots',
        type: 'circle',
        source: 'zips',
        paint: {
          'circle-radius': 5,
          'circle-color': '#0A2463',
          'circle-opacity': 0.85,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#fff',
        },
      })

      // HQ markers
      for (const hq of HQ) {
        const el = document.createElement('div')
        el.style.cssText = `
          width: 14px; height: 14px; border-radius: 50%;
          background: ${hq.color}; border: 2.5px solid #fff;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        `
        new mapboxgl.Marker({ element: el })
          .setLngLat([hq.lng, hq.lat])
          .setPopup(new mapboxgl.Popup({ offset: 12, closeButton: false }).setHTML(
            `<strong style="color:#0A2463;font-size:13px">${hq.label}</strong>`
          ))
          .addTo(map)
      }

      // Tooltip on hover
      const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 8 })

      map.on('mouseenter', 'zip-dots', (e) => {
        map.getCanvas().style.cursor = 'pointer'
        const f = e.features[0]
        popup
          .setLngLat(f.geometry.coordinates)
          .setHTML(`<span style="font-size:13px"><strong>${f.properties.city}</strong>, OH ${f.properties.zip}</span>`)
          .addTo(map)
      })

      map.on('mouseleave', 'zip-dots', () => {
        map.getCanvas().style.cursor = ''
        popup.remove()
      })
    })

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  return <div ref={containerRef} style={{ height: 420, width: '100%' }} />
}
