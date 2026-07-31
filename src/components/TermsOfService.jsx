import LegalPageLayout from './LegalPageLayout'

export default function TermsOfService() {
  return (
    <LegalPageLayout title="Terms of Service" updatedDate="July 31, 2026">
      <p>
        These Terms of Service ("Terms") govern access to and use of EventHub Live (the "Service"), an
        internal broadcast management platform provided by Trilogy Digital Platforms, Inc. ("Trilogy
        Digital," "we," "us," or "our"). By logging in to or otherwise using the Service, you agree to
        these Terms.
      </p>

      <h2>1. Who Can Use EventHub Live</h2>
      <p>
        EventHub Live is an invitation-only tool for Trilogy Digital staff and authorized personnel of
        Trilogy Digital's client organizations ("Tenants"). Accounts are provisioned by a Trilogy Digital
        or Tenant administrator; there is no public self-signup. You may not share your login credentials,
        and you are responsible for all activity that occurs under your account.
      </p>

      <h2>2. Description of the Service</h2>
      <p>
        EventHub Live allows authorized users to configure encoders and ingest points, schedule and launch
        live video streams and 24/7 channels, route those streams to destinations such as a connected
        YouTube channel, JW Player, and BrightSpot CMS, and monitor and manage the resulting broadcasts and
        recordings.
      </p>

      <h2>3. Acceptable Use</h2>
      <p>You agree not to use the Service to:</p>
      <ul>
        <li>Access, modify, or route streams for a Tenant you are not authorized to act on behalf of;</li>
        <li>Upload, stream, or publish content that infringes the rights of others or violates applicable law;</li>
        <li>Attempt to bypass authentication, role-based permissions, or other security controls of the Service;</li>
        <li>Interfere with or disrupt the integrity or performance of the Service or connected third-party platforms.</li>
      </ul>

      <h2>4. Third-Party Services</h2>
      <p>
        EventHub Live integrates with third-party platforms, including Google/YouTube (via the YouTube
        Data API), JW Player, and BrightSpot CMS. Your use of those integrations is also subject to the
        respective third party's own terms of service and policies, including the{' '}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
          Google API Services User Data Policy
        </a>. We are not responsible for the availability, content, or practices of third-party platforms.
      </p>

      <h2>5. Content and Ownership</h2>
      <p>
        As between Trilogy Digital and a Tenant, the Tenant retains ownership of the video content,
        broadcasts, and related materials it streams or publishes through the Service. Trilogy Digital
        Platforms, Inc. retains all rights, title, and interest in and to the Service itself, including its
        software, design, and underlying technology.
      </p>

      <h2>6. Service Availability</h2>
      <p>
        The Service is provided on an "as is" and "as available" basis. We do not guarantee that the
        Service, or any connected third-party platform, will be uninterrupted, error-free, or available at
        all times, and we may modify, suspend, or discontinue any part of the Service for maintenance,
        security, or operational reasons.
      </p>

      <h2>7. Disclaimer of Warranties</h2>
      <p>
        To the fullest extent permitted by law, Trilogy Digital disclaims all warranties of any kind,
        whether express or implied, including implied warranties of merchantability, fitness for a
        particular purpose, and non-infringement, with respect to the Service.
      </p>

      <h2>8. Limitation of Liability</h2>
      <p>
        To the fullest extent permitted by law, Trilogy Digital shall not be liable for any indirect,
        incidental, special, consequential, or punitive damages, or any loss of data, revenue, or goodwill,
        arising out of or related to your use of, or inability to use, the Service.
      </p>

      <h2>9. Termination</h2>
      <p>
        We may suspend or terminate your access to the Service at any time, with or without notice,
        including if we believe you have violated these Terms. A Tenant administrator may also remove a
        user's access at any time.
      </p>

      <h2>10. Governing Law</h2>
      <p>
        These Terms are governed by the laws of the jurisdiction in which Trilogy Digital Platforms, Inc.
        is incorporated, without regard to its conflict-of-law principles.
      </p>

      <h2>11. Changes to These Terms</h2>
      <p>
        We may update these Terms from time to time. Continued use of the Service after an update
        constitutes acceptance of the revised Terms. We will update the "Last updated" date above when we
        do.
      </p>

      <h2>12. Contact Us</h2>
      <p>
        Questions about these Terms can be sent to{' '}
        <a href="mailto:info@trilogydigital.com">info@trilogydigital.com</a>.
      </p>
    </LegalPageLayout>
  )
}
