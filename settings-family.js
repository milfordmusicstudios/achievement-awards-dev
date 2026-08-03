import { supabase } from "./supabaseClient.js";
import { getAuthUserId, getViewerContext } from "./utils.js";
import { clearActiveProfileId, getActiveProfileId, setActiveProfileId } from "./active-profile.js";
import { applyTeacherOptionsToSelect, loadTeachersForStudio, normalizeTextArray, refreshTeacherMultiSelect, showToast } from "./settings-shared.js";
import { getAccountProfiles, renderAccountProfileList, hasRole } from "./account-profiles.js";
import { hasFamilyAccess, isAccountHolder, isSelfManagedStudent } from "./permissions.js";

let authViewerId = null;
let activeStudioId = null;
let teacherOptions = [];
let addStudentOpen = false;
let viewerContextData = null;
let familyProfiles = [];
let canManageFamilyMembers = false;

function persistSelectedProfile(profileId) {
  if (!profileId) return;
  const normalizedId = String(profileId);
  setActiveProfileId(normalizedId);
  localStorage.setItem("aa.activeStudentId", normalizedId);
  if (activeStudioId && authViewerId) {
    localStorage.setItem(`aa.activeStudent.${activeStudioId}.${authViewerId}`, normalizedId);
  }
}

function clearProfileRenderCache() {
  [
    "loggedInUser",
    "allUsers",
    "activeStudioRoles"
  ].forEach((key) => localStorage.removeItem(key));
}

function switchToProfile(profileId) {
  if (!profileId) return;
  persistSelectedProfile(profileId);
  clearProfileRenderCache();
  window.location.reload();
}

function setAddStudentError(message) {
  const errorEl = document.getElementById("addStudentError");
  if (!errorEl) return;
  errorEl.textContent = message || "";
  errorEl.style.display = message ? "block" : "none";
}

function setAddStudentTeacherError(message) {
  const errorEl = document.getElementById("addStudentTeacherError");
  if (!errorEl) return;
  errorEl.textContent = message || "";
  errorEl.style.display = message ? "block" : "none";
}

function openAddStudentModal() {
  const overlay = document.getElementById("addStudentModal");
  const firstName = document.getElementById("addStudentFirstName");
  const lastName = document.getElementById("addStudentLastName");
  const instrument = document.getElementById("addStudentInstrument");
  const teacherSelect = document.getElementById("addStudentTeachers");
  if (!overlay || !teacherSelect) return;

  setAddStudentError("");
  setAddStudentTeacherError("");
  if (firstName) firstName.value = "";
  if (lastName) lastName.value = "";
  if (instrument) instrument.value = "";

  applyTeacherOptionsToSelect(teacherSelect, teacherOptions);
  Array.from(teacherSelect.options || []).forEach(option => {
    option.selected = false;
  });
  if (teacherSelect._teacherPillPicker) {
    teacherSelect._teacherPillPicker.dataset.open = "false";
  }
  refreshTeacherMultiSelect(teacherSelect);

  overlay.classList.add("is-open");
  addStudentOpen = true;
  setTimeout(() => firstName?.focus(), 0);
}

function closeAddStudentModal() {
  const overlay = document.getElementById("addStudentModal");
  if (overlay) overlay.classList.remove("is-open");
  addStudentOpen = false;
}

async function handleAddStudent() {
  const firstName = (document.getElementById("addStudentFirstName")?.value || "").trim();
  const lastName = (document.getElementById("addStudentLastName")?.value || "").trim();
  const instrumentRaw = (document.getElementById("addStudentInstrument")?.value || "").trim();
  const teacherSelect = document.getElementById("addStudentTeachers");

  if (!firstName || !lastName) {
    setAddStudentError("Please enter first and last name.");
    return;
  }

  const teacherIds = Array.from(teacherSelect?.selectedOptions || []).map(o => o.value);
  if (teacherOptions.length > 0 && teacherIds.length === 0) {
    setAddStudentTeacherError("Please select at least one teacher.");
    return;
  }

  const { error } = await supabase.rpc("create_family_student", {
    p_studio_id: activeStudioId,
    p_first_name: firstName,
    p_last_name: lastName,
    p_instrument: normalizeTextArray(instrumentRaw),
    p_teacher_ids: teacherIds
  });
  if (error) {
    console.error("[Family] add student failed", error);
    setAddStudentError(error.message || "Failed to add student.");
    return;
  }

  showToast("Student added.");
  closeAddStudentModal();
  await renderFamilyProfiles();
}

