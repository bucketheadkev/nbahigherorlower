/**
 * Server-rendered 1v1 invite page.
 * /join/:code rewrites here so Messages can read Open Graph tags
 * without running JavaScript. No auth. No App Store link.
 */

const ORIGIN = 'https://one-billion-run-legal.vercel.app';
const OG_IMAGE = `${ORIGIN}/images/h2h-invite-og.jpg`;
const PAGE_TITLE = '1B Run — 1v1 Invite';
const DESCRIPTION = "You've been challenged to a 1v1. Tap to join.";
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function sanitizeCode(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .split('')
    .filter((ch) => ALPHABET.includes(ch))
    .join('')
    .slice(0, 4);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPage(code) {
  const valid = code.length === 4;
  const pageUrl = valid ? `${ORIGIN}/join/${code}` : `${ORIGIN}/join`;
  const deepLink = valid ? `pickfive://join/${code}` : 'pickfive://join';
  const displayCode = valid ? code : '————';
  const safeUrl = escapeHtml(pageUrl);
  const safeDeepLink = escapeHtml(deepLink);
  const safeCode = escapeHtml(displayCode);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${PAGE_TITLE}</title>
    <meta name="description" content="${DESCRIPTION}" />
    <meta name="theme-color" content="#010814" />
    <link rel="canonical" href="${safeUrl}" />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="1B Run" />
    <meta property="og:title" content="${PAGE_TITLE}" />
    <meta property="og:description" content="${DESCRIPTION}" />
    <meta property="og:url" content="${safeUrl}" />
    <meta property="og:image" content="${OG_IMAGE}" />
    <meta property="og:image:secure_url" content="${OG_IMAGE}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="1B Run 1v1 invite" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${PAGE_TITLE}" />
    <meta name="twitter:description" content="${DESCRIPTION}" />
    <meta name="twitter:image" content="${OG_IMAGE}" />

    <link rel="stylesheet" href="/styles/invite.css" />
  </head>
  <body class="invite-body">
    <main class="invite-page">
      <div class="invite-page__brand">
        <img
          class="invite-page__logo"
          src="/images/1b-run-app-icon-squircle.png"
          width="112"
          height="112"
          alt="1B Run"
        />
        <p class="invite-page__wordmark">1B Run</p>
        <p class="invite-page__kicker">1v1 Invite</p>
      </div>

      <section class="invite-page__card">
        <p class="invite-page__lead">${DESCRIPTION}</p>
        <p class="invite-page__code-label">Room code</p>
        <p class="invite-page__code">${safeCode}</p>
        <a class="invite-page__open" href="${safeDeepLink}">Open in 1B Run</a>
        <ol class="invite-page__steps">
          <li>If <strong>1B Run</strong> is installed, tap <strong>Open in 1B Run</strong>. That opens this room.</li>
          <li>If it does not open, launch 1B Run → <strong>1v1</strong> → <strong>Join Game</strong>.</li>
          <li>Enter room code <strong>${safeCode}</strong>.</li>
        </ol>
        <p class="invite-page__hint">
          No account is required to view this page. Ask the person who invited you to make sure the lobby is still open.
        </p>
      </section>

      <p class="invite-page__footer">
        KovA Studios ·
        <a href="mailto:onebillionrun@gmail.com">onebillionrun@gmail.com</a>
      </p>
    </main>
  </body>
</html>`;
}

module.exports = function joinInvite(req, res) {
  const fromQuery = req.query && (req.query.code || req.query.join);
  const code = sanitizeCode(Array.isArray(fromQuery) ? fromQuery[0] : fromQuery);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.end(renderPage(code));
};
