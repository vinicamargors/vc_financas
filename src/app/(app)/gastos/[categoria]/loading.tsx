export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Carregando">
      <span className="title" style={{ display: 'block' }}>
        <span className="sk sk-line" style={{ width: '9rem', height: '1.6rem' }} />
      </span>
      <section className="balance" aria-hidden="true">
        <span className="sk sk-line" style={{ width: '7rem' }} />
        <span className="sk sk-block" style={{ width: '10rem', height: '2.4rem', marginTop: 10 }} />
      </section>
      <ul className="tx-list" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="tx tx-plain">
            <span className="nm">
              <b className="sk sk-line" style={{ width: `${45 + ((i * 13) % 30)}%` }} />
            </span>
            <span className="am sk sk-line" style={{ width: '4.5rem' }} />
          </li>
        ))}
      </ul>
    </main>
  )
}