async function renderFamilyProfiles() {
  const list = document.getElementById("linkedStudentsList");
  const addMessage = document.getElementById("familyAddMessage");
  if (!list) return;
  if (addMessage) addMessage.textContent = "";
  list.innerHTML = "<p class=\"empty-state\">Loading users...</p>";

  const profiles = await getAccountProfiles(viewerContextData, { includeInactive: true });
  familyProfiles = profiles;
  if (!profiles.length) {
    list.innerHTML = "";
    if (addMessage) addMessage.textContent = "No users linked to this account yet.";
    return;
  }

  list.innerHTML = "";
  renderAccountProfileList(list, profiles, {
    activeProfileId: getActiveProfileId(),
    renderItem: createFamilyRow,
    emptyState: ""
  });

  const studentProfiles = profiles.filter(profile => hasRole(profile, "student"));
  if (addMessage) {
    addMessage.textContent = studentProfiles.length ? "" : "No students linked to this account yet.";
  }

  attachFamilyRowHandlers();
}

function createFamilyRow(profile, ctx) {
  const isStudent = hasRole(profile, "student");
  const isInactive = Boolean(profile.deactivated_at);
  const isAccountHolderProfile = String(profile?.id || "") === String(authViewerId || "");
  const row = document.createElement("div");
  const classNames = ["family-student-row"];
  if (isInactive) classNames.push("is-inactive");
  if (ctx.isActive) classNames.push("is-current");
  row.className = classNames.join(" ");
  row.dataset.profileId = profile.id;

  const avatar = document.createElement("div");
  avatar.className = "family-student-avatar";
  avatar.setAttribute("role", "button");
  avatar.setAttribute("tabindex", "0");
  avatar.dataset.id = profile.id;
  const image = document.createElement("img");
  image.src = profile.avatarUrl || "images/icons/default.png";
  image.alt = profile.label;
  avatar.appendChild(image);
  const hint = document.createElement("span");
  hint.className = "family-avatar-hint";
  hint.textContent = "Click to replace avatar";
  avatar.appendChild(hint);

  const info = document.createElement("div");
  info.className = "family-student-info";
  info.innerHTML = `
    <div class="family-student-name">${profile.label}</div>
    <div class="family-student-actions"></div>
  `;

  row.appendChild(avatar);
  row.appendChild(info);

  // Allow avatar replacement for every profile shown in Family settings.
  const input = document.createElement("input");
  input.className = "student-avatar-input";
  input.dataset.id = profile.id;
  input.type = "file";
  input.accept = "image/*";
  input.style.display = "none";
  row.appendChild(input);

  if (canManageFamilyMembers && !isAccountHolderProfile) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = `status-toggle${isInactive ? " is-inactive" : ""}`;
    toggle.dataset.action = "toggle-active";
    toggle.dataset.id = profile.id;
    toggle.setAttribute("aria-pressed", (!isInactive).toString());
    toggle.innerHTML = "<span>Active</span><span>Inactive</span>";
    row.appendChild(toggle);
  } else if (canManageFamilyMembers && isAccountHolderProfile) {
    const holderStatus = document.createElement("div");
    holderStatus.className = "family-holder-status";

    const disabledToggle = document.createElement("div");
    disabledToggle.className = "status-toggle status-toggle-disabled";
    disabledToggle.setAttribute("aria-hidden", "true");
    disabledToggle.innerHTML = "<span>Active</span><span>Inactive</span>";

    const helper = document.createElement("div");
    helper.className = "family-holder-status-note";
    helper.textContent = "Account holder cannot be inactive";

    holderStatus.appendChild(disabledToggle);
    holderStatus.appendChild(helper);
    row.appendChild(holderStatus);
  }

  return row;
}

