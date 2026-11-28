export default function Loading() {
  return (
    <main className="flow" aria-busy="true" aria-label="Carregando relatório">
      <span className="sk sk-line" style={{ width: '11rem', height: '1.6rem' }} />
      <span className="sk sk-line" style={{ width: '8rem', margin: '16px auto 0' }} />
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="sk sk-block" style={{ height: '7rem', marginTop: 16 }} />
      ))}
    </main>
  )
}
