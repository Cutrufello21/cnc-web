import Navbar from '../components/Navbar'
import Hero from '../components/Hero'
import TrustBar from '../components/TrustBar'
import Pillars from '../components/Pillars'
import Stats from '../components/Stats'
import HowItWorks from '../components/HowItWorks'
import ServiceArea from '../components/ServiceArea'
import CTA from '../components/CTA'
import About from '../components/About'
import Team from '../components/Team'
import FAQ from '../components/FAQ'
import ContactForm from '../components/ContactForm'
import Footer from '../components/Footer'
import BackToTop from '../components/BackToTop'

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
        <Team />
        <FAQ />
        <ContactForm />
      </main>
      <Footer />
      <BackToTop />
    </>
  )
}