function attachFamilyRowHandlers() {
  const list = document.getElementById("linkedStudentsList");
  if (!list) return;

  list.querySelectorAll("button[data-action=\"toggle-active\"]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const profileId = btn.dataset.id;
      if (!profileId) return;
      const target = familyProfiles.find(profile => String(profile.id) === String(profileId));
      if (!target) return;

      const wasActive = !target.deactivated_at;
      const { error } = await supabase.rpc("set_family_student_active", {
        p_student_id: profileId,
        p_studio_id: activeStudioId,
        p_active: !wasActive
      });
      if (error) {
        console.error("[Family] failed to update student status", error);
        showToast("Failed to update student status.");
        return;
      }
      const studentId = profileId;
      if (wasActive && String(studentId) === String(getActiveProfileId())) {
        const nextActive = familyProfiles.find(p => hasRole(p, "student") && !p.deactivated_at && String(p.id) !== String(studentId));
        if (nextActive) {
          persistSelectedProfile(nextActive.id);
        } else {
          clearActiveProfileId();
          localStorage.removeItem("aa.activeStudentId");
          if (activeStudioId && authViewerId) {
            localStorage.removeItem(`aa.activeStudent.${activeStudioId}.${authViewerId}`);
          }
        }
        clearProfileRenderCache();
        window.location.reload();
        return;
      }
      await renderFamilyProfiles();
    });
  });

  list.querySelectorAll(".family-student-avatar").forEach(avatar => {
    const input = list.querySelector(`input.student-avatar-input[data-id="${avatar.dataset.id}"]`);
    const triggerUpload = (e) => {
      e.stopPropagation();
      if (!input) return;
      input.click();
    };
    avatar.addEventListener("click", triggerUpload);
    avatar.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        triggerUpload(e);
      }
    });
  });

  list.querySelectorAll("input.student-avatar-input").forEach(input => {
    input.addEventListener("change", async () => {
      const studentId = input.dataset.id;
      const file = input.files?.[0];
      if (!file || !studentId) return;

      console.debug("[Family][Avatar] avatar selected", {
        studentId,
        studioId: activeStudioId,
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type
      });

      try {
        const bucketName = "avatars";
        const sourceExtension = String(file.name || "").includes(".")
          ? String(file.name).split(".").pop()
          : "png";
        const extension = String(sourceExtension || "png").replace(/[^a-zA-Z0-9_-]/g, "") || "png";
        const filePath = `${studentId}/avatar-${Date.now()}.${extension}`;
        const { error: upErr } = await supabase
          .storage
          .from(bucketName)
          .upload(filePath, file, { upsert: true, contentType: file.type });
        if (upErr) throw upErr;

        const { data: pub } = supabase
          .storage
          .from(bucketName)
          .getPublicUrl(filePath);
        const publicUrl = pub?.publicUrl;
        if (!publicUrl) throw new Error("Failed to generate public avatar URL");

        const updatePayload = { avatarUrl: publicUrl };
        console.debug("[Family][Avatar] update payload created", updatePayload);
        console.debug("[Family][Avatar] Supabase update started", {
          studentId,
          studioId: activeStudioId,
          payload: updatePayload
        });

        const { error: dbErr } = await supabase
          .from("users")
          .update(updatePayload)
          .eq("id", studentId)
          .eq("studio_id", activeStudioId);
        if (dbErr) throw dbErr;

        const targetProfile = familyProfiles.find(profile => String(profile.id) === String(studentId));
        if (targetProfile) {
          targetProfile.avatarUrl = publicUrl;
        }

        const img = input.closest(".family-student-row")?.querySelector("img");
        if (img) img.src = publicUrl;
        console.debug("[Family][Avatar] Supabase response received", {
          studentId,
          studioId: activeStudioId,
          publicUrl
        });
        showToast("Avatar updated.");
      } catch (err) {
        console.error("[Family] avatar upload failed", err);
        showToast("Avatar upload failed.");
      } finally {
        input.value = "";
      }
    });
  });

  list.querySelectorAll(".family-student-row").forEach(row => {
    row.addEventListener("click", (e) => {
      if (e.target.closest("button") || e.target.closest("input")) return;
      const profileId = row.dataset.profileId;
      if (!profileId) return;
      const profile = familyProfiles.find(p => String(p.id) === String(profileId));
      if (!profile || profile.deactivated_at) return;
      switchToProfile(profileId);
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  authViewerId = await getAuthUserId();
  if (!authViewerId) {
    window.location.replace("./login.html");
    return;
  }

  viewerContextData = await getViewerContext();
  activeStudioId = viewerContextData?.studioId || localStorage.getItem("activeStudioId");
  const [holder, familyAccess, selfManagedStudent] = await Promise.all([
    isAccountHolder(activeStudioId),
    hasFamilyAccess(activeStudioId),
    isSelfManagedStudent(activeStudioId)
  ]);
  const accountIsParent = Boolean(viewerContextData?.accountIsParent || viewerContextData?.isParent);
  const canViewFamily = Boolean(holder || familyAccess || accountIsParent || viewerContextData?.isStudent);
  canManageFamilyMembers = Boolean(holder || familyAccess || accountIsParent || selfManagedStudent);
  if (!canViewFamily) {
    window.location.replace("settings-security.html");
    return;
  }
  teacherOptions = await loadTeachersForStudio(activeStudioId);

  await renderFamilyProfiles();

  const addStudentBtn = document.getElementById("addStudentBtn");
  const addStudentCancel = document.getElementById("addStudentCancel");
  const addStudentSubmit = document.getElementById("addStudentSubmit");
  const addStudentOverlay = document.getElementById("addStudentModal");
  const addStudentRow = addStudentBtn?.closest(".family-add-row");
  const addMessage = document.getElementById("familyAddMessage");

  if (!canManageFamilyMembers) {
    if (addStudentRow) addStudentRow.style.display = "none";
    if (addMessage) addMessage.textContent = "";
  }

  if (addStudentBtn && canManageFamilyMembers) addStudentBtn.addEventListener("click", openAddStudentModal);
  if (addStudentCancel && canManageFamilyMembers) addStudentCancel.addEventListener("click", closeAddStudentModal);
  if (addStudentSubmit && canManageFamilyMembers) addStudentSubmit.addEventListener("click", handleAddStudent);
  if (addStudentOverlay) {
    addStudentOverlay.addEventListener("click", (e) => {
      if (e.target === addStudentOverlay && canManageFamilyMembers) closeAddStudentModal();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (!addStudentOpen || !canManageFamilyMembers) return;
    if (e.key === "Escape") closeAddStudentModal();
  });
});
