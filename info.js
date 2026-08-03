const MONTHLY = "monthly";
const ANNUAL = "annual";
const FOUNDING_PRICING_CLAIMED = 7;
const FOUNDING_PRICING_TOTAL = 25;

const PRICING_TIERS = [
  { key: "solo", name: "Solo", regularMonthly: 29, foundersMonthly: 20, students: "Up to 50 students", cta: "trial" },
  { key: "studio", name: "Studio", regularMonthly: 59, foundersMonthly: 40, students: "Up to 100 students", cta: "trial" },
  { key: "growth", name: "Growth", regularMonthly: 149, foundersMonthly: 120, students: "Up to 300 students", cta: "trial" },
  { key: "organization", name: "Organization", regularMonthly: null, foundersMonthly: null, students: "301+ students", cta: "contact" }
];

const FAQ_ITEMS = [
  { id: "faq-software", q: "Does this replace my studio software?", a: "No. Music Amplified adds motivation and visible progress to your studio without replacing your scheduling, billing, or CRM tools. No integration required." },
  { id: "faq-approvals", q: "How do approvals work?", a: "Students log their progress, and teachers approve it quickly to keep achievements meaningful. Points, levels, and badges update automatically after approval. Milestones are surfaced so nothing important gets missed." },
  { id: "faq-family", q: "How do families log in?", a: "Families can use one parent login to manage multiple students. They can switch profiles quickly and see each student's progress and milestones in one place." },
  { id: "faq-challenges", q: "Can we run studio wide challenges?", a: "Yes. You can run studio wide or individual challenges to create momentum around studio goals." },
  { id: "faq-permissions", q: "Can teachers have different permissions?", a: "Yes. Owners can set role-based permissions so approval and editing access match each teacher's responsibilities." },
  { id: "faq-cancel", q: "Can I cancel anytime?", a: "Yes. You can cancel whenever you need to." },
  { id: "faq-automation", q: "Can we automate challenges weekly/monthly?", a: "Yes. Recurring challenge rhythms can be set up around monthly or seasonal goals." }
];

function formatCurrency(value) {
  return `$${value}`;
}

function annualFoundersTotal(monthlyPrice) {
  return Math.round(monthlyPrice * 12 * 0.85);
}

function trialRoute() {
  return "signup.html";
}

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function smoothScrollTo(targetId, event) {
  if (event) event.preventDefault();
  const el = document.getElementById(targetId);
  if (!el) return;
  el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
}

function BillingToggle({ billing, onChange }) {
  const wrap = document.createElement("div");
  wrap.className = "pricing-toggle";
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", "Billing period");

  [
    { key: MONTHLY, label: "Monthly" },
    { key: ANNUAL, label: "Annual" }
  ].forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "info-btn info-btn--chip";
    button.dataset.billing = item.key;
    button.setAttribute("aria-pressed", billing === item.key ? "true" : "false");
    button.textContent = item.label;
    button.addEventListener("click", () => {
      if (item.key !== billing) onChange(item.key);
    });
    wrap.appendChild(button);
  });

  return wrap;
}

