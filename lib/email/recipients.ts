/**
 * Who a document email goes to. Sending one always copies the person sending
 * it. A test goes to that person and to nobody else: the agent and the CCs are
 * dropped, whatever the form says, so checking an offer or settlement can
 * never reach anyone outside.
 */

const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The assistant is who it's addressed to, with the agent copied. With no
 * assistant, it's the agent. Anyone in `alsoCopy` is copied either way.
 */
export function agentRecipients(
  agentEmail: string | null | undefined,
  assistantEmail: string | null | undefined,
  alsoCopy: Array<string | null | undefined> = [],
): { to: string; cc: string } {
  const agent = String(agentEmail || "").trim();
  const assistant = String(assistantEmail || "").trim();
  const to = assistant || agent;
  const cc: string[] = [];
  for (const raw of [assistant ? agent : "", ...alsoCopy]) {
    const email = String(raw || "").trim();
    if (email && !same(email, to) && !cc.some((e) => same(e, email))) cc.push(email);
  }
  return { to, cc: cc.join(", ") };
}

export type RecipientInput = {
  to?: unknown;
  cc?: unknown;
  subject?: unknown;
  test?: unknown;
};

export type Recipients =
  | { ok: true; test: boolean; to: string; cc: string[]; subject: string }
  | { ok: false; error: string };

export function resolveRecipients(body: RecipientInput, senderEmail: string | null | undefined): Recipients {
  const subject = String(body.subject || "").trim();
  if (!subject) return { ok: false, error: "Add a subject." };

  if (body.test) {
    if (!senderEmail) return { ok: false, error: "Your account has no email address to send a test to." };
    return { ok: true, test: true, to: senderEmail, cc: [], subject: `[TEST] ${subject}` };
  }

  const to = String(body.to || "").trim();
  if (!EMAIL.test(to)) return { ok: false, error: "The agent's email address isn't valid." };
  const cc = (Array.isArray(body.cc) ? body.cc : []).map((e) => String(e).trim()).filter(Boolean);
  const badCc = cc.find((e) => !EMAIL.test(e));
  if (badCc) return { ok: false, error: `"${badCc}" isn't a valid email address.` };
  if (senderEmail && !same(senderEmail, to) && !cc.some((e) => same(e, senderEmail))) cc.push(senderEmail);
  if (cc.length > 10) return { ok: false, error: "Ten CCs at most." };

  return { ok: true, test: false, to, cc, subject };
}
