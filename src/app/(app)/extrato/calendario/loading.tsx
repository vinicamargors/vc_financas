export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Carregando calendário">
      <h1 className="title">Calendário</h1>
      <div className="period-nav" aria-hidden="true">
        <span className="sk sk-line" style={{ width: '9rem', margin: '10px auto' }} />
      </div>
      <div className="cal-sk" aria-hidden="true">
        {Array.from({ length: 35 }, (_, i) => (
          <span key={i} className="sk sk-block" />
        ))}
      </div>
      <div className="cal-chart" aria-hidden="true">
        <span className="sk sk-block" style={{ height: '10rem' }} />
      </div>
    </main>
  )
}
