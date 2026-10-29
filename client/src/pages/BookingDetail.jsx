import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../services/api.js";
import { formatMinute } from "../utils/time.js";
import { Feedback, PageTitle } from "../components/Common.jsx";
import { RequestCards } from "../components/RequestCards.jsx";
export default function BookingDetail() {
  const { id } = useParams();
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
          <RequestCards bookings={[state.booking]} />
          <div className="notice">
            <strong>Reserved interval:</strong>{" "}
            {formatMinute(state.booking.reservedStartMinute)} –{" "}
            {formatMinute(state.booking.reservedEndMinute)} (includes setup and
            cleanup).
            {state.booking.status === "PENDING" &&
              " This request is awaiting allocation and is not confirmed."}
          </div>
        </>
      )}
    </>
  );
}
