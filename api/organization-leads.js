const { createClient } = require("@supabase/supabase-js");

const NOTIFICATION_TO = "milfordmusicstudios@gmail.com";
const SOURCE = "organization_pricing_page";
const VALID_LEAD_TYPES = new Set(["information", "demo"]);

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function parseBody(req) {
  if (!req.body) return null;
  if (typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return null;
  }
}

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeGoals(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeString(item)).filter(Boolean);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function subjectSafe(value) {
  return normalizeString(value).replace(/[\r\n]+/g, " ").slice(0, 140);
}

function validateLead(input) {
  const errors = [];
  const leadType = normalizeString(input?.lead_type);
  const email = normalizeEmail(input?.email);

  if (!normalizeString(input?.studio_name)) errors.push("Studio Name is required.");
  if (!normalizeString(input?.contact_name)) errors.push("Contact Name is required.");
  if (!email) errors.push("Email Address is required.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Enter a valid email address.");
  if (!VALID_LEAD_TYPES.has(leadType)) errors.push("Invalid lead type.");

  return { ok: errors.length === 0, errors };
}

function buildLeadRow(input) {
  const teacherCountRaw = normalizeString(input.teacher_count);
  const teacherCount = teacherCountRaw ? Number.parseInt(teacherCountRaw, 10) : null;

  return {
    studio_name: normalizeString(input.studio_name),
    contact_name: normalizeString(input.contact_name),
    email: normalizeEmail(input.email),
    phone: normalizeString(input.phone) || null,
    organization_type: normalizeString(input.organization_type) || null,
    student_count: normalizeString(input.student_count) || null,
    teacher_count: Number.isFinite(teacherCount) ? teacherCount : null,
    current_software: normalizeString(input.current_software) || null,
    goals: normalizeGoals(input.goals),
    notes: normalizeString(input.notes) || null,
    lead_type: normalizeString(input.lead_type),
    status: "new",
    source: SOURCE
  };
}

function leadSummaryHtml(lead) {
  const goals = lead.goals.length ? lead.goals.map(escapeHtml).join(", ") : "None selected";
  return `
    <h2>New Music Amplified Organization Lead</h2>
    <p><strong>Lead type:</strong> ${escapeHtml(lead.lead_type)}</p>
    <p><strong>Studio:</strong> ${escapeHtml(lead.studio_name)}</p>
    <p><strong>Contact:</strong> ${escapeHtml(lead.contact_name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(lead.email)}</p>
    <p><strong>Phone:</strong> ${escapeHtml(lead.phone || "Not provided")}</p>
    <p><strong>Organization type:</strong> ${escapeHtml(lead.organization_type || "Not provided")}</p>
    <p><strong>Student count:</strong> ${escapeHtml(lead.student_count || "Not provided")}</p>
    <p><strong>Teacher count:</strong> ${escapeHtml(lead.teacher_count ?? "Not provided")}</p>
    <p><strong>Current software:</strong> ${escapeHtml(lead.current_software || "Not provided")}</p>
    <p><strong>Goals:</strong> ${goals}</p>
    <p><strong>Notes:</strong><br>${escapeHtml(lead.notes || "None")}</p>
  `;
}

async function sendLeadNotification(lead) {
  const { RESEND_API_KEY, LEAD_NOTIFICATION_FROM } = process.env;
  if (!RESEND_API_KEY) {
    console.warn("[OrganizationLeads] RESEND_API_KEY is not configured; notification email skipped.");
    return { sent: false, reason: "missing_resend_api_key" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: LEAD_NOTIFICATION_FROM || "Music Amplified <onboarding@resend.dev>",
      to: [NOTIFICATION_TO],
      reply_to: lead.email,
      subject: `Organization ${lead.lead_type === "demo" ? "Demo" : "Information"} Lead: ${subjectSafe(lead.studio_name)}`,
      html: leadSummaryHtml(lead)
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend notification failed: ${response.status} ${body}`);
  }

  return { sent: true };
}

async function runLeadIntegrations(lead) {
  const notification = await sendLeadNotification(lead);
  // Future CRM integrations can be added here without changing the modal UI.
  return { notification };
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const body = parseBody(req);
  const validation = validateLead(body);
  if (!validation.ok) {
    return res.status(400).json({ ok: false, error: validation.errors.join(" ") });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_SCHEDULING_URL, CALENDLY_URL } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[OrganizationLeads] Missing Supabase server configuration.");
    return res.status(500).json({ ok: false, error: "Missing server configuration" });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  const lead = buildLeadRow(body);
  const { data, error } = await supabaseAdmin
    .from("organization_leads")
    .insert(lead)
    .select("id")
    .single();

  if (error) {
    console.error("[OrganizationLeads] Lead insert failed.", error, { lead });
    return res.status(500).json({ ok: false, error: error.message || "Lead insert failed" });
  }

  let integrations = null;
  try {
    integrations = await runLeadIntegrations({ ...lead, id: data.id });
  } catch (error) {
    console.error("[OrganizationLeads] Lead integration failed.", error, { leadId: data.id });
    integrations = { notification: { sent: false, reason: "notification_failed" } };
  }

  return res.status(200).json({
    ok: true,
    id: data.id,
    demo_url: lead.lead_type === "demo" ? DEMO_SCHEDULING_URL || CALENDLY_URL || "" : "",
    integrations
  });
};
