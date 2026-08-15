import { describe, expect, it } from "vitest";
import { buildMultiBidderMatrix } from "./multi-bidder-matrix";

describe("buildMultiBidderMatrix", () => {
  it("aligns near-duplicate topics across offers", () => {
    const matrix = buildMultiBidderMatrix([
      {
        runId: "a",
        pairs: [
          {
            id: "1",
            topic: "Service levels",
            customer_excerpt: "99.9%",
            supplier_excerpt: "99.5%",
            note: "diff",
            derived_status: "partial",
          },
          {
            id: "2",
            topic: "Notice period",
            customer_excerpt: "12 months",
            supplier_excerpt: "18 months",
            note: null,
            derived_status: "deviates",
          },
        ],
      },
      {
        runId: "b",
        pairs: [
          {
            id: "3",
            topic: "Service level agreement",
            customer_excerpt: "99.9%",
            supplier_excerpt: "99.9%",
            note: "ok",
            derived_status: "comply",
          },
        ],
      },
    ]);

    const sla = matrix.find((r) => /service/i.test(r.topic));
    expect(sla).toBeTruthy();
    expect(sla!.cells[0]?.status).toBe("partial");
    expect(sla!.cells[1]?.status).toBe("comply");

    const notice = matrix.find((r) => /notice/i.test(r.topic));
    expect(notice!.cells[0]?.status).toBe("deviates");
    expect(notice!.cells[1]).toBeNull();
  });
});