function renderPricingFace(tier, mode, onOrganizationContact) {
  const wrap = document.createElement("div");
  wrap.className = "pricing-face__content";

  const title = document.createElement("h3");
  title.textContent = tier.name;

  const featuredBadge = document.createElement("span");
  featuredBadge.className = "pricing-featured-badge";
  featuredBadge.textContent = "Most Popular";

  const details = document.createElement("p");
  details.className = "pricing-details";
  details.textContent = tier.students;

  const badge = document.createElement("span");
  badge.className = "pricing-badge";
  badge.textContent = "Founders Price";

  const regularPrice = document.createElement("p");
  regularPrice.className = "pricing-regular";

  const price = document.createElement("div");
  price.className = "pricing-price";

  const savings = document.createElement("p");
  savings.className = "pricing-savings";

  const billingMeta = document.createElement("p");
  billingMeta.className = "pricing-meta";

  if (tier.foundersMonthly == null) {
    price.textContent = "Custom pricing";
    billingMeta.textContent = "Contact us for organization onboarding";
  } else if (mode === MONTHLY) {
    regularPrice.innerHTML = `Regular price: <span>${formatCurrency(tier.regularMonthly)}/mo</span>`;
    price.textContent = `Founders price: ${formatCurrency(tier.foundersMonthly)}/mo`;
    savings.textContent = `Save ${formatCurrency(tier.regularMonthly - tier.foundersMonthly)}/mo`;
    billingMeta.textContent = "Billed monthly";
  } else {
    const regularAnnual = tier.regularMonthly * 12;
    const foundersAnnual = annualFoundersTotal(tier.foundersMonthly);
    const foundersMonthlyEquivalent = Math.round(foundersAnnual / 12);
    regularPrice.innerHTML = `Regular price: <span>${formatCurrency(regularAnnual)}/year</span>`;
    price.textContent = `Founders price: ${formatCurrency(foundersAnnual)}/year`;
    savings.textContent = `Save ${formatCurrency(regularAnnual - foundersAnnual)}/year`;
    billingMeta.textContent = `Includes 15% annual discount - about ${formatCurrency(foundersMonthlyEquivalent)}/mo`;
  }

  const cta = document.createElement("button");
  cta.type = "button";
  cta.className = "info-btn info-btn--primary";

  if (tier.cta === "trial") {
    cta.textContent = "Start free trial";
    cta.dataset.cta = `pricing-${tier.key}`;
    cta.addEventListener("click", () => {
      window.location.href = trialRoute();
    });
  } else {
    cta.textContent = "Contact us";
    cta.dataset.cta = "pricing-organization-contact";
    cta.addEventListener("click", onOrganizationContact);
  }

  if (tier.foundersMonthly == null) {
    const organizationSummary = document.createElement("div");
    organizationSummary.className = "pricing-organization-summary";
    organizationSummary.append(title, price, details);
    wrap.append(organizationSummary, billingMeta, cta);
  } else {
    if (tier.key === "studio") wrap.append(featuredBadge);
    wrap.append(title, details, badge, regularPrice, price, savings, billingMeta, cta);
  }
  return wrap;
}

function PricingCard({ tier, billing, onOrganizationContact }) {
  const card = document.createElement("article");
  card.className = "pricing-card";
  card.dataset.tier = tier.key;
  card.setAttribute("aria-label", `${tier.name} pricing`);
  const face = document.createElement("div");
  face.className = "pricing-face";
  face.appendChild(renderPricingFace(tier, billing, onOrganizationContact));
  card.appendChild(face);
  return card;
}

function FAQAccordion(items) {
  const wrap = document.createElement("div");
  wrap.className = "faq-list";

  items.forEach((item, index) => {
    const details = document.createElement("details");
    details.className = "faq-item";
    details.id = item.id;
    if (index === 0) details.open = true;

    const summary = document.createElement("summary");
    summary.textContent = item.q;

    const answer = document.createElement("p");
    answer.textContent = item.a;

    details.append(summary, answer);
    wrap.appendChild(details);
  });

  return wrap;
}

const ORGANIZATION_TYPES = [
  "Private Studio",
  "School",
  "Homeschool Program",
  "Church",
  "Community Music School",
  "Other"
];

const STUDENT_COUNTS = ["301-500", "501-1000", "1000+"];

const CURRENT_SOFTWARE_OPTIONS = [
  "My Music Staff",
  "Opus1",
  "Music Teacher's Helper",
  "Studio Director",
  "Other",
  "None"
];

const ORGANIZATION_GOALS = [
  "Student Motivation",
  "Practice Tracking",
  "Rewards System",
  "Student Retention",
  "Parent Engagement",
  "Studio Growth",
  "Other"
];

