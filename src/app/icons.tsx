// Line icons, 24×24, stroke = currentColor. Drawn for this app (no icon dependency).
const PATHS: Record<string, string> = {
  today: 'M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9ZM12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4',
  week: 'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11ZM4 9h16M8.5 9v11M12 9v11M15.5 9v11',
  risk: 'M10.3 4.1a2 2 0 0 1 3.4 0l7.4 12.8A2 2 0 0 1 19.4 20H4.6a2 2 0 0 1-1.7-3.1l7.4-12.8ZM12 9.5v4M12 16.8v.2',
  pending: 'M4 13.5 6.5 6A2 2 0 0 1 8.4 4.5h7.2A2 2 0 0 1 17.5 6l2.5 7.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4.5ZM4 13.5h4.5l1 2h5l1-2H20',
  deliverable: 'M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3ZM4 7.5l8 4.5 8-4.5M12 12v9',
  calendar: 'M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v11.5A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5ZM3.5 10h17M8 3.5v4M16 3.5v4M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 16.5h2M11 16.5h2',
  team: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.2a6.5 6.5 0 0 1 3.5 5.8',
  decision: 'M12 3.5 20.5 12 12 20.5 3.5 12 12 3.5ZM9 12l2 2 4-4',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  history: 'M3.5 12a8.5 8.5 0 1 0 2.5-6M3.5 4v4h4M12 7.5V12l3 2',
  people: 'M14.5 10.5a4 4 0 1 0-4.6-4.6M10 9.5l-6.5 6.5v3.5H7v-2h2v-2h2l1.4-1.4M15.5 6.5h.01',
  overview: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  goal: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 12h.01',
  present: 'M3 4.5h18M4.5 4.5v10a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-10M12 16v4M8.5 20.5h7M9 12.5l2.5-2.5 2 2 2.5-3',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  logout: 'M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15M10.5 8 6.5 12l4 4M6.5 12H15',
  schedule: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V12l3 2',
  close: 'M6 6l12 12M18 6 6 18',
}

export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const bold = name === 'more' // the dots need weight to read
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={bold ? 3 : 1.7}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name] ?? PATHS.more} />
    </svg>
  )
}
