import type { Business, Match, Opportunity } from "@/generated/prisma/client";

const RESEND_API_URL = "https://api.resend.com/emails";

// Real sender identity + physical address, per plan.md component 6 ("includes
// real sender identity, physical address line, opt-out link even though not
// strictly required").
const FROM_NAME = "Utah Governor's Office of Economic Opportunity";
const FROM_ADDRESS = process.env.OUTREACH_FROM_EMAIL ?? "onboarding@resend.dev";
const PHYSICAL_ADDRESS = "60 E South Temple, Salt Lake St, Salt Lake City, UT 84111";
const UNSUBSCRIBE_EMAIL = "unsubscribe@business.utah.gov";

type MatchWithOpportunity = Match & { opportunity: Opportunity };

function dashboardUrl(business: Business): string {
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return `${base}/dashboard/${business.dashboardToken}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function buildOutreachEmail(business: Business, matches: MatchWithOpportunity[]) {
  const subject = `${business.name}, you may qualify for ${matches.length} federal funding opportunit${matches.length === 1 ? "y" : "ies"}`;

  const matchBlocksHtml = matches
    .map(
      (m) => `
<tr><td style="padding:16px 0;border-top:1px solid #e2e2e2;">
  <p style="margin:0 0 4px;font-weight:600;">${escapeHtml(m.opportunity.title)}</p>
  <p style="margin:0 0 4px;color:#555;font-size:14px;">${escapeHtml(m.opportunity.agency ?? "")} &middot; ${m.confidence} confidence</p>
  <p style="margin:0;font-size:14px;">${escapeHtml(m.reasoning)}</p>
</td></tr>`,
    )
    .join("");

  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
  <p>Hi ${escapeHtml(business.name)} team,</p>
  <p>The Utah Governor's Office of Economic Opportunity reviewed public federal funding
  opportunities against your business and found ${matches.length} that may be a fit:</p>
  <table style="width:100%;border-collapse:collapse;">${matchBlocksHtml}</table>
  <p style="margin-top:24px;">
    <a href="${dashboardUrl(business)}" style="background:#1a4480;color:#fff;padding:10px 18px;text-decoration:none;border-radius:4px;">
      View your full matches
    </a>
  </p>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e2e2e2;" />
  <p style="font-size:12px;color:#888;">
    ${FROM_NAME}<br />
    ${PHYSICAL_ADDRESS}<br />
    <a href="mailto:${UNSUBSCRIBE_EMAIL}?subject=Unsubscribe">Unsubscribe from future outreach</a>
  </p>
</div>`.trim();

  const text = [
    `Hi ${business.name} team,`,
    ``,
    `The Utah Governor's Office of Economic Opportunity reviewed public federal funding opportunities against your business and found ${matches.length} that may be a fit:`,
    ``,
    ...matches.flatMap((m) => [
      `${m.opportunity.title} (${m.opportunity.agency ?? "unknown agency"}) — ${m.confidence} confidence`,
      m.reasoning,
      ``,
    ]),
    `View your full matches: ${dashboardUrl(business)}`,
    ``,
    `--`,
    FROM_NAME,
    PHYSICAL_ADDRESS,
    `Unsubscribe: mailto:${UNSUBSCRIBE_EMAIL}?subject=Unsubscribe`,
  ].join("\n");

  return { subject, html, text };
}

/**
 * Sends the outreach email for one business. Per plan.md Scope Decision 1,
 * this always sends to a fixed test inbox / opt-in list address, never to a
 * business's own (undiscovered, unconsented) contact email — the demo send
 * is simulated, not a real blast.
 */
export async function sendOutreachEmail(business: Business, matches: MatchWithOpportunity[]): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const recipient = process.env.OUTREACH_TEST_RECIPIENT;
  if (!apiKey || !recipient || matches.length === 0) return false;

  const { subject, html, text } = buildOutreachEmail(business, matches);

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM_ADDRESS}>`,
      to: [recipient],
      subject,
      html,
      text,
      headers: {
        "List-Unsubscribe": `<mailto:${UNSUBSCRIBE_EMAIL}?subject=Unsubscribe>`,
      },
    }),
    cache: "no-store",
  });

  return res.ok;
}
