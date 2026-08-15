const API_BASE = "https://api.sam.gov/entity-information/v3/entities";

interface SamPhysicalAddress {
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  stateOrProvinceCode?: string;
  zipCode?: string;
  countryCode?: string;
}

interface SamEntityRegistration {
  ueiSAM?: string;
  legalBusinessName?: string;
  registrationDate?: string;
}

interface SamCoreData {
  physicalAddress?: SamPhysicalAddress;
  generalInformation?: {
    entityStructureDesc?: string;
  };
}

interface SamEntity {
  entityRegistration?: SamEntityRegistration;
  coreData?: SamCoreData;
}

interface SamSearchResponse {
  totalRecords: number;
  entityData: SamEntity[];
}

interface SamErrorResponse {
  errors?: Array<{ code: string; message: string }>;
  error?: { code: string; message: string };
}

export interface UtahBusiness {
  ueiSAM: string;
  legalBusinessName: string;
  registrationDate: string | null;
  entityType: string | null;
  address: string | null;
}

function formatAddress(addr: SamPhysicalAddress | undefined): string | null {
  if (!addr) return null;
  const parts = [addr.addressLine1, addr.city, addr.stateOrProvinceCode, addr.zipCode].filter(
    Boolean,
  );
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * Fetches active, publicly registered SAM.gov entities with a Utah physical
 * address, newest registration first. Free personal API keys are capped at
 * 10 requests/day and 10 records/page, so pagination is bounded accordingly.
 */
export async function fetchUtahEntities(options: {
  apiToken: string;
  maxPages?: number;
}): Promise<UtahBusiness[]> {
  const { apiToken, maxPages = 5 } = options;

  const results: UtahBusiness[] = [];

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      api_key: apiToken,
      physicalAddressProvinceOrStateCode: "UT",
      registrationStatus: "A",
      includeSections: "entityRegistration,coreData",
      page: String(page),
    });

    const res = await fetch(`${API_BASE}?${params.toString()}`, { cache: "no-store" });
    const rawBody = (await res.json()) as SamSearchResponse | SamErrorResponse;

    if (!res.ok || !("entityData" in rawBody)) {
      const errBody = rawBody as SamErrorResponse;
      const message = errBody.errors
        ? errBody.errors.map((e) => e.message).join("; ")
        : errBody.error
          ? errBody.error.message
          : `HTTP ${res.status}`;
      throw new Error(`SAM.gov request failed: ${message}`);
    }

    const body: SamSearchResponse = rawBody;

    for (const entity of body.entityData) {
      const uei = entity.entityRegistration?.ueiSAM;
      const name = entity.entityRegistration?.legalBusinessName;
      if (!uei || !name) continue;

      results.push({
        ueiSAM: uei,
        legalBusinessName: name,
        registrationDate: entity.entityRegistration?.registrationDate ?? null,
        entityType: entity.coreData?.generalInformation?.entityStructureDesc ?? null,
        address: formatAddress(entity.coreData?.physicalAddress),
      });
    }

    if (body.entityData.length < 10 || results.length >= body.totalRecords) break;
  }

  return results;
}
