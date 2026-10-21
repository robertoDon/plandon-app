import type { ReactNode } from 'react'

/** Empty state: what is missing and what to do about it. `children` is an optional action. */
export function Empty({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="ui-empty">
      <span className="ui-empty-mark" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5 10 17.5 19 7" />
        </svg>
      </span>
      <b>{title}</b>
      {hint && <p>{hint}</p>}
      {children}
    </div>
  )
}
