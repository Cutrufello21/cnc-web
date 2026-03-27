import React from 'react'
import { motion } from 'framer-motion'
import { useInView } from '../hooks/useInView'
import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup } from 'react-leaflet'
import zipcodes from 'zipcodes'
import 'leaflet/dist/leaflet.css'
import './ServiceArea.css'

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

export default function ServiceArea() {
  const [ref, inView] = useInView(0.15)

  return (
    <section className="service" id="coverage" ref={ref}>
      <div className="container">
        <motion.div
          className="service__header"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <p className="service__eyebrow">Coverage Area</p>
          <h2 className="service__title">Northeast Ohio, covered.</h2>
          <p className="service__sub">
            Eight dedicated zones. 200+ ZIP codes. 17 routes running every delivery day —
            no hand-offs, no subcontractors.
          </p>
        </motion.div>

        <motion.div
          className="service__map"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <MapContainer
            center={[41.05, -81.30]}
            zoom={9}
            scrollWheelZoom={false}
            style={{ height: '480px', width: '100%' }}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            />
            {pins.map((pin, i) => (
              <React.Fragment key={i}>
                <CircleMarker
                  center={[pin.lat, pin.lng]}
                  radius={28}
                  pathOptions={{
                    color: 'transparent',
                    weight: 0,
                    fillColor: '#0A2463',
                    fillOpacity: 0.06,
                  }}
                />
                <CircleMarker
                  center={[pin.lat, pin.lng]}
                  radius={5}
                  pathOptions={{
                    color: '#fff',
                    weight: 1.5,
                    fillColor: '#0A2463',
                    fillOpacity: 0.9,
                  }}
                >
                  <Tooltip direction="top" offset={[0, -4]}>
                    {pin.city}, OH {pin.zip}
                  </Tooltip>
                  <Popup>
                    <strong style={{ color: '#0A2463' }}>{pin.city}</strong>
                    <br />
                    <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>{pin.zip}</span>
                  </Popup>
                </CircleMarker>
              </React.Fragment>
            ))}
          </MapContainer>
        </motion.div>

        <motion.p
          className="service__expand"
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.7 }}
        >
          Don't see your area?{' '}
          <a href="mailto:dom@cncdeliveryservice.com">Let's talk.</a>{' '}
          We expand routes based on pharmacy partnerships.
        </motion.p>
      </div>
    </section>
  )
}
