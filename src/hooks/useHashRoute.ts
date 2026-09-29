import { useEffect, useState } from 'react'

/** 取 location.hash 里的路由，'#/admin' → 'admin' */
export function useHashRoute(): string {
  const [route, setRoute] = useState(() => normalize(window.location.hash))

  useEffect(() => {
    const onChange = () => setRoute(normalize(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return route
}

function normalize(hash: string): string {
  return hash.replace(/^#\/?/, '').split('?')[0]
}
