import { ContentLayout } from './ContentLayout';

export default function TermsPage() {
  return (
    <ContentLayout kicker="Legal" title="Community rules & terms" updated="September 2026">
      <h2>What TUJYANE is</h2>
      <p>
        TUJYANE is a peer-to-peer carpool platform for Rwanda. It connects
        drivers who are already making a trip with passengers who are going the
        same way, so the two can share the fuel cost. TUJYANE is a
        <strong> cost-sharing service, not a taxi service.</strong> Drivers are
        not TUJYANE employees and are not licensed to operate a commercial
        transport business through the platform.
      </p>

      <h2>Who can use TUJYANE</h2>
      <ul>
        <li>You must be at least 18 years old to hold a TUJYANE account.</li>
        <li>Drivers must own or have permission to drive the vehicle they list, and hold a valid Rwandan driving licence and vehicle registration.</li>
        <li>Your account belongs to you; you may not share, sell or transfer it.</li>
      </ul>

      <h2>Cost sharing, not commercial fares</h2>
      <p>
        Per-seat contributions on TUJYANE are calculated by the platform based
        on route distance and vehicle energy type. Drivers may not charge more
        than the suggested band. The contribution is meant to cover a fair
        share of fuel and wear, not to generate profit.
      </p>

      <h2>Driver verification</h2>
      <ul>
        <li>Every driver must submit a National ID, driving licence, vehicle registration and a car photo.</li>
        <li>These documents are reviewed by a real TUJYANE reviewer before a driver can post a journey.</li>
        <li>We may re-request documents at any time; a rejected or expired document pauses the driver's ability to post new journeys.</li>
      </ul>

      <h2>Passenger responsibilities</h2>
      <ul>
        <li>Show the driver your 4-digit boarding code before you get in — no code, no ride.</li>
        <li>Be on time. If you are more than 15 minutes late, the driver may mark you as a no-show and leave.</li>
        <li>Behave respectfully. Harassment, discrimination or threats will end your account.</li>
      </ul>

      <h2>Driver responsibilities</h2>
      <ul>
        <li>Only accept a passenger you are prepared to actually pick up. Confirm the boarding code before starting the trip.</li>
        <li>Do not deviate from a reasonable version of the posted route without the passengers' consent.</li>
        <li>Refunds of the demo contribution for cancelled or no-driver rides are handled by TUJYANE support during the pilot.</li>
      </ul>

      <h2>Demo payments (pilot)</h2>
      <p>
        During the pilot, contribution amounts shown in the app are for demo
        purposes only. TUJYANE does not collect payment on your behalf. Any
        actual money changes hands between the driver and passenger directly.
        Do not treat receipts generated in-app as tax invoices.
      </p>

      <h2>Safety & incidents</h2>
      <p>
        If something goes wrong on a trip — an accident, a dispute, unsafe
        driving, harassment — leave feedback in the app and, for anything
        serious, contact TUJYANE support. In an emergency, contact the Rwanda
        National Police (112) first.
      </p>

      <h2>Termination</h2>
      <p>
        We may suspend or close an account that breaks these rules, is used to
        defraud, or presents a safety risk. You can close your own account any
        time by contacting support; historical trip records are kept for audit
        and dispute purposes.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these rules as TUJYANE grows. Material changes will be
        announced in the app; continued use after an announcement means you
        accept the update.
      </p>
    </ContentLayout>
  );
}
