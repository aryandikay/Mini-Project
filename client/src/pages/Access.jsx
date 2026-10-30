import { Link } from "react-router-dom";
export default function Access() {
  return <section className="access-section"><p className="eyebrow">CONTROLLED WORKSPACE ACCESS</p><h1>A shared space.<br />An authorized team.</h1><div className="comparison-grid">
    <article className="panel"><h2>Joining your team?</h2><p>Ask your workspace administrator to create a staff account. They will arrange a secure handover of your initial credentials. You can change your password after logging in.</p><Link className="button" to="/login">I have an account</Link></article>
    <article className="panel"><h2>Setting up EventSync?</h2><p>The server operator creates the first administrator with the controlled <code>npm run admin:bootstrap</code> command in the repository terminal. For the isolated demo, use <code>npm run demo:admin</code>.</p><p>There is no public registration endpoint granting access to workspace records.</p></article>
    <article className="panel"><h2>Forgot your password?</h2><p>Contact your workspace administrator or server operator. The operator can reset an account with the local <code>npm run admin:recover</code> command. Recovery revokes all existing sessions.</p><p>No recovery emails are sent by this prototype.</p></article>
  </div></section>;
}
