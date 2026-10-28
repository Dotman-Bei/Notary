// Loading keeps the final layout with flat grey bars at real size; an error sits inside the block that failed.
export function Loading({ title, error, retry }: { title: string; error: string | null; retry: () => void }) {
  return (
    <>
      <div className="title-row"><div><h1>{title}</h1><p className="sub">{error ? 'Couldn’t read NotaryRegistry.' : 'Reading NotaryRegistry on BOT Chain…'}</p></div></div>
      <section className="panel">
        {error ? (
          <p className="error-line">Couldn’t load the register: {error}. <button className="btn grey" onClick={retry}>Retry</button></p>
        ) : (
          <div className="skeleton-rows" aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton-row"><span /><span /><span /></div>)}
          </div>
        )}
      </section>
    </>
  )
}
