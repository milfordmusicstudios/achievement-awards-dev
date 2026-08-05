import { supabase } from "./supabaseClient.js";
import { getStudioRoles, requireStudioRoles } from "./utils.js";

function toIsoPlusDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function formatRoleLabel(roleHint) {
  const role = String(roleHint || "").trim().toLowerCase();
  if (!role) return "role";
  if (role === "parent" || role === "guardian" || role === "parent/guardian") return "parent/guardian";
  return role;
}

async function loadPendingInvites(studioId) {
  const container = document.getElementById("pendingInvites");
  if (!container) return;
  container.innerHTML = "";

  const { data, error } = await supabase
    .from("invites")
    .select("id, invited_email, role_hint, expires_at, token, status")
    .eq("studio_id", studioId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[InviteStaff] pending invites load failed", error);
    container.textContent = "Unable to load invites.";
    return;
  }

  if (!data || data.length === 0) {
    container.textContent = "No pending invites.";
    return;
  }

  data.forEach(invite => {
    const inviteLink = `${window.location.origin}/join.html?token=${invite.token}`;
    const row = document.createElement("div");
    row.className = "pending-invite-card";
    row.style.padding = "10px";
    row.style.background = "#fff";
    row.style.borderRadius = "12px";
    row.style.border = "1px solid rgba(11,79,138,0.18)";
    row.innerHTML = `
      <div class="pending-invite-main"><b>${invite.invited_email}</b> (${formatRoleLabel(invite.role_hint)})</div>
      <div class="pending-invite-meta" style="font-size:12px; color:#555;">Expires: ${invite.expires_at ? new Date(invite.expires_at).toLocaleString() : "n/a"}</div>
      <div class="pending-invite-link" style="font-size:12px; margin-top:6px;">
        <a href="${inviteLink}">${inviteLink}</a>
      </div>
      <div class="button-row pending-invite-actions" style="margin-top:10px;">
        <button type="button" class="blue-button copy-link-btn">Copy link</button>
        <button type="button" class="blue-button revoke-btn" style="background:#999;">Revoke</button>
      </div>
    `;
    const copyBtn = row.querySelector(".copy-link-btn");
    if (copyBtn) {
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(inviteLink);
        } catch (err) {
          console.error("[InviteStaff] copy failed", err);
        }
      });
    }
    const revokeBtn = row.querySelector(".revoke-btn");
    if (revokeBtn) {
      revokeBtn.addEventListener("click", async () => {
        const { error: revokeErr } = await supabase
          .from("invites")
          .update({ status: "revoked" })
          .eq("id", invite.id);
        if (revokeErr) {
          console.error("[InviteStaff] revoke failed", revokeErr);
          return;
        }
        console.log("[InviteStaff] revoked invite", invite.id);
        await loadPendingInvites(studioId);
      });
    }
    container.appendChild(row);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("inviteForm");
  const emailInput = document.getElementById("inviteEmail");
  const roleInput = document.getElementById("inviteRole");
  const errorEl = document.getElementById("inviteError");
  const successEl = document.getElementById("inviteSuccess");
  const linkBox = document.getElementById("inviteLinkBox");
  const linkInput = document.getElementById("inviteLinkInput");
  const copyBtn = document.getElementById("copyInviteBtn");

  const { data: authData } = await supabase.auth.getUser();
  const authUser = authData?.user || null;
  if (!authUser?.id) {
    window.location.href = "login.html";
    return;
  }

  const studioId = localStorage.getItem("activeStudioId");
  if (!studioId) {
    window.location.href = "index.html";
    return;
  }

  console.log("[InviteStaff] studio id", studioId);

  const isStudioSettingsHub = window.location.pathname.endsWith("/studio-settings-hub.html");
  const authz = isStudioSettingsHub
    ? {
        roles: await getStudioRoles(authUser.id, studioId),
        studioId
      }
    : await requireStudioRoles(["admin"]);
  authz.ok = authz.roles.includes("admin");
  console.log("[AuthZ]", { page: "invite-staff", requiredRoles: ["admin"], roles: authz.roles, studioId: authz.studioId });
  if (!authz.ok) {
    if (isStudioSettingsHub) {
      document.querySelector(".manage-users-invite")?.remove();
      return;
    }
    return;
  }

  await loadPendingInvites(studioId);

  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      if (!linkInput?.value) return;
      try {
        await navigator.clipboard.writeText(linkInput.value);
        if (successEl) {
          successEl.textContent = "Invite link copied.";
          successEl.style.display = "block";
        }
      } catch (err) {
        console.error("[InviteStaff] copy failed", err);
      }
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!emailInput || !roleInput) return;

      const email = normalizeEmail(emailInput.value);
      const role = roleInput.value;
      if (!email || !role) return;

      if (errorEl) errorEl.style.display = "none";
      if (successEl) successEl.style.display = "none";

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token || "";
      if (!accessToken) {
        if (errorEl) {
          errorEl.textContent = "Please sign in again before sending an invite.";
          errorEl.style.display = "block";
        }
        return;
      }

      const response = await fetch("/api/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          email,
          studio_id: studioId,
          role_hint: role,
          created_by: authUser.id
        })
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch {}

      if (!response.ok) {
        const message = payload?.error || "Failed to send invite.";
        console.error("[InviteStaff] invite failed", message);
        if (errorEl) {
          errorEl.textContent = message;
          errorEl.style.display = "block";
        }
        return;
      }

      console.log("[InviteStaff] server token", payload?.token);
      if (successEl) {
        successEl.textContent = "Invite email sent.";
        successEl.style.display = "block";
      }

      emailInput.value = "";
      roleInput.value = "";

      if (linkBox) linkBox.style.display = "block";
      if (linkInput && payload?.token) {
        linkInput.value = payload.invite_link || `${window.location.origin}/join.html?token=${payload.token}`;
      }

      await loadPendingInvites(studioId);
    });
  }
});
