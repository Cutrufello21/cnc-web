import Navbar from '../components/Navbar'
import Hero from '../components/Hero'
import TrustBar from '../components/TrustBar'
import Pillars from '../components/Pillars'
import Stats from '../components/Stats'
import HowItWorks from '../components/HowItWorks'
import ServiceArea from '../components/ServiceArea'
import CTA from '../components/CTA'
import About from '../components/About'
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
        <HowItWorks />
        <ServiceArea />
        <CTA />
        <About />
      </main>
      <Footer />
    </>
  )
}
