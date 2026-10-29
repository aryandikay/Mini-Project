import LifecycleActions from "../components/LifecycleActions.jsx";
import Recommendations from "../components/Recommendations.jsx";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../services/api.js";
import { formatMinute } from "../utils/time.js";
import { Feedback, PageTitle } from "../components/Common.jsx";
import { RequestCards } from "../components/RequestCards.jsx";
export default function BookingDetail({ venues, clients, onChanged }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let active = true;
    setState({ loading: true });
    api
      .booking(id)
      .then((booking) => {
        if (active) setState({ booking });
      })
      .catch((e) => {
        if (active) setState({ error: e.message });
      });
    return () => {
      active = false;
    };
  }, [id]);
  return (
    <>
      <PageTitle
        eyebrow="REQUEST DETAILS"
        title={`Event request #${id}`}
        action={
          <Link to="/bookings" className="button secondary">
            ← All requests
          </Link>
        }
      >
        Saved event details from the EventSync database.
      </PageTitle>
      {state.loading ? (
        <Feedback>Loading request…</Feedback>
      ) : state.error ? (
        <Feedback error={state.error} />
      ) : (
        <>
          <RequestCards bookings={[state.booking]} showAlternativeAction={false} />
          <p className="muted">
            Created: {state.booking.createdAt} · Updated:{" "}
            {state.booking.updatedAt}
          </p>
          <p className="muted">
            Client contact:{" "}
            {clients.find((c) => c.id === state.booking.clientId)?.email ||
              "No email"}{" "}
            ·{" "}
            {clients.find((c) => c.id === state.booking.clientId)?.phone ||
              "No phone"}
          </p>
          <div className="notice">
            <strong>
              {state.booking.status === "CONFIRMED"
                ? "Reserved interval:"
                : "Requested / historical interval (not reserved):"}
            </strong>{" "}
            {formatMinute(state.booking.reservedStartMinute)} –{" "}
            {formatMinute(state.booking.reservedEndMinute)} (includes setup and
            cleanup).
            {state.booking.status === "PENDING" &&
              " This request is awaiting allocation and is not confirmed."}
          </div>
          <LifecycleActions
            key={id}
            booking={state.booking}
            venues={venues}
            onChanged={async (booking) => {
              setState({ booking });
              await onChanged();
            }}
          />
          {state.booking.status === "CONFIRMED" && <p><Link className="button secondary" to={`/simulation?bookingId=${state.booking.id}`}>Explore a what-if change</Link></p>}
          {state.booking.status === "REJECTED" && <Recommendations key={id} original={state.booking}
            onConfirmed={async (booking) => {
              await onChanged();
              navigate(`/bookings/${booking.id}`);
            }} />}
        </>
      )}
    </>
  );
}
