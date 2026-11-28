export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Carregando revisão">
      <h1 className="title">Revisar</h1>
      <div aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rv-card">
            <span className="sk sk-line" style={{ width: `${45 + i * 10}%` }} />
            <span className="sk sk-line" style={{ width: '30%' }} />
            <span className="sk" style={{ display: 'block', height: '2rem', borderRadius: 99, marginTop: 12 }} />
          </div>
        ))}
      </div>
    </main>
  )
}
