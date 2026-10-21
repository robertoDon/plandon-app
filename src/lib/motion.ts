// House spring (constraints: damping 1.0, response 0.3–0.4 s). Motion's bounce 0 = critically damped.
export const spring = { type: 'spring', bounce: 0, duration: 0.35 } as const

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
