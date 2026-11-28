export default function Loading() {
  return (
    <main className="flow" aria-busy="true" aria-label="Carregando">
      <h1 className="title">Atalho do iPhone</h1>
      <span className="sk sk-line" style={{ width: '80%', marginBottom: 18 }} />
      <div className="steps" aria-hidden="true">
        <i className="on" />
        <i className="on" />
        <i />
      </div>
      {[0, 1, 2].map((i) => (
        <section key={i} className="step" aria-hidden="true">
          <span className="sk sk-line" style={{ width: '4.5rem', height: '0.7rem' }} />
          <span className="sk sk-line" style={{ width: '60%', height: '1.1rem', marginTop: 10 }} />
          <span className="sk sk-line" style={{ width: '95%', marginTop: 12 }} />
          <span className="sk sk-line" style={{ width: '70%', marginTop: 8 }} />
        </section>
      ))}
    </main>
  )
}
