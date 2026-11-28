export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Carregando gastos">
      <h1 className="title">Gastos</h1>
      <div className="chips" aria-hidden="true">
        {[3.4, 3, 4.2, 2.8, 6.4].map((w, i) => (
          <span key={i} className="sk" style={{ width: `${w}rem`, height: '2rem', borderRadius: 99, flex: 'none' }} />
        ))}
      </div>
      <section className="balance" aria-hidden="true">
        <span className="sk sk-line" style={{ width: '8rem' }} />
        <span className="sk sk-block" style={{ width: '11rem', height: '2.4rem', marginTop: 10 }} />
        <span className="sk sk-line" style={{ width: '15rem', marginTop: 12 }} />
      </section>
      <ul className="cat-list" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="cat-row">
            <span className="cat-top">
              <span className="sk sk-line" style={{ width: `${30 + ((i * 11) % 25)}%` }} />
              <span className="sk sk-line" style={{ width: '4.5rem' }} />
            </span>
            <span className="sk sk-line" style={{ width: '100%', height: 6, marginTop: 8 }} />
          </li>
        ))}
      </ul>
    </main>
  )
}
