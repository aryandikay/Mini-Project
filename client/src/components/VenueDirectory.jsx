export default function VenueDirectory({ venues }) {
return (<div className="venue-grid">
          {venues.map((v, i) => (
            <article className={`venue-card venue-${i}`} key={v.id}>
              <div className="venue-art" aria-hidden="true">
                <span className="venue-letter">
                  {v.name.replace("Venue ", "")}
                </span>
                <div className="building">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <span className="art-caption">THE EVENT CAMPUS</span>
              </div>
              <div className="venue-body">
                <div className="venue-title">
                  <h3>{v.name}</h3>
                  <span>{v.halls.length} halls</span>
                </div>
                <div className="hall-list">
                  {v.halls.map((h) => (
                    <div key={h.id}>
                      <span>{h.name}</span>
                      <strong>
                        {h.capacity}
                        <small> guests</small>
                      </strong>
                    </div>
                  ))}
                </div>
                <p className="inventory-label">SHARED VENUE INVENTORY</p>
                <div className="inventory">
                  <span>
                    <b>{v.totalProjectors}</b> Projectors
                  </span>
                  <span>
                    <b>{v.totalAudioSystems}</b> Audio
                  </span>
                  <span>
                    <b>{v.totalStaff}</b> Staff
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>);
}
