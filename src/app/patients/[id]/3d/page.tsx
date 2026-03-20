import { redirect } from "next/navigation";

interface Patient3DPageProps {
  params: Promise<{ id: string }>;
}

export default async function Patient3DPage({ params }: Patient3DPageProps) {
  const { id } = await params;

  const authorizeBaseUrl =
    process.env.CRISALIX_OAUTH_AUTHORIZE_URL ??
    "https://sso-staging.crisalix.com/auth/authorize";
  const clientId = process.env.CRISALIX_CLIENT_ID;
  const redirectUri = process.env.CRISALIX_REDIRECT_URI;
  const scope = process.env.CRISALIX_SCOPE;

  if (!clientId || !redirectUri) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900 shadow-sm">
        <p className="font-semibold">Crisalix 3D integration is not configured.</p>
        <p className="mt-2 text-xs">
          Please set <code>CRISALIX_CLIENT_ID</code> and <code>CRISALIX_REDIRECT_URI</code> environment
          variables to enable the 3D editor integration.
        </p>
      </div>
    );
  }

  const state = id;

  const url = new URL(authorizeBaseUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  if (scope) {
    url.searchParams.set("scope", scope);
  }

  console.log("[Crisalix OAuth] Redirecting to authorization:", {
    url: url.toString(),
    patientId: id,
    redirectUri,
    scope,
  });

  redirect(url.toString());
}
