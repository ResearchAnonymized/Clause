export const PRODUCT_TOUR_STEPS = [
  { id: "dashboard", path: "/dashboard" },
  { id: "newAnalysis", path: "/runs/new" },
  { id: "analyses", path: "/runs" },
  { id: "criteria", path: "/criteria" },
  { id: "agents", path: "/agents" },
  { id: "settings", path: "/settings" },
  { id: "help", path: "/settings/help" },
] as const;

export type ProductTourStepId = (typeof PRODUCT_TOUR_STEPS)[number]["id"];
export type ProductTourStep = (typeof PRODUCT_TOUR_STEPS)[number];
