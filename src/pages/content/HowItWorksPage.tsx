import { Link } from 'react-router-dom';
import { ContentLayout } from './ContentLayout';

export default function HowItWorksPage() {
  return (
    <ContentLayout kicker="Guide" title="How TUJYANE works" updated="September 2026">
      <p>
        TUJYANE turns empty seats into shared fuel money. A driver who is
        already making a trip posts it, and passengers going the same way join
        for a fair per-seat contribution. Three steps, no surprises.
      </p>

      <h2>1. Search or post</h2>
      <p>
        Passengers pick their start and destination on the home page and see
        available seats sorted by departure time. Drivers open <Link to="/dashboard/journeys/new">Post a trip</Link>,
        choose a verified vehicle, set the route and how many seats they are
        opening. The system suggests a contribution range based on distance
        and vehicle type — drivers cannot go above it.
      </p>

      <h2>2. Request and accept</h2>
      <p>
        A passenger sends a seat request. The driver sees it in{' '}
        <Link to="/dashboard/requests">Requests</Link> with the passenger's
        name and rating and can accept or decline. Once accepted, we issue the
        passenger a private 4-digit <em>boarding code</em>.
      </p>

      <h2>3. Board and ride</h2>
      <p>
        On the day, the driver opens the <Link to="/dashboard/driving">Driving cockpit</Link> and
        marks the passenger as boarded by entering the code the passenger
        shows them. No code, no ride. When the trip is done the driver hits{' '}
        <em>Complete</em>; both sides can leave a rating and the passenger's{' '}
        <Link to="/dashboard/receipts">receipt</Link> becomes downloadable.
      </p>

      <h2>Safety guardrails</h2>
      <ul>
        <li>Every driver is document-verified before they can post their first trip.</li>
        <li>Every booking gets its own boarding code; codes are single-use per booking.</li>
        <li>Passengers and drivers rate each other — reputations are earned.</li>
        <li>Contributions live inside a fair band; drivers cannot over-charge.</li>
      </ul>

      <h2>Ready?</h2>
      <p>
        <Link to="/">Search a ride</Link> or <Link to="/auth">create an account</Link> to start posting.
      </p>
    </ContentLayout>
  );
}
