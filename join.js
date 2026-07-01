import { supabase } from "./supabaseClient.js";
import { finalizePostAuth } from "./studio-routing.js";

console.log("[Join] join.js loaded");

function qs(id) {
  return document.getElementById(id);
}

function setText(el, text) {
  if (!el) return;
  el.textContent = text;
}

function showError(message) {
  const errorEl = qs("inviteError");
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.style.display = "block";
  setInviteStatusState("error");
}

function clearError() {
  const errorEl = qs("inviteError");
  if (!errorEl) return;
  errorEl.textContent = "";
  errorEl.style.display = "none";
  setInviteStatusState("");
}

function setInviteStatusState(state) {
  const statusEl = qs("inviteStatus");
  if (!statusEl) return;
  statusEl.classList.toggle("is-success", state === "success");
  statusEl.classList.toggle("is-error", state === "error");
}

function setAuthButtonsEnabled(enabled) {
  const authPanels = qs("authPanels");
  if (authPanels) authPanels.style.display = enabled ? "" : "none";
}

function clearPendingInvite() {
  localStorage.removeItem("pendingInviteToken");
  localStorage.removeItem("pendingInviteStudioId");
  localStorage.removeItem("pendingInviteEmail");
  localStorage.removeItem("pendingInviteRoleHint");
}

function setValidateVisible(visible) {
  const row = qs("validateRow");
  if (row) row.style.display = visible ? "" : "none";
}

function updateInviteHeading(studioName) {
  const heading = qs("inviteWelcome");
  if (!heading) return;
  heading.textContent = studioName ? `Welcome to ${studioName}` : "Welcome to this studio";
  const studioNameEl = qs("studioNameDisplay");
  if (studioNameEl) {
    studioNameEl.textContent = studioName || "Music Amplified";
  }
}

function setInvitePrompt(text) {
  const prompt = qs("invitePrompt");
  if (prompt) prompt.textContent = text;
}

async function validateInvite(token) {
  clearError();
  setAuthButtonsEnabled(false);
  setValidateVisible(false);

  const statusEl = qs("inviteStatus");
  const detailsEl = qs("inviteDetails");
  setInviteStatusState("");
  setText(statusEl, "Validating...");
  setText(detailsEl, "");

  if (!token) {
    setText(statusEl, "Paste an invite token to continue.");
    setValidateVisible(true);
    return;
  }
  console.log("[Join] validating token", token);

  const { data, error } = await supabase.rpc("inspect_invite_token", { p_token: token });
  const invite = Array.isArray(data) ? data[0] : data;

  if (error || !invite || !invite.valid) {
    const status = String(invite?.status || "").toLowerCase();
    const message =
      status === "expired" ? "This invite has expired." :
      status === "revoked" ? "This invite has been revoked." :
      status === "used" || status === "accepted" ? "This invite has already been used." :
      status === "not_found" ? "We could not find an invite for this token." :
      error?.message || invite?.error || "We could not validate this invite.";
    setText(statusEl, "Invite is not active.");
    showError(message);
    clearPendingInvite();
    setValidateVisible(true);
    return;
  }

  if (!invite.studio_id || !invite.role_hint) {
    setText(statusEl, "Invite is missing studio or role details.");
    showError("This invite is incomplete.");
    clearPendingInvite();
    setValidateVisible(true);
    return;
  }

  localStorage.setItem("pendingInviteToken", token);
  localStorage.setItem("pendingInviteStudioId", invite.studio_id);
  if (invite.invited_email) {
    localStorage.setItem("pendingInviteEmail", invite.invited_email);
  }
  if (invite.role_hint) {
    localStorage.setItem("pendingInviteRoleHint", invite.role_hint);
  }

  let studioName = "";
  if (invite.studio_name) {
    studioName = invite.studio_slug ? `${invite.studio_name} (${invite.studio_slug})` : invite.studio_name;
  }

  setText(statusEl, "Invite validated.");
  setInviteStatusState("success");
  if (studioName) {
    setText(detailsEl, `You are invited to ${studioName}.`);
  }
  updateInviteHeading(studioName);
  setInvitePrompt("You have been invited to join this studio. Please log in or create an account below.");
  setAuthButtonsEnabled(true);
}

document.addEventListener("DOMContentLoaded", async () => {
  const tokenInput = qs("inviteToken");
  const urlToken = new URLSearchParams(window.location.search).get("token");
  const manualTokenGroup = qs("manualTokenGroup");
  if (tokenInput && urlToken) {
    tokenInput.value = urlToken;
    if (manualTokenGroup) manualTokenGroup.classList.add("is-hidden");
    await validateInvite(urlToken);
  } else {
    if (manualTokenGroup) manualTokenGroup.classList.remove("is-hidden");
    setValidateVisible(true);
  }

  const validateBtn = qs("validateInviteBtn");
  if (validateBtn) {
    validateBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      const token = (tokenInput?.value || "").trim();
      await validateInvite(token);
    });
  }

  const loginForm = qs("loginFormInline");
  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = (qs("loginEmailInline")?.value || "").trim().toLowerCase();
      const password = qs("loginPasswordInline")?.value || "";
      const errorEl = qs("loginErrorInline");
      const successEl = qs("loginSuccessInline");
      if (errorEl) errorEl.style.display = "none";
      if (successEl) successEl.style.display = "none";
      if (!email || !password) {
        if (errorEl) {
          errorEl.textContent = "Email and password are required.";
          errorEl.style.display = "block";
        }
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (errorEl) {
          errorEl.textContent = error.message || "Login failed.";
          errorEl.style.display = "block";
        }
        return;
      }
      if (successEl) {
        successEl.textContent = "Logged in. Finishing setup...";
        successEl.style.display = "block";
      }
      await finalizePostAuth();
    });
  }

  const signupForm = qs("signupFormInline");
  if (signupForm) {
    signupForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = (qs("signupEmailInline")?.value || "").trim().toLowerCase();
      const password = qs("signupPasswordInline")?.value || "";
      const errorEl = qs("signupErrorInline");
      const successEl = qs("signupSuccessInline");
      if (errorEl) errorEl.style.display = "none";
      if (successEl) successEl.style.display = "none";
      if (!email || !password) {
        if (errorEl) {
          errorEl.textContent = "Email and password are required.";
          errorEl.style.display = "block";
        }
        return;
      }
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth-callback.html`,
        },
      });
      if (error) {
        if (errorEl) {
          errorEl.textContent = error.message || "Signup failed.";
          errorEl.style.display = "block";
        }
        return;
      }
      if (successEl) {
        successEl.textContent = "Check your email to confirm your account. After confirming, you'll be joined automatically.";
        successEl.style.display = "block";
      }
    });
  }

  const backBtn = qs("backBtn");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      window.location.href = "welcome.html";
    });
  }
});
