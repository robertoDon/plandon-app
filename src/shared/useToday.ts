import { useEffect, useState } from 'react'
import { today as todayOf, type ISODate } from '../domain/dates'

/** Today (São Paulo, or ?today=), re-checked every minute and on return to the tab, so a page left open moves
 * on at midnight. */
export function useToday(): ISODate {
  const [t, setT] = useState(todayOf)
  useEffect(() => {
    const check = () => setT(todayOf())
    const timer = setInterval(check, 60_000)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
  return t
}
