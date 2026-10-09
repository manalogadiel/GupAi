import { useEffect, useState } from 'react'
import Backdrop from './components/Backdrop'
import Home from './pages/Home'
import Customers from './pages/Customers'
import Consult from './pages/Consult'
import Phone from './pages/Phone'
import MascotStates from './dev/MascotStates'

// Four screens, so a tiny pathname router instead of a routing dependency.
export function navigate(to: string) {
  history.pushState(null, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export default function App() {
  const [path, setPath] = useState(location.pathname)
  useEffect(() => {
    const on = () => setPath(location.pathname)
    window.addEventListener('popstate', on)
    return () => window.removeEventListener('popstate', on)
  }, [])

  return <><Backdrop />{route(path)}</>
}

function route(path: string) {
  if (path.startsWith('/dev/mascot')) return <MascotStates />
  if (path.startsWith('/phone')) return <Phone />
  const consult = path.match(/^\/consult\/([\w-]+)/)
  if (consult) return <Consult id={consult[1]} />
  if (path.startsWith('/customers')) return <Customers />
  return <Home />
}
