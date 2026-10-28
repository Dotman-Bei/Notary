import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import { RegisterProvider } from './data/store'
import { WalletProvider } from './lib/wallet'
import Landing from './site/Landing'
import './ui/ui.css'

const Leaderboard = lazy(() => import('./app/Leaderboard'))
const AgentPage = lazy(() => import('./app/AgentPage'))
const Feed = lazy(() => import('./app/Feed'))
const Operator = lazy(() => import('./app/Operator'))

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

export default function App() {
  return (
    <RegisterProvider>
      <WalletProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Suspense fallback={null}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/agents/:id" element={<AgentPage />} />
              <Route path="/feed" element={<Feed />} />
              <Route path="/operator" element={<Operator />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </WalletProvider>
    </RegisterProvider>
  )
}
