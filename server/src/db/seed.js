// Inventory belongs to each venue, not to individual halls.
const dataset = [
  [
    "Venue A",
    2,
    2,
    5,
    [
      ["Hall A1", 60],
      ["Hall A2", 150],
    ],
  ],
  [
    "Venue B",
    2,
    1,
    4,
    [
      ["Hall B1", 100],
      ["Hall B2", 200],
    ],
  ],
  [
    "Venue C",
    3,
    2,
    6,
    [
      ["Hall C1", 80],
      ["Hall C2", 250],
    ],
  ],
];
export function seed(db, preserveExisting = false) {
  db.transaction(() => {
    const venue = db.prepare(
      `INSERT INTO venues(name,total_projectors,total_audio_systems,total_staff) VALUES(?,?,?,?) ON CONFLICT(name) DO UPDATE SET ${preserveExisting ? "name=excluded.name" : "total_projectors=excluded.total_projectors,total_audio_systems=excluded.total_audio_systems,total_staff=excluded.total_staff"} RETURNING id`,
    );
    const hall = db.prepare(
      `INSERT INTO halls(venue_id,name,capacity) VALUES(?,?,?) ON CONFLICT(venue_id,name) ${preserveExisting ? "DO NOTHING" : "DO UPDATE SET capacity=excluded.capacity"}`,
    );
    for (const [name, projectors, audio, staff, halls] of dataset) {
      const { id } = venue.get(name, projectors, audio, staff);
      for (const [hallName, capacity] of halls)
        hall.run(id, hallName, capacity);
    }
  })();
}
