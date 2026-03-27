import { motion } from 'framer-motion'
import { useInView } from '../hooks/useInView'
import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import './ServiceArea.css'

const pins = [
  {zip:'43903',city:'Amsterdam',lat:40.4731,lng:-80.9596},{zip:'43908',city:'Bergholz',lat:40.5195,lng:-80.884},
  {zip:'43986',city:'Jewett',lat:40.3745,lng:-81.0004},{zip:'43988',city:'Scio',lat:40.4012,lng:-81.1016},
  {zip:'44023',city:'Chagrin Falls',lat:41.3872,lng:-81.3042},{zip:'44056',city:'Macedonia',lat:41.3222,lng:-81.4996},
  {zip:'44067',city:'Northfield',lat:41.3208,lng:-81.5429},{zip:'44087',city:'Twinsburg',lat:41.3289,lng:-81.4559},
  {zip:'44125',city:'Cleveland',lat:41.4335,lng:-81.6323},{zip:'44128',city:'Cleveland',lat:41.4416,lng:-81.5486},
  {zip:'44129',city:'Cleveland',lat:41.3897,lng:-81.7351},{zip:'44131',city:'Independence',lat:41.3809,lng:-81.6642},
  {zip:'44133',city:'North Royalton',lat:41.3232,lng:-81.7457},{zip:'44134',city:'Cleveland',lat:41.3853,lng:-81.7044},
  {zip:'44136',city:'Strongsville',lat:41.3132,lng:-81.8285},{zip:'44137',city:'Maple Heights',lat:41.4105,lng:-81.5603},
  {zip:'44139',city:'Solon',lat:41.3866,lng:-81.4421},{zip:'44141',city:'Brecksville',lat:41.3166,lng:-81.6261},
  {zip:'44146',city:'Bedford',lat:41.3921,lng:-81.5232},{zip:'44147',city:'Broadview Heights',lat:41.3141,lng:-81.6731},
  {zip:'44149',city:'Strongsville',lat:41.3134,lng:-81.8562},{zip:'44201',city:'Atwater',lat:41.0335,lng:-81.1985},
  {zip:'44202',city:'Aurora',lat:41.3176,lng:-81.3454},{zip:'44203',city:'Barberton',lat:41.0197,lng:-81.6212},
  {zip:'44210',city:'Bath',lat:41.1889,lng:-81.6362},{zip:'44211',city:'Brady Lake',lat:41.1698,lng:-81.3124},
  {zip:'44212',city:'Brunswick',lat:41.2471,lng:-81.828},{zip:'44215',city:'Chippewa Lake',lat:41.0653,lng:-81.9017},
  {zip:'44216',city:'Clinton',lat:40.9391,lng:-81.5871},{zip:'44217',city:'Creston',lat:40.9788,lng:-81.9211},
  {zip:'44221',city:'Cuyahoga Falls',lat:41.1401,lng:-81.479},{zip:'44222',city:'Cuyahoga Falls',lat:41.1339,lng:-81.4846},
  {zip:'44223',city:'Cuyahoga Falls',lat:41.1464,lng:-81.5107},{zip:'44224',city:'Stow',lat:41.1748,lng:-81.438},
  {zip:'44230',city:'Doylestown',lat:40.965,lng:-81.6848},{zip:'44232',city:'Green',lat:40.9325,lng:-81.462},
  {zip:'44233',city:'Hinckley',lat:41.2419,lng:-81.7453},{zip:'44236',city:'Hudson',lat:41.2458,lng:-81.4367},
  {zip:'44237',city:'Hudson',lat:41.1287,lng:-81.54},{zip:'44240',city:'Kent',lat:41.1449,lng:-81.3498},
  {zip:'44241',city:'Streetsboro',lat:41.2491,lng:-81.3383},{zip:'44242',city:'Kent',lat:41.1537,lng:-81.3579},
  {zip:'44243',city:'Kent',lat:41.1475,lng:-81.3415},{zip:'44250',city:'Lakemore',lat:41.0222,lng:-81.4279},
  {zip:'44251',city:'Westfield Center',lat:41.0288,lng:-81.9283},{zip:'44255',city:'Mantua',lat:41.2941,lng:-81.2283},
  {zip:'44256',city:'Medina',lat:41.1404,lng:-81.8584},{zip:'44258',city:'Medina',lat:41.1276,lng:-81.8411},
  {zip:'44260',city:'Mogadore',lat:41.0382,lng:-81.359},{zip:'44262',city:'Munroe Falls',lat:41.142,lng:-81.4376},
  {zip:'44264',city:'Peninsula',lat:41.2256,lng:-81.54},{zip:'44265',city:'Randolph',lat:41.0328,lng:-81.2484},
  {zip:'44266',city:'Ravenna',lat:41.1649,lng:-81.2337},{zip:'44270',city:'Rittman',lat:40.9684,lng:-81.7826},
  {zip:'44272',city:'Rootstown',lat:41.0995,lng:-81.2026},{zip:'44273',city:'Seville',lat:41.0227,lng:-81.8562},
  {zip:'44274',city:'Sharon Center',lat:41.0992,lng:-81.7343},{zip:'44276',city:'Sterling',lat:40.9369,lng:-81.8305},
  {zip:'44278',city:'Tallmadge',lat:41.0975,lng:-81.426},{zip:'44280',city:'Valley City',lat:41.2368,lng:-81.9245},
  {zip:'44281',city:'Wadsworth',lat:41.0384,lng:-81.7374},{zip:'44282',city:'Wadsworth',lat:41.0256,lng:-81.7299},
  {zip:'44285',city:'Wayland',lat:41.1597,lng:-81.07},{zip:'44286',city:'Richfield',lat:41.2371,lng:-81.6467},
  {zip:'44301',city:'Akron',lat:41.0449,lng:-81.52},{zip:'44302',city:'Akron',lat:41.092,lng:-81.542},
  {zip:'44303',city:'Akron',lat:41.1025,lng:-81.5386},{zip:'44304',city:'Akron',lat:41.0814,lng:-81.519},
  {zip:'44305',city:'Akron',lat:41.076,lng:-81.4644},{zip:'44306',city:'Akron',lat:41.0479,lng:-81.4916},
  {zip:'44307',city:'Akron',lat:41.0695,lng:-81.5488},{zip:'44308',city:'Akron',lat:41.0796,lng:-81.5194},
  {zip:'44309',city:'Akron',lat:41.0962,lng:-81.5123},{zip:'44310',city:'Akron',lat:41.1075,lng:-81.5006},
  {zip:'44311',city:'Akron',lat:41.0638,lng:-81.52},{zip:'44312',city:'Akron',lat:41.0334,lng:-81.4385},
  {zip:'44313',city:'Akron',lat:41.122,lng:-81.5685},{zip:'44314',city:'Akron',lat:41.0408,lng:-81.5598},
  {zip:'44315',city:'Akron',lat:41.028,lng:-81.4632},{zip:'44316',city:'Akron',lat:41.0675,lng:-81.4847},
  {zip:'44317',city:'Akron',lat:41.0525,lng:-81.5291},{zip:'44319',city:'Akron',lat:40.9791,lng:-81.5347},
  {zip:'44320',city:'Akron',lat:41.0835,lng:-81.5674},{zip:'44321',city:'Akron',lat:41.1002,lng:-81.6443},
  {zip:'44325',city:'Akron',lat:41.0764,lng:-81.5103},{zip:'44326',city:'Akron',lat:41.0814,lng:-81.519},
  {zip:'44328',city:'Akron',lat:41.076,lng:-81.5206},{zip:'44333',city:'Akron',lat:41.1552,lng:-81.6314},
  {zip:'44334',city:'Fairlawn',lat:41.1278,lng:-81.6098},{zip:'44372',city:'Akron',lat:41.1287,lng:-81.54},
  {zip:'44396',city:'Akron',lat:41.1287,lng:-81.54},{zip:'44398',city:'Akron',lat:41.1287,lng:-81.54},
  {zip:'44411',city:'Deerfield',lat:41.0359,lng:-81.0528},{zip:'44460',city:'Salem',lat:40.9,lng:-80.8619},
  {zip:'44601',city:'Alliance',lat:40.9158,lng:-81.1182},{zip:'44606',city:'Apple Creek',lat:40.7551,lng:-81.8093},
  {zip:'44608',city:'Beach City',lat:40.6562,lng:-81.5851},{zip:'44612',city:'Bolivar',lat:40.6347,lng:-81.4464},
  {zip:'44613',city:'Brewster',lat:40.7142,lng:-81.5957},{zip:'44614',city:'Canal Fulton',lat:40.8887,lng:-81.5773},
  {zip:'44615',city:'Carrollton',lat:40.5787,lng:-81.0818},{zip:'44618',city:'Dalton',lat:40.7793,lng:-81.7008},
  {zip:'44620',city:'Dellroy',lat:40.5861,lng:-81.1986},{zip:'44621',city:'Dennison',lat:40.4089,lng:-81.3203},
  {zip:'44622',city:'Dover',lat:40.5343,lng:-81.4763},{zip:'44624',city:'Dundee',lat:40.589,lng:-81.6058},
  {zip:'44626',city:'East Sparta',lat:40.6971,lng:-81.3687},{zip:'44627',city:'Fredericksburg',lat:40.686,lng:-81.8518},
  {zip:'44630',city:'Greentown',lat:40.9295,lng:-81.4001},{zip:'44632',city:'Hartville',lat:40.9618,lng:-81.3239},
  {zip:'44640',city:'Limaville',lat:40.9836,lng:-81.1497},{zip:'44641',city:'Louisville',lat:40.8477,lng:-81.2595},
  {zip:'44643',city:'Magnolia',lat:40.6514,lng:-81.3076},{zip:'44644',city:'Malvern',lat:40.6845,lng:-81.1838},
  {zip:'44645',city:'Marshallville',lat:40.9067,lng:-81.7225},{zip:'44646',city:'Massillon',lat:40.8116,lng:-81.4973},
  {zip:'44647',city:'Massillon',lat:40.7959,lng:-81.5533},{zip:'44650',city:'Maximo',lat:40.8746,lng:-81.1739},
  {zip:'44651',city:'Mechanicstown',lat:40.6263,lng:-80.956},{zip:'44652',city:'Middlebranch',lat:40.8951,lng:-81.3262},
  {zip:'44656',city:'Mineral City',lat:40.5705,lng:-81.3436},{zip:'44657',city:'Minerva',lat:40.742,lng:-81.1031},
  {zip:'44662',city:'Navarre',lat:40.7204,lng:-81.5338},{zip:'44663',city:'New Philadelphia',lat:40.4845,lng:-81.4358},
  {zip:'44666',city:'North Lawrence',lat:40.8387,lng:-81.6299},{zip:'44667',city:'Orrville',lat:40.8458,lng:-81.7741},
  {zip:'44671',city:'Sandyville',lat:40.6442,lng:-81.3653},{zip:'44675',city:'Sherrodsville',lat:40.5184,lng:-81.2339},
  {zip:'44677',city:'Smithville',lat:40.8592,lng:-81.8633},{zip:'44678',city:'Somerdale',lat:40.5649,lng:-81.3524},
  {zip:'44680',city:'Strasburg',lat:40.6003,lng:-81.5366},{zip:'44681',city:'Sugarcreek',lat:40.5148,lng:-81.6604},
  {zip:'44683',city:'Uhrichsville',lat:40.3905,lng:-81.3374},{zip:'44685',city:'Uniontown',lat:40.9637,lng:-81.4211},
  {zip:'44688',city:'Waynesburg',lat:40.6829,lng:-81.2659},{zip:'44691',city:'Wooster',lat:40.8094,lng:-81.9483},
  {zip:'44701',city:'Canton',lat:40.7824,lng:-81.3712},{zip:'44702',city:'Canton',lat:40.8027,lng:-81.3739},
  {zip:'44703',city:'Canton',lat:40.8098,lng:-81.3814},{zip:'44704',city:'Canton',lat:40.7991,lng:-81.3537},
  {zip:'44705',city:'Canton',lat:40.8259,lng:-81.3399},{zip:'44706',city:'Canton',lat:40.768,lng:-81.4119},
  {zip:'44707',city:'Canton',lat:40.7598,lng:-81.35},{zip:'44708',city:'Canton',lat:40.812,lng:-81.4241},
  {zip:'44709',city:'Canton',lat:40.8423,lng:-81.3862},{zip:'44710',city:'Canton',lat:40.7911,lng:-81.4169},
  {zip:'44711',city:'Canton',lat:40.8118,lng:-81.3683},{zip:'44714',city:'Canton',lat:40.8272,lng:-81.361},
  {zip:'44718',city:'Canton',lat:40.8465,lng:-81.4408},{zip:'44720',city:'North Canton',lat:40.7989,lng:-81.3784},
  {zip:'44721',city:'Canton',lat:40.8834,lng:-81.3328},{zip:'44730',city:'East Canton',lat:40.7873,lng:-81.2826},
  {zip:'44735',city:'Canton',lat:40.8118,lng:-81.3683},{zip:'44750',city:'Canton',lat:40.7846,lng:-81.4189},
  {zip:'44767',city:'Canton',lat:40.8957,lng:-81.4246},{zip:'44799',city:'Canton',lat:40.8118,lng:-81.3683},
]

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
            Eight dedicated zones. 200+ ZIP codes. 17 routes running every delivery day — no hand-offs, no subcontractors.
          </p>
        </motion.div>

        <motion.div
          className="service__map-wrap"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <MapContainer
            center={[40.95, -81.35]}
            zoom={8}
            scrollWheelZoom={false}
            style={{ height: '500px', width: '100%', borderRadius: 'var(--radius-md, 12px)' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {pins.map((pin, i) => (
              <CircleMarker
                key={i}
                center={[pin.lat, pin.lng]}
                radius={6}
                pathOptions={{
                  color: '#fff',
                  weight: 1.5,
                  fillColor: '#0A2463',
                  fillOpacity: 0.85,
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
            ))}
          </MapContainer>
        </motion.div>

        <motion.p
          className="service__expand"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.7 }}
        >
          Don't see your area? <a href="mailto:dom@cncdeliveryservice.com">Let's talk.</a> We expand routes based on pharmacy partnerships.
        </motion.p>
      </div>
    </section>
  )
}
