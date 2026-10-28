import { useState } from 'react'

export function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button className="copy" aria-label={done ? 'Copied' : 'Copy'} onClick={() => {
      navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1200) })
    }}>{done ? 'Copied' : 'Copy'}</button>
  )
}
