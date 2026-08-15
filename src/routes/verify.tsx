import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldAlert, Upload } from "lucide-react";
import { verifyDecisionHash } from "@/lib/verify-decision.functions";

export const Route = createFileRoute("/verify")({
  head: () => ({
    meta: [
      { title: "Verify signed decision — Clause" },
      { name: "description", content: "Verify the authenticity of a Clause signed decision by comparing the document fingerprint." },
      { property: "og:title", content: "Verify signed decision — Clause" },
      { property: "og:description", content: "Confirm that a Clause audit report has not been altered since it was signed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VerifyPage,
});

async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256File(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Result =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "match"; decision: { verdict: string; signed_at: string | null; signer_role: string | null; signer_name: string | null } }
  | { kind: "nomatch" }
  | { kind: "error"; message: string };

function VerifyPage() {
  const [hash, setHash] = useState("");
  const [result, setResult] = useState<Result>({ kind: "idle" });

  const submit = async () => {
    const clean = hash.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(clean)) {
      setResult({ kind: "error", message: "Enter a valid 64-character SHA-256 hex hash." });
      return;
    }
    setResult({ kind: "loading" });
    try {
      const res = await verifyDecisionHash({ data: { hash: clean } });
      if (res.matched) setResult({ kind: "match", decision: res.decision! });
      else setResult({ kind: "nomatch" });
    } catch (e: any) {
      setResult({ kind: "error", message: e?.message ?? "Verification failed" });
    }
  };

  const onFile = async (file: File) => {
    setHash(await sha256File(file));
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="mb-8 flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-semibold">Verify signed decision</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-8">
          Paste the SHA-256 fingerprint printed on a Clause audit report, or upload the source contract to
          compute the fingerprint locally. Your file never leaves the browser.
        </p>

        <Card>
          <CardHeader><CardTitle className="text-base">Fingerprint</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="hash">SHA-256 hash</Label>
              <Input id="hash" placeholder="e.g. 3a7bd3e2360a…" value={hash} onChange={(e) => setHash(e.target.value)} className="font-mono text-xs mt-1" />
            </div>
            <div className="flex items-center gap-2">
              <input id="file" type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
              <label htmlFor="file">
                <Button asChild variant="outline" size="sm"><span><Upload className="h-4 w-4 mr-2" />Hash a file locally</span></Button>
              </label>
              <Button onClick={submit} disabled={!hash || result.kind === "loading"}>Verify</Button>
            </div>
          </CardContent>
        </Card>

        {result.kind === "match" && (
          <Card className="mt-6 border-ok/40 bg-ok/5">
            <CardContent className="pt-6 flex items-start gap-3">
              <ShieldCheck className="h-6 w-6 text-ok mt-0.5" />
              <div className="space-y-1">
                <div className="font-medium text-ok">Fingerprint matches a signed decision.</div>
                <div className="text-sm text-muted-foreground">
                  Verdict: <Badge variant="outline">{result.decision.verdict}</Badge>
                  {result.decision.signed_at && <> · Signed {new Date(result.decision.signed_at).toLocaleString()}</>}
                  {result.decision.signer_role && <> · Role: {result.decision.signer_role}</>}
                </div>
                <div className="text-xs text-muted-foreground pt-1">The audited document has not been altered since signing.</div>
              </div>
            </CardContent>
          </Card>
        )}
        {result.kind === "nomatch" && (
          <Card className="mt-6 border-critical/40 bg-critical/5">
            <CardContent className="pt-6 flex items-start gap-3">
              <ShieldAlert className="h-6 w-6 text-critical mt-0.5" />
              <div>
                <div className="font-medium text-critical">No signed decision matches this fingerprint.</div>
                <div className="text-sm text-muted-foreground mt-1">
                  Either the document was altered after signing, or it was never signed through Clause.
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        {result.kind === "error" && (
          <p className="mt-6 text-sm text-critical">{result.message}</p>
        )}
      </div>
    </div>
  );
}
