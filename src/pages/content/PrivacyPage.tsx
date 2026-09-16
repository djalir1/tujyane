import { ContentLayout } from './ContentLayout';

export default function PrivacyPage() {
  return (
    <ContentLayout kicker="Legal" title="Privacy policy" updated="September 2026">
      <h2>What we collect</h2>
      <ul>
        <li>Your name, email, phone number and password (encrypted) when you sign up.</li>
        <li>The role you chose (passenger, driver, or both).</li>
        <li>Trips you post or book, the boarding codes we issue, and the ratings you leave.</li>
        <li>For drivers: photos or scans of your National ID, driving licence and vehicle registration, and a car photo.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To let passengers find drivers and vice-versa, and to keep boarding secure with 4-digit codes.</li>
        <li>To review driver documents before allowing them to post trips.</li>
        <li>To keep an audit trail of platform actions for safety and dispute resolution.</li>
      </ul>

      <h2>Where your identity documents live</h2>
      <p>
        National ID, driving licence, vehicle registration and car photos are
        uploaded to a private storage bucket that only you and the TUJYANE
        reviewer team can access. Other users never see these files. We never
        share them with third parties except when required by law.
      </p>

      <h2>What we share</h2>
      <ul>
        <li>Your name, avatar and rating are visible to drivers/passengers on trips you interact with.</li>
        <li>Your phone number is shared with a driver only after they accept your booking.</li>
        <li>Aggregated, non-identifying stats may appear in TUJYANE reports (e.g. "average corridor demand").</li>
      </ul>

      <h2>How long we keep it</h2>
      <ul>
        <li>Account & profile data: for as long as your account is active, and 30 days after you close it.</li>
        <li>Trip and booking records: for at least 24 months, for audit and dispute resolution.</li>
        <li>Uploaded ID documents: kept for the life of the account; deleted 30 days after you close it, unless a legal hold applies.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You can request a copy of the data we hold on you, ask us to correct
        it, or ask us to delete your account. Contact us via the address in
        the footer to exercise these rights.
      </p>

      <h2>Cookies</h2>
      <p>
        TUJYANE uses cookies only to keep you signed in and to remember your
        theme and language. You can decline non-essential cookies from the
        banner on your first visit.
      </p>

      <h2>Changes</h2>
      <p>
        If we materially change how we handle your data, we will notify you in
        the app before the change takes effect.
      </p>
    </ContentLayout>
  );
}
