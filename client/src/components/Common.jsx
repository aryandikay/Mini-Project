import { cloneElement, useId } from "react";
export function Feedback({ error, children }) {
  return (
    <div
      className={error ? "notice error" : "notice"}
      role={error ? "alert" : "status"}
    >
      {children || error}
    </div>
  );
}
export function PageTitle({ eyebrow, title, children, action }) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="subtitle">{children}</p>
      </div>
      {action}
    </div>
  );
}
export function Field({ label, children, hint }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, {
        id,
        ...(hint ? { "aria-describedby": `${id}-hint` } : {}),
      })}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function Status({ value }) {
  return (
    <span className={`badge ${value.toLowerCase()}`}>
      <span aria-hidden="true">●</span>{" "}
      {value === "PENDING"
        ? "Pending allocation"
        : value.charAt(0) + value.slice(1).toLowerCase()}
    </span>
  );
}
export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">
        ▤
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
