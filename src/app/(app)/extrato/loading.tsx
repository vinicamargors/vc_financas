export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Carregando extrato">
      <h1 className="title">Extrato</h1>
      <div className="chips" aria-hidden="true">
        {[2.8, 3.8, 3.2, 2.8, 2.6, 6.4].map((w, i) => (
          <span key={i} className="sk" style={{ width: `${w}rem`, height: '2rem', borderRadius: 99, flex: 'none' }} />
        ))}
      </div>
      <div className="period-nav" aria-hidden="true">
        <span className="sk sk-line" style={{ width: '9rem', margin: '10px auto' }} />
      </div>
      <div className="chips" aria-hidden="true">
        {[3.2, 4.6, 3.8, 3.8].map((w, i) => (
          <span key={i} className="sk" style={{ width: `${w}rem`, height: '2rem', borderRadius: 99, flex: 'none' }} />
        ))}
      </div>
      {[0, 1].map((g) => (
        <section key={g} aria-hidden="true">
          <h2 className="day">
            <span className="sk sk-line" style={{ width: '4rem' }} />
            <span className="sk sk-line" style={{ width: '3.5rem' }} />
          </h2>
          <ul className="tx-list">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="tx">
                <span className="ic sk" />
                <span className="nm">
                  <b className="sk sk-line" style={{ width: `${50 + ((i * 13) % 30)}%` }} />
                  <span className="sk sk-line" style={{ width: '32%' }} />
                </span>
                <span className="am sk sk-line" style={{ width: '4.5rem' }} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  )
}
