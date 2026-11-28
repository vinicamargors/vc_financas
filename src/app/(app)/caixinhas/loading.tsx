export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Carregando caixinhas">
      <section className="balance">
        <span className="sk sk-line" style={{ width: '6rem' }} />
        <span className="sk sk-block" style={{ width: '12rem', height: '2.4rem', marginTop: 10 }} />
        <span className="sk sk-line" style={{ width: '10rem', marginTop: 12 }} />
      </section>
      <h2 className="day" aria-hidden="true">
        <span className="sk sk-line" style={{ width: '6rem' }} />
      </h2>
      <ul className="tx-list" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <li key={i} className="tx">
            <span className="ic sk" />
            <span className="nm">
              <b className="sk sk-line" style={{ width: `${45 + i * 12}%` }} />
              <span className="sk sk-line" style={{ width: '40%' }} />
            </span>
            <span className="am sk sk-line" style={{ width: '4.5rem' }} />
          </li>
        ))}
      </ul>
    </main>
  )
}
