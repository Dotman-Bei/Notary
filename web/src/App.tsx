import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { RegisterProvider } from './data/store'
import { WalletProvider } from './lib/wallet'
import Landing from './site/Landing'
import { ErrorBoundary } from './ui/ErrorBoundary'
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

// Resets the error screen when the visitor navigates to another page.
function RoutedBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>
}

export default function App() {
  return (
    <RegisterProvider>
      <WalletProvider>
        <BrowserRouter>
          <ScrollToTop />
          <RoutedBoundary>
          <Suspense fallback={null}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/agents/:id" element={<AgentPage />} />
              <Route path="/feed" element={<Feed />} />
              <Route path="/operator" element={<Operator />} />
            </Routes>
          </Suspense>
          </RoutedBoundary>
        </BrowserRouter>
      </WalletProvider>
    </RegisterProvider>
  )
}
