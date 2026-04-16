export const LOGO_URL =
  "https://cdn.jsdelivr.net/gh/sharyyoru/maison-toa@main/public/logos/maisontoa-logo.png";

const SIGNATURE = `
  <table cellpadding="0" cellspacing="0" border="0" style="width: 100%;">
    <tr>
      <td style="padding: 28px 48px 52px 48px; border-top: 1px solid #e8e3db;">
        <p style="margin: 0; color: #1a1a18; font-size: 13px; line-height: 2.1;
                  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                  letter-spacing: 0.01em;">
          Maison Tóā<br>
          Voie du Chariot 6<br>
          1003 Lausanne
        </p>
      </td>
    </tr>
  </table>`;

/**
 * Wraps an HTML body snippet in the Maison Tóā branded email layout.
 * Body content should use inline styles and plain HTML tags only.
 */
export function brandedEmail(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f5f3ef;
             font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color: #f5f3ef;">
    <tr>
      <td align="center" style="padding: 52px 20px 72px 20px;">
        <table cellpadding="0" cellspacing="0" border="0"
               style="width: 100%; max-width: 580px; background-color: #ffffff;">

          <!-- Logo -->
          <tr>
            <td align="center"
                style="padding: 52px 48px 44px 48px; border-bottom: 1px solid #e8e3db;">
              <img src="${LOGO_URL}" alt="Maison Tóā" width="110"
                   style="display: block; width: 110px; height: auto; margin: 0 auto;">
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 44px 48px 36px 48px;
                       color: #1a1a18; font-size: 15px; line-height: 1.85;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Signature -->
          ${SIGNATURE}

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Renders a detail row for use inside an info table.
 */
export function infoRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding: 11px 0; border-bottom: 1px solid #f0ece5;
                 color: #8a8578; font-size: 12px; letter-spacing: 0.06em;
                 text-transform: uppercase; width: 42%; vertical-align: top;">
        ${label}
      </td>
      <td style="padding: 11px 0; border-bottom: 1px solid #f0ece5;
                 color: #1a1a18; font-size: 14px; text-align: right;
                 vertical-align: top;">
        ${value}
      </td>
    </tr>`;
}

/**
 * Wraps a set of infoRow() calls in a bordered table block.
 */
export function infoTable(rows: string): string {
  return `
  <table cellpadding="0" cellspacing="0" border="0"
         style="width: 100%; border-collapse: collapse; margin: 24px 0;">
    ${rows}
  </table>`;
}
