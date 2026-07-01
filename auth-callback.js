import { supabase } from "./supabaseClient.js";

const statusEl = document.getElementById("authCallbackStatus");
const detailsEl = document.getElementById("authCallbackDetails");
const errorEl = document.getElementById("authCallbackError");
const actionsEl = document.getElementById("authCallbackActions");

function setText(el, text) {
  if (el) el.textContent = text || "";
}

function showStatus(message, details = "") {
  setText(statusEl, message);
  setText(detailsEl, details);
  if (errorEl) {
    errorEl.textContent = "";
    errorEl.style.display = "none";
  }
  if (actionsEl) actionsEl.style.display = "none";
}

function showError(message, details = "") {
  console.warn("[AuthCallback] invite error:", message, details);
  setText(statusEl, "Invite could not be opened.");
  setText(detailsEl, details);
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = "block";
  }
  if (actionsEl) actionsEl.style.display = "flex";
}

function getInviteToken() {
  const token = (new URLSearchParams(location.search).get("token") || "").trim();
  console.log("[AuthCallback] token present:", Boolean(token), "length:", token.length);
  return token;
}

function hasSupabaseAuthParams() {
  const search = new URLSearchParams(location.search);
  const hash = new URLSearchParams((location.hash || "").replace(/^#/, ""));
  return Boolean(
    search.get("code") ||
    hash.get("access_token") ||
    hash.get("refresh_token")
  );
}

function inviteErrorMessage(inviteStatus) {
  const status = String(inviteStatus?.status || "").toLowerCase();
  const valid = Boolean(inviteStatus?.valid);

  if (valid) return "";
  if (!status || status === "not_found") return "This invite token was not found.";
  if (status === "expired") return "This invite has expired.";
  if (status === "revoked") return "This invite has been revoked.";
  if (status === "used" || status === "accepted") return "This invite has already been used.";
  return `This invite is not active (${status}).`;
}

async function validateInviteToken(token) {
  const { data, error } = await supabase.rpc("inspect_invite_token", { p_token: token });
  const row = Array.isArray(data) ? data[0] : data;
  console.log("[AuthCallback] inspect_invite_token result:", { row, error });

  if (error) {
    return {
      valid: false,
      status: "lookup_failed",
      error: error.message || "Invite lookup failed"
    };
  }

  if (!row) {
    return {
      valid: false,
      status: "not_found",
      error: "Invite token was not found"
    };
  }

  return row;
}

(async function () {
  try {
    const token = getInviteToken();
    const authParamsPresent = hasSupabaseAuthParams();

    if (!token) {
      showError(
        "Missing invite token.",
        "The callback URL did not include token=... . Ask the studio admin to send a new invite link."
      );
      return;
    }

    localStorage.setItem("pendingInviteToken", token);
    showStatus("Validating invite...", "Checking this token against the production invites table.");

    const inviteStatus = await validateInviteToken(token);
    if (!inviteStatus?.valid) {
      showError(inviteErrorMessage(inviteStatus), inviteStatus?.error || "The invite is not pending.");
      return;
    }

    showStatus("Invite is valid.", "Completing sign-in...");

    if (authParamsPresent && typeof supabase.auth.exchangeCodeForSession === "function") {
      const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
      if (error) {
        console.error("[AuthCallback] exchangeCodeForSession error:", error);
        showError("Sign-in callback failed.", error.message || "Supabase could not create a session from this callback.");
        return;
      }
    }

    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr) {
      console.error("[AuthCallback] getSession error:", sessionErr);
      showError("Could not read the sign-in session.", sessionErr.message || "Please try the invite link again.");
      return;
    }

    if (sessionData?.session?.user) {
      const target = `./finish-setup.html?token=${encodeURIComponent(token)}`;
      console.log("[AuthCallback] token valid, session exists, redirect target:", target);
      window.location.replace(target);
      return;
    }

    console.log("[AuthCallback] token valid but no Supabase session; redirecting to join page");
    window.location.replace(`./join.html?token=${encodeURIComponent(token)}`);
  } catch (e) {
    console.error("[AuthCallback] fatal:", e);
    showError("Invite callback failed.", e?.message || "Unexpected callback error.");
  }
})();
