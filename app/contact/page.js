"use client";

import Link from "next/link";
import { MadbotMark } from "../components/Brand";
import ThemeToggle from "../components/ThemeToggle";
import SiteFooter from "../components/SiteFooter";
import { COMPANY, registeredAddressLine, emailFor } from "../../lib/company";
import { CONTACT_EMAIL } from "../../lib/contact";

/**
 * Every address on this page is resolved, never typed.
 *
 * `emailFor` returns the purpose-specific inbox, then the one configured
 * contact address, then null. Null is a real answer and gets rendered as one:
 * printing a plausible-looking address nobody reads is worse than printing
 * none, because someone with a security report or a deletion request would
 * write into a black hole and assume they had been ignored.
 */
function Route({ label, email, missing, children, span = false }) {
  return (
    <section
      className="card elev-sm"
      style={{
        padding: 20,
        gap: 9,
        border: "1px solid var(--color-divider)",
        background: "var(--color-surface)",
        gridColumn: span ? "1 / -1" : undefined,
      }}
    >
      <span className="mono">{label}</span>
      {email ? (
        <a href={`mailto:${email}`} style={{ fontSize: 16.5, wordBreak: "break-word", lineHeight: 1.3 }}>
          {email}
        </a>
      ) : (
        <span style={{ fontSize: 14.5, lineHeight: 1.45, color: "var(--fg-45)" }}>{missing}</span>
      )}
      <div className="text-muted" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
        {children}
      </div>
    </section>
  );
}

export default function ContactPage() {
  const support = emailFor("support", CONTACT_EMAIL);
  const privacy = emailFor("privacy", CONTACT_EMAIL);
  const security = emailFor("security", CONTACT_EMAIL);
  const legal = emailFor("legal", CONTACT_EMAIL);

  // The officer's own address, deliberately without the general fallback: a
  // shared inbox is not a named officer, and pretending otherwise is the exact
  // thing the rule exists to prevent.
  const officer = COMPANY.grievanceOfficer;
  const officerEmail = officer.email || emailFor("grievance");
  const address = registeredAddressLine();

  const noAddress = "No public address is published yet.";

  return (
    <div className="marketing" style={{ minHeight: "100vh", background: "var(--color-bg)", fontSize: 16 }}>
      <header style={{ borderBottom: "1px solid var(--color-divider)" }}>
        <div className="nav pad-responsive" style={{ maxWidth: 1180, margin: "0 auto", padding: "15px 28px" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 11, textDecoration: "none", color: "var(--fg)", marginRight: "auto" }}>
            <MadbotMark size={29} />
            <span style={{ fontFamily: "var(--font-body)", fontSize: 21, color: "var(--fg)" }}>madbot</span>
          </Link>
          <ThemeToggle compact />
          <Link className="btn btn-primary" href="/login" style={{ color: "var(--on-accent)" }}>
            Sign in
          </Link>
        </div>
      </header>

      <main className="pad-responsive" style={{ maxWidth: 1180, margin: "0 auto", padding: "56px 28px 90px" }}>
        <h1 style={{ margin: "0 0 12px", fontSize: "clamp(29px,7vw,50px)", maxWidth: "16em" }}>Contact</h1>
        <p className="text-muted" style={{ margin: "0 0 30px", maxWidth: "44em", fontSize: 16.5, lineHeight: 1.6 }}>
          One route per kind of question, so nothing sits in the wrong inbox. Where an address is not published yet,
          this page says so rather than showing one that does not work.
        </p>

        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(270px,1fr))", gap: 14, alignItems: "start" }}>
          <Route label="Support and sales" email={support} missing={noAddress}>
            Questions about what MADBOT does, what a plan includes, or anything that is not working.
          </Route>

          <Route label="Privacy and data requests" email={privacy} missing={noAddress}>
            Access, correction, deletion and objection requests. If you already have an account you do not need to
            write to us at all: you can export or delete your data yourself from the dashboard at any time. Details
            are in the <Link href="/legal/privacy">Privacy Policy</Link>.
          </Route>

          <Route label="Security reports" email={security} missing={noAddress}>
            Report a vulnerability here. What we commit to, and what is in scope, is set out on the{" "}
            <Link href="/legal/security">security page</Link>.
          </Route>

          <Route label="Legal" email={legal} missing={noAddress}>
            Contract questions, notices and anything about the documents at <Link href="/legal">/legal</Link>.
          </Route>

          <Route
            label="Grievance Officer (India)"
            email={officer.name && officerEmail ? officerEmail : null}
            missing={
              <>
                {officer.name
                  ? `${officer.name} is our ${officer.designation}, but no address for them is published yet.`
                  : "No grievance officer has been appointed yet, so there is no name or address to publish."}{" "}
                {support ? (
                  <>
                    Until that changes, please use the support route above at{" "}
                    <a href={`mailto:${support}`}>{support}</a>, which is read by the same people.
                  </>
                ) : (
                  <>
                    No public contact address is published yet either, so there is nowhere on this page we can
                    honestly send you. We would rather say that than print an inbox nobody reads.
                  </>
                )}
              </>
            }
            span
          >
            {officer.name && officerEmail ? (
              <p style={{ margin: "0 0 8px" }}>
                {officer.name}, {officer.designation}.
                {officer.phone ? (
                  <>
                    {" "}
                    Telephone{" "}
                    <a href={`tel:${officer.phone}`}>{officer.phoneDisplay}</a>.
                  </>
                ) : null}
              </p>
            ) : null}
            <p style={{ margin: "0 0 8px" }}>
              India&apos;s Consumer Protection (E-Commerce) Rules 2020 and the IT Rules 2021 require an online
              business to name a grievance officer and publish how to reach them.
            </p>
            <p style={{ margin: 0 }}>
              We acknowledge a grievance within {officer.acknowledgeHours} hours and aim to resolve it within{" "}
              {officer.resolveDays} days. That commitment applies whichever route you use in the meantime.
            </p>
          </Route>
        </div>

        <section style={{ marginTop: 44, maxWidth: "46em" }}>
          <h2 style={{ margin: "0 0 10px", fontSize: "clamp(21px,4vw,28px)" }}>Registered office</h2>
          <p style={{ margin: "0 0 8px", fontSize: 15, lineHeight: 1.65 }}>{COMPANY.legalName}</p>
          {address ? (
            <p style={{ margin: "0 0 8px", fontSize: 15, lineHeight: 1.65 }}>{address}</p>
          ) : (
            <p className="text-muted" style={{ margin: "0 0 8px", fontSize: 15, lineHeight: 1.65 }}>
              The registered office address is not published yet. It appears here as soon as it is filed and
              confirmed.
            </p>
          )}
          {COMPANY.cin ? (
            <p className="mono" style={{ margin: 0 }}>CIN {COMPANY.cin}</p>
          ) : (
            <p className="text-muted" style={{ margin: 0, fontSize: 15, lineHeight: 1.65 }}>
              The Corporate Identity Number is not published yet.
            </p>
          )}
        </section>

        <section style={{ marginTop: 40, maxWidth: "46em" }}>
          <h2 style={{ margin: "0 0 10px", fontSize: "clamp(21px,4vw,28px)" }}>What we cannot help with by email</h2>
          <p className="text-muted" style={{ margin: 0, fontSize: 14.5, lineHeight: 1.65 }}>
            Password resets go through the <Link href="/login">sign-in page</Link>, not through us. We will never ask
            you for your password, and nobody at MADBOT can read it or tell you what it is. If a message claiming to
            be from us asks for one, it is not from us.
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
