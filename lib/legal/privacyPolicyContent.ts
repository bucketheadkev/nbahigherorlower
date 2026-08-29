export interface LegalSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  link?: { href: string; label: string };
}

export const PRIVACY_POLICY = {
  title: 'Privacy Policy for 1B Run',
  effectiveDate: 'Effective date: August 29, 2026',
  intro:
    'KovA Studios operates 1B Run. This Privacy Policy explains what information is collected, how it is used, and the choices available to users.',
  sections: [
    {
      heading: 'Information We Collect',
      paragraphs: [
        '1B Run does not require an email address, phone number, or traditional user account. Solo gameplay can be played without creating an account.',
        'When a user accesses online 1v1 multiplayer, 1B Run creates an anonymous account identifier through Supabase. The app may collect and store:',
      ],
      bullets: [
        'An anonymous user identifier',
        'A user-selected multiplayer display name',
        'Lobby and room codes',
        'Multiplayer game progress, player selections, match results, and timestamps',
        'Technical information processed automatically by service providers, such as IP addresses, authentication information, and basic connection logs',
      ],
      trailing:
        'Solo progress, preferences, settings, completed runs, and similar game information are stored locally on the user’s device.',
    },
    {
      heading: 'How We Use Information',
      paragraphs: ['Information is used to:'],
      bullets: [
        'Operate online multiplayer matches',
        'Create and manage private game lobbies',
        'Restore active game sessions',
        'Record and synchronize multiplayer progress',
        'Maintain the security, reliability, and functionality of the game',
        'Respond to support and privacy requests',
      ],
      trailing: 'KovA Studios does not sell users’ personal information.',
    },
    {
      heading: 'Third-Party Services',
      paragraphs: [
        '1B Run uses third-party services that may process information to provide their functionality:',
      ],
      bullets: [
        'Supabase — anonymous authentication, database services, and multiplayer synchronization',
        'Apple — application distribution and device services',
      ],
      trailing:
        'These providers process information under their own privacy policies and terms.',
    },
    {
      heading: 'Local Storage',
      paragraphs: [
        '1B Run uses local device storage to save preferences, settings, gameplay progress, completed runs, multiplayer session information, and anonymous authentication sessions. Removing the app may remove locally stored information, but it may not automatically delete multiplayer information already stored by our service providers.',
      ],
    },
    {
      heading: 'Data Retention and Deletion',
      paragraphs: [
        'Information is retained only as reasonably necessary to operate the game, maintain security, resolve disputes, and comply with applicable obligations.',
        'Users may delete their data through Settings → Delete My Data or by contacting onebillionrun@gmail.com. In-app deletion permanently removes the anonymous Supabase account, associated multiplayer records stored by KovA Studios, and locally stored data on the device, then creates a fresh anonymous session so the app remains usable.',
      ],
    },
    {
      heading: 'Children’s Privacy',
      paragraphs: [
        '1B Run is not directed to children under 13, and KovA Studios does not knowingly collect personal information from children under 13. If we learn that such information has been collected, we will take appropriate steps to delete it.',
      ],
    },
    {
      heading: 'Data Security',
      paragraphs: [
        'KovA Studios uses reasonable technical measures intended to protect information. However, no electronic storage or transmission system can be guaranteed to be completely secure.',
      ],
    },
    {
      heading: 'User Choices',
      paragraphs: ['Users may:'],
      bullets: [
        'Change their multiplayer display name',
        'Delete their data through Settings → Delete My Data',
        'Contact KovA Studios with privacy questions or deletion requests at onebillionrun@gmail.com',
      ],
    },
    {
      heading: 'Changes to This Policy',
      paragraphs: [
        'This Privacy Policy may be updated as 1B Run changes. The updated policy will be posted on this page with a revised effective date.',
      ],
    },
    {
      heading: 'Contact',
      paragraphs: [
        'For privacy questions, support, or data-deletion requests, contact:',
        'KovA Studios',
        'onebillionrun@gmail.com',
      ],
    },
  ] satisfies Array<
    LegalSection & { trailing?: string; link?: { href: string; label: string } }
  >,
};

export const SUPPORT_CONTENT = {
  title: '1B Run Support',
  paragraphs: [
    'Need help with 1B Run, multiplayer, or your data? Contact KovA Studios at:',
    'onebillionrun@gmail.com',
    'When contacting support, describe the issue, the device you’re using, and the steps that caused the problem. Do not include passwords or sensitive personal information.',
  ],
};
