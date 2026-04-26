import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { Footer, Header } from './components/Chrome'
import { Landing } from './pages/Landing'
import { Playground } from './pages/Playground'
import { AgentsPage } from './pages/AgentsPage'
import { Research } from './pages/Research'
import { Pricing } from './pages/Pricing'
import { Docs } from './pages/Docs'

function ScrollReset() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }) }, [pathname])
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollReset />
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/playground" element={<Playground />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/research" element={<Research />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/docs" element={<Docs />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  )
}

function NotFound() {
  return (
    <div className="max-w-[900px] mx-auto px-6 py-32 text-center">
      <span className="eyebrow">404 · not orchestrated</span>
      <h1 className="font-display text-[120px] leading-none mt-6 text-bone-100">Off the <span className="serif-italic text-signal-amber">graph</span>.</h1>
      <p className="text-bone-300 mt-6">No agent has visited this URL. Try returning to the playground.</p>
    </div>
  )
}
