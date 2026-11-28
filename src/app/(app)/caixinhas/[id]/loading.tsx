export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Carregando caixinha">
      <section className="balance">
        <span className="sk sk-line" style={{ width: '6rem' }} />
        <span className="sk sk-block" style={{ width: '12rem', height: '2.4rem', marginTop: 10 }} />
        <span className="sk sk-line" style={{ width: '9rem', marginTop: 12 }} />
      </section>
      <span className="sk sk-block" style={{ display: 'block', height: 200, borderRadius: 18, marginTop: 16 }} aria-hidden="true" />
      <ul className="kv" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <li key={i}>
            <span className="sk sk-line" style={{ width: '6rem' }} />
            <span className="sk sk-line" style={{ width: '4.5rem' }} />
          </li>
        ))}
      </ul>
    </main>
  )
}
