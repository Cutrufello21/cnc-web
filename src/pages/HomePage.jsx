import Navbar from '../components/Navbar'
import Hero from '../components/Hero'
import TrustBar from '../components/TrustBar'
import Pillars from '../components/Pillars'
import Stats from '../components/Stats'
import ServiceArea from '../components/ServiceArea'
import CTA from '../components/CTA'
import Footer from '../components/Footer'

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <TrustBar />
        <Pillars />
        <Stats />
        <ServiceArea />
        <CTA />
      </main>
      <Footer />
    </>
  )
}
