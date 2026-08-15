// Hand-curated seed list of real, public Utah businesses (Silicon Slopes and
// beyond), used as demo data in place of a live registry crawl. See
// plan.md Scope Decisions — SAM.gov's Entity Management API requires an
// existing entity association to get a key, and Utah's own business search
// (businessregistration.utah.gov) blocks unauthenticated automated access,
// so ingestion is seeded rather than live-crawled for the hackathon build.
export const SEED_BUSINESSES = [
  {
    name: "Qualtrics",
    entityType: "Corporation",
    address: "333 W River Park Dr, Provo, UT",
  },
  {
    name: "Podium",
    entityType: "Corporation",
    address: "1650 W Digital Dr, Lehi, UT",
  },
  {
    name: "Weave Communications",
    entityType: "Corporation",
    address: "1341 S 500 E, Lehi, UT",
  },
  {
    name: "Domo",
    entityType: "Corporation",
    address: "772 E Utah Valley Dr, American Fork, UT",
  },
  {
    name: "Divvy (Bill.com)",
    entityType: "Corporation",
    address: "2700 W Executive Pkwy, Lehi, UT",
  },
  {
    name: "Route",
    entityType: "Corporation",
    address: "3364 W 1820 S, Lehi, UT",
  },
  {
    name: "Nav",
    entityType: "Corporation",
    address: "2500 W Executive Pkwy, Lehi, UT",
  },
  {
    name: "Pluralsight",
    entityType: "Corporation",
    address: "182 N Vine St, Farmington, UT",
  },
  {
    name: "Owlet Baby Care",
    entityType: "Corporation",
    address: "3300 N Ashton Blvd, Lehi, UT",
  },
  {
    name: "Instructure",
    entityType: "Corporation",
    address: "6330 S 3000 E, Salt Lake City, UT",
  },
  {
    name: "Ancestry.com",
    entityType: "LLC",
    address: "1300 W Traverse Pkwy, Lehi, UT",
  },
  {
    name: "Vivint Smart Home",
    entityType: "Corporation",
    address: "4931 N 300 W, Provo, UT",
  },
  {
    name: "Health Catalyst",
    entityType: "Corporation",
    address: "3165 E Millrock Dr, Salt Lake City, UT",
  },
  {
    name: "MX Technologies",
    entityType: "Corporation",
    address: "3401 N Thanksgiving Way, Lehi, UT",
  },
  {
    name: "Lucid Software",
    entityType: "Corporation",
    address: "10355 S Jordan Gateway, South Jordan, UT",
  },
  {
    name: "Chatbooks",
    entityType: "LLC",
    address: "435 N 400 E, American Fork, UT",
  },
  {
    name: "Entrata",
    entityType: "Corporation",
    address: "702 W Executive Pkwy, Lehi, UT",
  },
  {
    name: "Adobe Utah (Workfront)",
    entityType: "Corporation",
    address: "3300 N Ashton Blvd, Lehi, UT",
  },
  {
    name: "BambooHR",
    entityType: "LLC",
    address: "335 S 560 W, Lindon, UT",
  },
  {
    name: "Recursion Pharmaceuticals",
    entityType: "Corporation",
    address: "41 S Rio Grande St, Salt Lake City, UT",
  },
  {
    name: "1-800 Contacts",
    entityType: "Corporation",
    address: "261 W Data Dr, Draper, UT",
  },
  {
    name: "Xactware",
    entityType: "Corporation",
    address: "1100 W Traverse Pkwy, Lehi, UT",
  },
  {
    name: "Younique",
    entityType: "LLC",
    address: "301 N 1400 W, Lehi, UT",
  },
  {
    name: "Traeger Pellet Grills",
    entityType: "LLC",
    address: "1500 Fashion Pl, Salt Lake City, UT",
  },
  {
    name: "SkullCandy",
    entityType: "Corporation",
    address: "1441 W Ute Blvd, Park City, UT",
  },
  {
    name: "Zonos",
    entityType: "Corporation",
    address: "652 S Reunion Ave, St. George, UT",
  },
] as const;
