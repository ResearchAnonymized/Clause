export const SAMPLE_PACK_FILES = {
  tender: [
    { path: "/samples/tender-invitation.txt", name: "01-Invitation-to-Tender.txt" },
    { path: "/samples/tender-sla-dpa.txt", name: "02-SLA-and-DPA-requirements.txt" },
  ],
  bidder: [
    { path: "/samples/bidder-offer.txt", name: "01-Bidder-technical-offer.txt" },
    { path: "/samples/bidder-dpa.txt", name: "02-Bidder-DPA.txt" },
  ],
} as const;

async function fetchAsFile(path: string, name: string): Promise<File> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not load sample ${name}`);
  const blob = await res.blob();
  return new File([blob], name, { type: "text/plain" });
}

export async function loadSamplePacks(): Promise<{ tender: File[]; bidder: File[] }> {
  const [tender, bidder] = await Promise.all([
    Promise.all(SAMPLE_PACK_FILES.tender.map((f) => fetchAsFile(f.path, f.name))),
    Promise.all(SAMPLE_PACK_FILES.bidder.map((f) => fetchAsFile(f.path, f.name))),
  ]);
  return { tender, bidder };
}
