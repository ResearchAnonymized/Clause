import { getAdminDb } from "@/db/client.server";

/** Service / server-side DB client (replaces Supabase service-role client). */
export const supabaseAdmin = new Proxy({} as ReturnType<typeof getAdminDb>, {
  get(_, prop, receiver) {
    return Reflect.get(getAdminDb(), prop, receiver);
  },
});
