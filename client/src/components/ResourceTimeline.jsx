import { Link } from "react-router-dom";
import { formatMinute } from "../utils/time.js";

const width = 840, start = 480, end = 1320;
const x = (minute) => (minute - start) / (end - start) * width;
function Axis() {
  return [480, 720, 960, 1200, 1320].map((minute) => <g key={minute}>
    <line x1={x(minute)} x2={x(minute)} y1="20" y2="92" stroke="#dce3d6" />
    <text x={x(minute)} y="13" textAnchor={minute === start ? "start" : minute === end ? "end" : "middle"}>{formatMinute(minute)}</text>
  </g>);
}
export default function ResourceTimeline({ data, selectedMinute }) {
  return <section className="panel" aria-label="Reservation and resource timeline">
    <h2>Availability timeline</h2>
    <p>08:00–22:00 · venue-local time. Light ends show setup and cleanup; solid centers show event execution.</p>
    <p className="muted">Scroll the timeline horizontally on small screens. Reservation links open booking details.</p>
    <div className="timeline-scroll" tabIndex={0} role="region" aria-label="Scrollable operating-hours timeline">
      {data.halls.map((hall) => <figure className="timeline-row" key={hall.id}>
        <figcaption>{hall.name} · Capacity {hall.capacity} · {hall.bookings.length ? `${hall.bookings.length} reservations` : "Available all day"}</figcaption>
        <svg viewBox={`-4 0 ${width + 8} 98`} role="img" aria-label={`${hall.name} buffered reservations`}>
          <Axis />
          {hall.bookings.map((b) => <Link key={b.id} to={`/bookings/${b.id}`} aria-label={`${b.eventName}, ${b.startTime} to ${b.endTime}, reserved ${formatMinute(b.reservedStartMinute)} to ${formatMinute(b.reservedEndMinute)}`}>
            <title>{b.eventName}: setup {formatMinute(b.reservedStartMinute)}–{b.startTime}, event {b.startTime}–{b.endTime}, cleanup until {formatMinute(b.reservedEndMinute)}</title>
            <rect x={x(b.reservedStartMinute)} y="32" width={x(b.reservedEndMinute) - x(b.reservedStartMinute)} height="42" fill="#c4dbc6" rx="3" />
            <rect x={x(b.startMinute)} y="32" width={x(b.endMinute) - x(b.startMinute)} height="42" fill="#285b49" />
          </Link>)}
          <line x1={x(selectedMinute)} x2={x(selectedMinute)} y1="22" y2="92" stroke="#c06838" strokeWidth="2" />
        </svg>
      </figure>)}
      {data.resources.map((resource) => {
        const maximum = Math.max(1, resource.inventory, resource.peak);
        return <figure className="timeline-row" key={resource.key}>
          <figcaption>{resource.label} · Inventory {resource.inventory} · Peak {resource.peak}</figcaption>
          <svg viewBox={`-4 0 ${width + 8} 98`} role="img" aria-label={`${resource.label} concurrent usage`}>
            <Axis />
            {data.segments.map((segment) => {
              const used = segment.usage[resource.key], height = used / maximum * 54;
              return <rect key={segment.startMinute} x={x(segment.startMinute)} y={86 - height}
                width={x(segment.endMinute) - x(segment.startMinute)} height={height}
                fill={used >= resource.inventory && used > 0 ? "#ac5938" : "#437e65"}>
                <title>{formatMinute(segment.startMinute)}–{formatMinute(segment.endMinute)}: {used} of {resource.inventory} in use</title>
              </rect>;
            })}
            <line x1={0} x2={width} y1={86 - resource.inventory / maximum * 54} y2={86 - resource.inventory / maximum * 54}
              stroke="#ac5938" strokeDasharray="6 4" />
            <line x1={x(selectedMinute)} x2={x(selectedMinute)} y1="22" y2="92" stroke="#c06838" strokeWidth="2" />
          </svg>
        </figure>;
      })}
    </div>
    <p className="muted">Resource height shows concurrent units; the dashed line is inventory. Orange marks full use. The vertical line is the inspection time.</p>
  </section>;
}
