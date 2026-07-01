// Build the completion-proof receipt in two forms: a machine-readable JSON ledger and a
// human-readable Markdown summary. Both make explicit which steps were automated logistics
// vs. which graded steps the operator performed personally (credential provenance).
export function buildReceipt({ workflow, ledger, completion }) {
  const rows = ledger.entries();
  const steps = rows.map((r) => r.entry);
  const automatedLogistics = steps.filter((e) => e.kind === "step").length;
  const humanAssessments = steps.filter((e) => e.kind === "human-assessment").map((e) => ({ seq: e.seq, note: e.note, at: e.at }));
  const verified = ledger.verify().ok;
  const certId = completion ? completion.certId : null;
  const json = { course: workflow.course, seal: workflow.seal, verified, automatedLogistics, humanAssessments, certId, steps };
  const markdown = [
    `# Credential receipt — ${workflow.course}`,
    ``,
    `- Workflow seal: \`${workflow.seal}\``,
    `- Ledger verified: **${verified ? "yes" : "NO"}**`,
    `- Automated logistics steps: **${automatedLogistics}**`,
    `- Human assessment steps (performed by the operator): **${humanAssessments.length}**`,
    ...humanAssessments.map((h) => `  - seq ${h.seq}: ${h.note} (${h.at})`),
    `- Certificate: ${certId ?? "(none captured)"}`,
    ``,
    `This credential's graded work was performed by the operator. The engine automated logistics and witnessed every step; the chain above is re-verifiable.`,
  ].join("\n");
  return { json, markdown };
}
