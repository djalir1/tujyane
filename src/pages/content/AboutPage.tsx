import { ContentLayout } from './ContentLayout';

export default function AboutPage() {
  return (
    <ContentLayout kicker="About" title="About TUJYANE" updated="September 2026">
      <p>
        TUJYANE — "let's go together" in Kinyarwanda — is a Rwandan carpool
        platform built for the way people already travel here. Between city and
        village, town and hillside, the roads are full of half-empty cars
        heading to the same places. TUJYANE turns those empty seats into shared
        fuel money and shorter waits.
      </p>

      <h2>Why we're building this</h2>
      <p>
        Rwanda's road corridors are dense but scattered — Kigali to Musanze,
        Kigali to Rubavu, Kigali to Huye, Kigali to Nyagatare — and public
        transport hits a ceiling at peak times. Individual drivers pay full
        fuel while riding alone; passengers pay premium fares to sit in
        packed vans. Carpool matching, done cleanly and safely, closes that
        gap for both sides.
      </p>

      <h2>What makes this different</h2>
      <ul>
        <li><strong>Cost-sharing, not fares.</strong> Contributions are calculated by distance and vehicle type. Drivers cannot inflate.</li>
        <li><strong>Human-reviewed drivers.</strong> Every driver's ID, licence and vehicle papers are checked before their first post.</li>
        <li><strong>Boarding codes.</strong> Every accepted booking gets a 4-digit code the driver must confirm — no impersonation, no free rides.</li>
        <li><strong>Two-way ratings.</strong> The good passengers and good drivers rise to the top.</li>
      </ul>

      <h2>Where we are</h2>
      <p>
        TUJYANE is in a public pilot. The corridors and location dataset are
        curated for the initial launch and will grow as more drivers post.
        During the pilot, all money exchange happens between passenger and
        driver directly; receipts generated in the app are labelled DEMO and
        are for reference only, not tax invoices.
      </p>

      <h2>Get in touch</h2>
      <p>
        Feedback and questions are welcome. Reach the team through the address
        in the footer.
      </p>
    </ContentLayout>
  );
}
