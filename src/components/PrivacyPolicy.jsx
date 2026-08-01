import LegalPageLayout from './LegalPageLayout'

export default function PrivacyPolicy() {
  return (
    <LegalPageLayout title="Privacy Policy" updatedDate="July 31, 2026">
      <p>
        This Privacy Policy explains how Trilogy Digital Platforms, Inc. ("Trilogy Digital," "we," "us,"
        or "our") collects, uses, and shares information in connection with EventHubLive (the "Service"),
        an internal broadcast management platform used by Trilogy Digital staff and authorized client
        organizations ("Tenants") to configure, launch, and monitor live video streams and simulcasts.
      </p>
      <p>
        EventHubLive is an invitation-only, staff-facing administrative tool. It is not directed at, and
        is not intended for use by, members of the general public.
      </p>

      <h2>1. Information We Collect</h2>
      <p>We collect the following categories of information in order to operate the Service:</p>
      <ul>
        <li>
          <strong>Account information:</strong> name, email address, and hashed password used to
          authenticate to the Service, along with your assigned role and Tenant organization(s).
        </li>
        <li>
          <strong>Operational data you provide:</strong> stream titles, schedules, encoder and ingest
          configurations, router settings, tenant branding, and related metadata you create while using
          the Service.
        </li>
        <li>
          <strong>Usage and log data:</strong> actions taken within the admin dashboard, timestamps, and
          basic technical data (such as IP address and browser type) captured by our hosting provider for
          security and troubleshooting purposes.
        </li>
        <li>
          <strong>Third-party integration data:</strong> when you connect a Tenant's YouTube channel, JW
          Player account, or BrightSpot CMS instance, we access and store the data necessary to create and
          manage live broadcasts, video assets, and published content through those services, as described
          below.
        </li>
      </ul>

      <h2>2. Google User Data &amp; Limited Use Disclosure</h2>
      <p>
        EventHubLive integrates with the YouTube Data API to let authorized users create, configure, and
        manage live broadcasts on a connected YouTube channel on the Tenant's behalf (for example,
        simulcasting a live stream to YouTube). To do this, we request and store an OAuth access/refresh
        token scoped to the YouTube account the Tenant explicitly connects.
      </p>
      <p>
        We access only the YouTube data required to create and manage broadcasts and streams for the
        connected channel. We do not use this data for advertising, and we do not sell it. EventHubLive's
        use and transfer to any other app of information received from Google APIs will adhere to the{' '}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
          Google API Services User Data Policy
        </a>, including the Limited Use requirements. A connected Tenant may revoke EventHubLive's access
        to their Google account at any time from their{' '}
        <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
          Google Account security settings
        </a>{' '}
        or by disconnecting the integration from within the Service.
      </p>

      <h2>3. How We Use Information</h2>
      <ul>
        <li>To provide, operate, and maintain the Service, including authenticating users and enforcing role-based access;</li>
        <li>To create, launch, monitor, and route live streams and simulcasts on behalf of Tenants, including publishing broadcasts to connected YouTube channels, JW Player accounts, and BrightSpot CMS instances;</li>
        <li>To troubleshoot technical issues, maintain security, and prevent misuse of the Service;</li>
        <li>To communicate with you about your account or changes to the Service.</li>
      </ul>

      <h2>4. How We Share Information</h2>
      <p>We do not sell personal information. We share information only as follows:</p>
      <ul>
        <li>
          <strong>Service providers we use to operate EventHubLive:</strong> Supabase (authentication and
          database hosting) and Vercel (application hosting), each acting as a data processor on our behalf.
        </li>
        <li>
          <strong>Third-party platforms you connect:</strong> Google/YouTube, JW Player, and BrightSpot CMS,
          solely to carry out the broadcast and publishing actions you initiate within the Service.
        </li>
        <li>
          <strong>Within your organization:</strong> information may be visible to other authorized users
          of the same Tenant, and to Trilogy Digital staff who administer the platform across all Tenants.
        </li>
        <li>
          <strong>Legal or safety reasons:</strong> if required to comply with applicable law, legal
          process, or to protect the rights, property, or safety of Trilogy Digital, our users, or others.
        </li>
      </ul>

      <h2>5. Data Retention</h2>
      <p>
        We retain account and operational data for as long as your account or Tenant organization remains
        active on the Service, and for a reasonable period afterward as needed for legal, security, or
        record-keeping purposes. Live and archived stream recordings are subject to the retention windows
        configured for each Tenant (for example, downloadable VOD assets are automatically deleted after
        their configured expiry).
      </p>

      <h2>6. Data Security</h2>
      <p>
        We use administrative, technical, and physical safeguards designed to protect information against
        unauthorized access, alteration, disclosure, or destruction, including encrypted transport,
        role-based access controls, and credential hashing. No method of transmission or storage is
        completely secure, and we cannot guarantee absolute security.
      </p>

      <h2>7. Your Rights and Choices</h2>
      <p>
        You may request access to, correction of, or deletion of your account information, or ask us to
        disconnect a third-party integration, by contacting us using the information below. Tenant
        administrators may also manage or remove team members directly within the Service.
      </p>

      <h2>8. Children's Privacy</h2>
      <p>
        EventHubLive is an internal business tool intended for use by adult staff and authorized
        personnel only. It is not directed at children, and we do not knowingly collect information from
        anyone under the age of 18.
      </p>

      <h2>9. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time to reflect changes in our practices or for
        other operational, legal, or regulatory reasons. We will update the "Last updated" date above when
        we do.
      </p>

      <h2>10. Contact Us</h2>
      <p>
        If you have questions about this Privacy Policy or how we handle information, contact us at{' '}
        <a href="mailto:info@trilogydigital.com">info@trilogydigital.com</a>.
      </p>
    </LegalPageLayout>
  )
}
