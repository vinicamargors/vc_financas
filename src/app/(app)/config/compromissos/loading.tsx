export default function Loading() {
  return (
    <main className="flow" aria-busy="true" aria-label="Carregando">
      <span className="sk sk-line" style={{ width: '9rem', height: '1.6rem' }} />
      <span className="sk sk-line" style={{ width: '16rem', marginTop: 12 }} />
      {[0, 1].map((i) => (
        <span key={i} className="sk sk-block" style={{ height: '7rem', marginTop: 16 }} />
      ))}
    </main>
  )
}
