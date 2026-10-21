import { useId, type ReactNode } from 'react'

/** White surface, 18px radius. With a title it is a named region; `action` sits right of the title (a link). */
export function Card({ title, action, className, children }: { title?: ReactNode; action?: ReactNode; className?: string; children?: ReactNode }) {
  const id = useId()
  return (
    <section className={className ? `ui-card ${className}` : 'ui-card'} aria-labelledby={title ? id : undefined}>
      {(title || action) && (
        <div className="ui-card-hd">
          {title && <h2 id={id}>{title}</h2>}
          {action && <div className="ui-card-action">{action}</div>}
        </div>
      )}
      {children}
    </section>
  )
}