function optionMarkup(items, placeholder) {
  return [
    `<option value="">${placeholder}</option>`,
    ...items.map((item) => `<option value="${item}">${item}</option>`)
  ].join("");
}

function checkboxMarkup(items) {
  return items.map((item) => `
    <label class="lead-checkbox">
      <input type="checkbox" name="goals" value="${item}" />
      <span>${item}</span>
    </label>
  `).join("");
}

async function submitOrganizationLead(payload) {
  const response = await fetch("/api/organization-leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    throw new Error(result.error || "Unable to submit organization lead.");
  }
  return result;
}

function OrganizationLeadModal() {
  const overlay = document.createElement("div");
  overlay.className = "simple-modal-overlay";
  overlay.hidden = true;
  overlay.setAttribute("aria-hidden", "true");

  const dialog = document.createElement("div");
  dialog.className = "simple-modal organization-lead-modal";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "organizationLeadModalTitle");
  dialog.innerHTML = `
    <div class="organization-lead-modal__head">
      <div>
        <p class="section-eyebrow">Organization Plan</p>
        <h3 id="organizationLeadModalTitle">Tell us about your organization</h3>
      </div>
      <button type="button" class="organization-lead-modal__close" data-close-modal aria-label="Close">&times;</button>
    </div>
    <form class="organization-lead-form" novalidate>
      <div class="lead-form-grid">
        <label>
          <span>Studio Name *</span>
          <input name="studio_name" type="text" autocomplete="organization" required />
        </label>
        <label>
          <span>Contact Name *</span>
          <input name="contact_name" type="text" autocomplete="name" required />
        </label>
        <label>
          <span>Email Address *</span>
          <input name="email" type="email" autocomplete="email" required />
        </label>
        <label>
          <span>Phone Number</span>
          <input name="phone" type="tel" autocomplete="tel" />
        </label>
        <label>
          <span>Organization Type</span>
          <select name="organization_type">${optionMarkup(ORGANIZATION_TYPES, "Select type")}</select>
        </label>
        <label>
          <span>Student Count</span>
          <select name="student_count">${optionMarkup(STUDENT_COUNTS, "Select range")}</select>
        </label>
        <label>
          <span>Teacher Count</span>
          <input name="teacher_count" type="number" min="0" inputmode="numeric" />
        </label>
        <label>
          <span>Current Software</span>
          <select name="current_software">${optionMarkup(CURRENT_SOFTWARE_OPTIONS, "Select software")}</select>
        </label>
      </div>
      <fieldset class="lead-goals">
        <legend>Goals</legend>
        <div class="lead-goals-grid">${checkboxMarkup(ORGANIZATION_GOALS)}</div>
      </fieldset>
      <label class="lead-notes">
        <span>Additional Notes</span>
        <textarea name="notes" rows="4"></textarea>
      </label>
      <p class="lead-form-status" role="status" aria-live="polite"></p>
      <div class="simple-modal__actions organization-lead-actions">
        <button type="button" class="info-btn info-btn--primary" data-lead-type="information">Request Information</button>
        <button type="button" class="info-btn info-btn--primary" data-lead-type="demo">Schedule a Demo</button>
      </div>
    </form>
  `;

  const form = dialog.querySelector(".organization-lead-form");
  const statusEl = dialog.querySelector(".lead-form-status");
  const actionButtons = [...dialog.querySelectorAll("[data-lead-type]")];
  let isSubmitting = false;
  let hasSubmitted = false;

  const setStatus = (message, type = "") => {
    statusEl.textContent = message;
    statusEl.dataset.state = type;
  };

  const setProcessing = (processing, activeType = "") => {
    isSubmitting = processing;
    actionButtons.forEach((button) => {
      button.disabled = processing || hasSubmitted;
      const original = button.dataset.originalText || button.textContent;
      button.dataset.originalText = original;
      button.textContent = processing && button.dataset.leadType === activeType ? "Submitting..." : original;
    });
  };

  const collectPayload = (leadType) => {
    const formData = new FormData(form);
    return {
      studio_name: String(formData.get("studio_name") || "").trim(),
      contact_name: String(formData.get("contact_name") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      organization_type: String(formData.get("organization_type") || "").trim(),
      student_count: String(formData.get("student_count") || "").trim(),
      teacher_count: String(formData.get("teacher_count") || "").trim(),
      current_software: String(formData.get("current_software") || "").trim(),
      goals: formData.getAll("goals").map((goal) => String(goal).trim()).filter(Boolean),
      notes: String(formData.get("notes") || "").trim(),
      lead_type: leadType
    };
  };

  const handleSubmit = async (leadType) => {
    if (isSubmitting || hasSubmitted) return;
    if (!form.reportValidity()) {
      setStatus("Please complete the required fields.", "error");
      return;
    }

    setStatus("Submitting your request...", "loading");
    setProcessing(true, leadType);

    try {
      const result = await submitOrganizationLead(collectPayload(leadType));
      hasSubmitted = true;
      const successMessage = "Thank you for your interest in Music Amplified. We will contact you within 1–2 business days.";
      setStatus(
        leadType === "demo" && result.demo_url ? `${successMessage} Redirecting to scheduling...` : successMessage,
        "success"
      );
      setProcessing(false);
      if (leadType === "demo" && result.demo_url) {
        setTimeout(() => {
          window.location.href = result.demo_url;
        }, 1300);
      }
    } catch (error) {
      console.error("[OrganizationLeadForm] submission failed", error);
      setStatus(error.message || "Something went wrong. Please try again.", "error");
      setProcessing(false);
    }
  };

  const close = () => {
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  };

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  dialog.querySelector("[data-close-modal]")?.addEventListener("click", close);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    handleSubmit("information");
  });
  actionButtons.forEach((button) => {
    button.addEventListener("click", () => handleSubmit(button.dataset.leadType));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) close();
  });

  overlay.appendChild(dialog);

  return {
    element: overlay,
    open: () => {
      form.reset();
      hasSubmitted = false;
      setStatus("");
      setProcessing(false);
      overlay.hidden = false;
      overlay.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-open");
      setTimeout(() => form.elements.studio_name?.focus(), 0);
    },
    close
  };
}

