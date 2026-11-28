export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Carregando">
      <div className="hello">
        <span className="sk sk-line" style={{ width: '7rem', height: '1.1rem' }} />
      </div>
      <section className="balance">
        <span className="sk sk-line" style={{ width: '6rem' }} />
        <span className="sk sk-block" style={{ width: '12rem', height: '2.4rem', marginTop: 10 }} />
        <span className="sk sk-line" style={{ width: '14rem', marginTop: 18 }} />
      </section>
      <div className="actions" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="act">
            <span className="act-icon sk" />
            <span className="sk sk-line" style={{ width: '3rem', height: '0.7rem' }} />
          </span>
        ))}
      </div>
      <div className="tiles" aria-hidden="true">
        <span className="sk sk-block" style={{ height: '4.5rem' }} />
      </div>
    </main>
  )
}
