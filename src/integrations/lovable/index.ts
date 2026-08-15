/**
 * Lovable OAuth bridge removed. Google sign-in can be re-added with a local OIDC provider later.
 */
export const lovable = {
  auth: {
    async signInWithOAuth(_provider: string, _opts?: { redirect_uri?: string }) {
      return {
        error: {
          message: "Google sign-in is not configured in the local stack. Use email and password.",
        },
      };
    },
  },
};