function InfoPage(root) {
  let billing = MONTHLY;
  const page = document.createElement("div");
  page.className = "info-root";

  const contactModal = OrganizationLeadModal();

  page.innerHTML = `
    <header class="info-header">
      <div class="info-header__brand">
        <img class="info-logo" src="images/logos/amplified.png" alt="Music Amplified logo" />
        <span class="info-brand-name">Music Amplified</span>
      </div>
      <div class="info-header__actions">
        <button type="button" class="info-btn info-btn--ghost" id="headerPricingBtn" data-cta="header-see-pricing">See Pricing</button>
        <a href="${trialRoute()}" class="info-btn info-btn--primary" data-cta="header-start-trial">Start Free Trial</a>
      </div>
    </header>
    <section class="info-hero info-hero--bold hero" id="hero">
      <div class="hero-inner">
        <div class="info-hero__content hero-copy">
          <p class="section-eyebrow">Built for music studios</p>
          <h1>Students lose motivation when progress stays invisible.</h1>
          <p class="lead">Music Amplified makes progress visible, rewarding, and motivating - so students keep practicing.</p>
          <p class="support">Students see growth. Families stay informed. Teachers stay in control without extra chaos.</p>
          <p class="info-hero__micro">Built by a studio owner for studio owners.</p>
          <div class="info-hero__cta hero-ctas">
            <a href="${trialRoute()}" class="info-btn info-btn--primary" data-cta="hero-primary">Start Free Trial</a>
            <button type="button" class="info-btn info-btn--ghost" id="heroPricingBtn" data-cta="hero-secondary">See Pricing</button>
          </div>
          <div class="hero-proof-row hero-benefits" aria-label="Product proof points">
            <div class="hero-proof-item item hero-chip"><span class="hero-proof-item__icon" aria-hidden="true"></span><span>Progress visible every day</span></div>
            <div class="hero-proof-item item hero-chip"><span class="hero-proof-item__icon" aria-hidden="true"></span><span>Fast teacher approvals</span></div>
            <div class="hero-proof-item item hero-chip"><span class="hero-proof-item__icon" aria-hidden="true"></span><span>Studio-level control</span></div>
          </div>
        </div>
      </div>
    </section>

    <main class="info-main">
      <section id="how-works" class="info-section info-section--workflow">
        <div class="section-head">
          <p class="section-eyebrow">How It Works</p>
          <h2>How Music Amplified Works</h2>
          <p class="section-lead">A simple loop that turns effort into visible momentum.</p>
        </div>
        <div class="how-steps-grid" aria-label="How Music Amplified works in four steps">
          <article class="how-step">
            <span class="how-step__marker" aria-hidden="true">1</span>
            <h3>Log Practice</h3>
            <p>Students log practice, goals, and achievements.</p>
          </article>
          <article class="how-step">
            <span class="how-step__marker" aria-hidden="true">2</span>
            <h3>Earn Points</h3>
            <p>Teachers approve and points update automatically.</p>
          </article>
          <article class="how-step">
            <span class="how-step__marker" aria-hidden="true">3</span>
            <h3>Level Up</h3>
            <p>Progress becomes visible through levels and badges.</p>
          </article>
          <article class="how-step">
            <span class="how-step__marker" aria-hidden="true">4</span>
            <h3>Climb the Leaderboard</h3>
            <p>Students move across the studio leaderboard as they grow.</p>
          </article>
        </div>
      </section>

      <section id="leaderboard-motivation" class="info-section feature-section feature-section--highlight">
        <div class="feature-row feature-row--leaderboard">
          <div class="feature-copy">
            <p class="section-eyebrow">Motivation Proof</p>
            <h2>Turn Progress Into Momentum</h2>
            <p>When students can see where they stand, they stay engaged longer. Music Amplified makes progress visible, social, and motivating.</p>
            <ul class="feature-points">
              <li>Students move across each level as points grow.</li>
              <li>Friendly competition keeps studio energy high.</li>
              <li>Momentum stays visible week after week.</li>
            </ul>
          </div>
          <figure class="feature-media feature-media--leaderboard">
            <img src="images/info/leaderboard.png" alt="Studio leaderboard showing student progress bars and rank movement" loading="lazy" />
          </figure>
        </div>
      </section>

      <section id="student-dashboard" class="info-section feature-section">
        <div class="feature-row feature-row--reverse">
          <figure class="feature-media feature-media--priority">
            <img src="images/info/dashboard.png" alt="Student dashboard with level progress, XP, teacher challenge, and quick log actions" loading="lazy" />
          </figure>
          <div class="feature-copy">
            <p class="section-eyebrow">Student Experience</p>
            <h2>Students Instantly See Their Progress</h2>
            <p>The dashboard makes growth obvious: level progress, challenges, quick logs, and clear next goals.</p>
            <p>Visible progress is what keeps students practicing.</p>
          </div>
        </div>
      </section>

      <section id="student-logs" class="info-section feature-section">
        <div class="feature-row">
          <div class="feature-copy">
            <p class="section-eyebrow">Student Logs</p>
            <h2>Every Effort Counts</h2>
            <p>Music Amplified tracks real musical growth, not random gamification.</p>
            <ul class="feature-points">
              <li>Practice sessions, recital performances, and group classes.</li>
              <li>Theory tests, competitions, and bonus initiative.</li>
              <li>Students and families can see completed vs pending approvals.</li>
            </ul>
          </div>
          <figure class="feature-media feature-media--priority">
            <img src="images/info/logs.png" alt="Student logs showing completed and pending achievements by category" loading="lazy" />
          </figure>
        </div>
      </section>

      <section id="teacher-review" class="info-section feature-section">
        <div class="feature-row feature-row--reverse">
          <figure class="feature-media">
            <img src="images/info/review.png" alt="Teacher review dashboard with pending logs and one-tap approval workflow" loading="lazy" />
          </figure>
          <div class="feature-copy">
            <p class="section-eyebrow">Teacher Flow</p>
            <h2>Teachers Stay in Control Without Extra Work</h2>
            <p>Approvals stay quick and controlled so motivation stays high without adding staff burden.</p>
            <ul class="feature-points">
              <li>Pending logs are easy to review.</li>
              <li>Teachers approve quickly and stay in control.</li>
              <li>Admins can assist when volume spikes.</li>
            </ul>
          </div>
        </div>
      </section>

      <section id="admin-manage" class="info-section feature-section">
        <div class="feature-row">
          <div class="feature-copy">
            <p class="section-eyebrow">Studio Operations</p>
            <h2>Manage Student Progress Without Spreadsheet Chaos</h2>
            <p>Studio owners can keep structure without friction by managing logs from one clear command center.</p>
            <ul class="feature-points">
              <li>Search and filter logs fast.</li>
              <li>Edit points, categories, and statuses when needed.</li>
              <li>Keep approvals and progress data accurate.</li>
            </ul>
          </div>
          <figure class="feature-media">
            <img src="images/info/manage.png" alt="Admin management view with student log table, filters, and status controls" loading="lazy" />
          </figure>
        </div>
      </section>

      <section id="badge-motivation" class="info-section feature-section feature-section--highlight">
        <div class="feature-row feature-row--reverse">
          <figure class="feature-media">
            <img src="images/info/badges.png" alt="Badge progress showing last badge earned and next badge to unlock" loading="lazy" />
          </figure>
          <div class="feature-copy">
            <p class="section-eyebrow">Long-Term Motivation</p>
            <h2>Clear Goals Keep Students Practicing</h2>
            <p>Students always know what they have earned and what milestone comes next.</p>
            <ul class="feature-points">
              <li>Last badge earned is always visible.</li>
              <li>Next badge requirement is clear.</li>
              <li>Locked rewards create long-term focus and momentum.</li>
            </ul>
          </div>
        </div>
      </section>

      <section id="studio-settings" class="info-section feature-section">
        <div class="feature-row">
          <div class="feature-copy">
            <p class="section-eyebrow">Studio Setup</p>
            <h2>Studio Setup Is Simple</h2>
            <p>Get started quickly with settings for users, profile, permissions, and subscription controls.</p>
            <button type="button" class="info-btn info-btn--primary" id="studioControlsBtn" data-cta="studio-teams-controls">See Studio Controls</button>
          </div>
          <figure class="feature-media">
            <img src="images/info/settings.png" alt="Studio settings screen for users, profile, permissions, and subscription management" loading="lazy" />
          </figure>
        </div>
      </section>

      <section id="credibility" class="info-section credibility-section">
        <article class="credibility-card">
          <p class="section-eyebrow">Credibility</p>
          <h2>Built by a Studio Owner</h2>
          <p>Music Amplified was designed inside a real music studio to solve the motivation problem teachers face every week.</p>
          <ul class="feature-points">
            <li>Built around real student behavior.</li>
            <li>Designed for teachers, families, and admins.</li>
            <li>Focused on visible progress, not more busywork.</li>
          </ul>
        </article>
      </section>

      <section id="culture" class="info-section culture-section">
        <div class="culture-inner">
          <p class="section-eyebrow">Culture Payoff</p>
          <h2>A Studio Culture Students Can Feel</h2>
          <p>Students celebrate progress. Parents see growth. Teachers stay organized. Music Amplified turns effort into visible momentum across your entire studio.</p>
          <ul class="feature-points">
            <li>Motivation becomes part of studio culture.</li>
            <li>Progress stays visible all year.</li>
            <li>Students have a reason to keep going.</li>
          </ul>
        </div>
      </section>

      <section id="pricing" class="band-section info-section info-section--pricing">
        <div class="section-card">
          <div class="section-head">
            <p class="section-eyebrow">Pricing</p>
          <h2>Pricing</h2>
          </div>
          <p class="pricing-intro">All plans include full access to all features.</p>
          <p class="pricing-beta-note">Founders pricing available during beta.</p>
          <div id="billingToggleMount"></div>
          <div class="pricing-grid" id="pricingCardsMount"></div>
          <div class="pricing-urgency">
            <div>
              <p class="pricing-note">Founding pricing available for the first ${FOUNDING_PRICING_TOTAL} studios or through Sep 1, 2027, whichever comes first.</p>
              <p class="pricing-note pricing-note--strong">${FOUNDING_PRICING_CLAIMED} of ${FOUNDING_PRICING_TOTAL} founding spots claimed</p>
            </div>
            <div class="pricing-progress" aria-label="${FOUNDING_PRICING_CLAIMED} of ${FOUNDING_PRICING_TOTAL} founding spots claimed">
              <span style="width: ${(FOUNDING_PRICING_CLAIMED / FOUNDING_PRICING_TOTAL) * 100}%"></span>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" class="info-section info-section--faq">
        <div class="section-head">
          <p class="section-eyebrow">FAQ</p>
        <h2>FAQ</h2>
        </div>
        <div id="faqMount"></div>
      </section>

      <section class="footer-cta info-section info-section--final" id="final-cta">
        <p class="section-eyebrow">Built by a studio owner for studio owners</p>
        <h2>Give Your Students a Better Reason to Keep Practicing</h2>
        <p class="section-lead">Make progress visible, motivating, and easy to manage across your studio.</p>
        <div class="footer-cta__actions">
          <a href="${trialRoute()}" class="info-btn info-btn--primary" data-cta="footer-start-trial">Start Free Trial</a>
          <a href="mailto:hello@example.com" class="info-btn info-btn--ghost" data-cta="footer-contact">Contact</a>
        </div>
      </section>
    </main>
  `;

  function renderPricing() {
    const toggleMount = page.querySelector("#billingToggleMount");
    const cardsMount = page.querySelector("#pricingCardsMount");
    if (!toggleMount || !cardsMount) return;

    toggleMount.innerHTML = "";
    toggleMount.appendChild(BillingToggle({
      billing,
      onChange: (next) => {
        billing = next;
        renderPricing();
      }
    }));

    cardsMount.innerHTML = "";
    PRICING_TIERS.forEach((tier) => {
      cardsMount.appendChild(PricingCard({
        tier,
        billing,
        onOrganizationContact: contactModal.open
      }));
    });
  }

  page.querySelector("#headerPricingBtn")?.addEventListener("click", (event) => smoothScrollTo("pricing", event));
  page.querySelector("#heroPricingBtn")?.addEventListener("click", (event) => smoothScrollTo("pricing", event));
  page.querySelector("#studioControlsBtn")?.addEventListener("click", (event) => {
    smoothScrollTo("faq-permissions", event);
    const faqItem = document.getElementById("faq-permissions");
    if (faqItem && faqItem.tagName.toLowerCase() === "details") faqItem.open = true;
  });

  const faqMount = page.querySelector("#faqMount");
  if (faqMount) faqMount.appendChild(FAQAccordion(FAQ_ITEMS));

  renderPricing();
  root.append(page, contactModal.element);
}

const mount = document.getElementById("infoApp");
if (mount) InfoPage(mount);


