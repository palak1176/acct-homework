import { Resend } from "resend";

let resendClient: Resend | undefined;

function getClient() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!resendClient) resendClient = new Resend(key);
  return resendClient;
}

export async function sendEmail(opts: { to: string | string[]; subject: string; html: string }) {
  const client = getClient();
  const from = process.env.FROM_EMAIL;

  if (!client || !from) {
    console.warn("[EMAIL] RESEND_API_KEY or FROM_EMAIL not set, skipping send:", opts.subject);
    return;
  }

  const { error } = await client.emails.send({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });

  if (error) {
    console.error("[EMAIL] Resend send failed:", error);
  }
}
