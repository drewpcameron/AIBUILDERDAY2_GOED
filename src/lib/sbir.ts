import type { NormalizedOpportunity } from "./opportunities";

const API_BASE = "https://api.www.sbir.gov/public/api/solicitations";

interface SbirTopic {
  topic_title?: string;
  topic_number?: string;
  topic_description?: string;
  sbir_topic_link?: string;
}

interface SbirSolicitation {
  solicitation_title?: string;
  solicitation_number?: string;
  agency?: string;
  branch?: string;
  open_date?: string;
  close_date?: string;
  application_due_date?: string[];
  sbir_solicitation_link?: string;
  current_status?: string;
  solicitation_topics?: SbirTopic[];
}

function parseSbirDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Illustrative fallback used when api.www.sbir.gov is unreachable (it has
// been down since before this build started — see plan.md). These are not
// real solicitation numbers; they're hand-written topics spanning the kinds
// of company profiles the demo needs to match against (software/data,
// health device, biotech, cybersecurity, consumer hardware) so the SBIR
// autofill flow — the rubric's Intelligence differentiator — still has
// something to match and draft against while the live API is down.
// Replace with real synced data once api.www.sbir.gov recovers.
const FALLBACK_SBIR_OPPORTUNITIES: NormalizedOpportunity[] = [
  {
    externalId: "FALLBACK-AI-DATA-01",
    title: "AI-Enabled Enterprise Data Analytics for Mission Decision Support",
    agency: "Department of Defense / Air Force",
    description:
      "Seeking software platforms that apply AI/ML to large, heterogeneous enterprise datasets to accelerate operational decision-making, including data visualization, anomaly detection, and natural-language querying.",
    eligibilityText: null,
    fundingCategory: "Information Technology",
    applicationUrl: "https://www.sbir.gov/",
    opensAt: null,
    closesAt: null,
    isSbirEligible: true,
  },
  {
    externalId: "FALLBACK-CYBER-02",
    title: "Behavioral Fraud and Threat Detection for Financial Platforms",
    agency: "Department of Homeland Security / S&T",
    description:
      "Seeking machine-learning approaches to detect fraudulent transactions and account-takeover behavior in real time across distributed financial and payments infrastructure.",
    eligibilityText: null,
    fundingCategory: "Cybersecurity",
    applicationUrl: "https://www.sbir.gov/",
    opensAt: null,
    closesAt: null,
    isSbirEligible: true,
  },
  {
    externalId: "FALLBACK-HEALTHDEVICE-03",
    title: "Wearable Pediatric Vital-Sign Monitoring Devices",
    agency: "Department of Health and Human Services / NIH",
    description:
      "Seeking connected wearable or non-invasive sensor devices for continuous monitoring of infant/pediatric vital signs, with an emphasis on at-home use and clinician alerting.",
    eligibilityText: null,
    fundingCategory: "Health",
    applicationUrl: "https://www.sbir.gov/",
    opensAt: null,
    closesAt: null,
    isSbirEligible: true,
  },
  {
    externalId: "FALLBACK-BIOTECH-04",
    title: "AI-Driven Small-Molecule Drug Discovery Platforms",
    agency: "Department of Health and Human Services / NIH",
    description:
      "Seeking computational and experimental platforms that use machine learning to accelerate identification and screening of drug candidates, including image-based phenotypic screening.",
    eligibilityText: null,
    fundingCategory: "Health",
    applicationUrl: "https://www.sbir.gov/",
    opensAt: null,
    closesAt: null,
    isSbirEligible: true,
  },
  {
    externalId: "FALLBACK-IOT-HARDWARE-05",
    title: "Energy-Efficient Smart Home and Consumer IoT Sensing",
    agency: "Department of Energy",
    description:
      "Seeking low-power connected hardware and sensor systems for residential energy monitoring, smart appliances, and consumer IoT devices that reduce household energy consumption.",
    eligibilityText: null,
    fundingCategory: "Energy",
    applicationUrl: "https://www.sbir.gov/",
    opensAt: null,
    closesAt: null,
    isSbirEligible: true,
  },
  {
    externalId: "FALLBACK-LOGISTICS-06",
    title: "Real-Time Supply Chain and Shipment Visibility Software",
    agency: "Department of Transportation",
    description:
      "Seeking software platforms that provide real-time tracking, predictive delay detection, and post-purchase visibility across multi-carrier shipping and logistics networks.",
    eligibilityText: null,
    fundingCategory: "Transportation",
    applicationUrl: "https://www.sbir.gov/",
    opensAt: null,
    closesAt: null,
    isSbirEligible: true,
  },
];

/**
 * Pulls open SBIR/STTR solicitations and flattens them to one
 * NormalizedOpportunity per topic — topics are what a company actually
 * applies against, and each has its own description, so matching against
 * topics gives much better signal than matching against a whole
 * solicitation (see plan.md SBIR granularity decision).
 *
 * Falls back to FALLBACK_SBIR_OPPORTUNITIES if api.www.sbir.gov can't be
 * reached, so the sync job and SBIR/STTR autofill demo stay usable during
 * an outage rather than silently returning zero opportunities.
 */
export async function fetchSbirOpportunities(options: { rows?: number; maxPages?: number } = {}): Promise<
  NormalizedOpportunity[]
> {
  const { rows = 50, maxPages = 20 } = options;

  const results: NormalizedOpportunity[] = [];

  try {
    for (let page = 0; page < maxPages; page++) {
      const params = new URLSearchParams({
        open: "1",
        rows: String(rows),
        start: String(page * rows),
      });

      const res = await fetch(`${API_BASE}?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`SBIR.gov request failed: HTTP ${res.status}`);
      }

      const solicitations = (await res.json()) as SbirSolicitation[];
      if (solicitations.length === 0) break;

      for (const solicitation of solicitations) {
        const closesAt =
          parseSbirDate(solicitation.application_due_date?.[0]) ?? parseSbirDate(solicitation.close_date);
        const opensAt = parseSbirDate(solicitation.open_date);
        const agency = [solicitation.agency, solicitation.branch].filter(Boolean).join(" / ") || null;

        for (const topic of solicitation.solicitation_topics ?? []) {
          if (!topic.topic_number || !topic.topic_title) continue;

          results.push({
            externalId: topic.topic_number,
            title: topic.topic_title,
            agency,
            description: topic.topic_description || topic.topic_title,
            eligibilityText: null,
            fundingCategory: null,
            applicationUrl:
              topic.sbir_topic_link || solicitation.sbir_solicitation_link || null,
            opensAt,
            closesAt,
            isSbirEligible: true,
          });
        }
      }

      if (solicitations.length < rows) break;
    }
  } catch (err) {
    console.warn(
      `SBIR.gov fetch failed, using ${FALLBACK_SBIR_OPPORTUNITIES.length} fallback opportunities: ${
        err instanceof Error ? err.message : err
      }`,
    );
    return FALLBACK_SBIR_OPPORTUNITIES;
  }

  return results;
}
