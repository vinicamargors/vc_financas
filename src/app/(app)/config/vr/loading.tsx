export default function Loading() {
  return (
    <main className="flow" aria-busy="true" aria-label="Carregando">
      <span className="sk sk-line" style={{ width: '8rem', height: '1.6rem' }} />
      <span className="sk sk-line" style={{ width: '70%', marginTop: 12 }} />
      {[0, 1, 2].map((i) => (
        <section key={i} className="step" aria-hidden="true">
          <span className="sk sk-line" style={{ width: '40%' }} />
          <span className="sk sk-block" style={{ display: 'block', height: '3.2rem', marginTop: 10 }} />
        </section>
      ))}
    </main>
  )
}
