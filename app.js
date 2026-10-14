const form = document.getElementById("application-form");
const message = document.getElementById("form-message");
const submitButton = document.getElementById("submit-button");
document.getElementById("year").textContent = new Date().getFullYear();
const today = new Date().toISOString().slice(0,10);
form.elements.applicationDate.value = today;
form.elements.signatureDate.value = today;

const rowConfig = {
  education: {
    container: "education-rows", max: 8, title: "Education",
    fields: [
      ["schoolUniversity","School / University","text"],["certificate","Certificate","text"],
      ["majorDegree","Major & Degree","text"],["grade","Grade","text"],["graduationDate","Graduation Date","date"]
    ]
  },
  employment: {
    container: "employment-rows", max: 6, title: "Employment",
    fields: [
      ["company","Company","text"],["jobTitle","Job Title","text"],["from","From","date"],
      ["to","To","date"],["lastPackage","Last Package","text"],["reasonForLeaving","Reason for Leaving","text"]
    ]
  },
  references: {
    container: "reference-rows", max: 3, title: "Reference",
    fields: [["name","Name","text"],["position","Position","text"],["company","Company","text"],["phoneNumber","Phone Number","tel"]]
  }
};
function addRow(type) {
  const cfg = rowConfig[type], container = document.getElementById(cfg.container);
  if (container.children.length >= cfg.max) return;
  const card = document.createElement("div");
  card.className = "row-card";
  const head = document.createElement("div");
  head.className = "row-card-head";
  const title = document.createElement("span");
  title.textContent = `${cfg.title} ${container.children.length + 1}`;
  head.appendChild(title);
  if (container.children.length > 0) {
    const remove = document.createElement("button");
    remove.type = "button"; remove.className = "remove-row"; remove.textContent = "Remove";
    remove.addEventListener("click", () => { card.remove(); renumber(type); });
    head.appendChild(remove);
  }
  card.appendChild(head);
  const grid = document.createElement("div"); grid.className = "row-grid";
  cfg.fields.forEach(([name,label,typeAttr]) => {
    const lab = document.createElement("label"); lab.textContent = label;
    const input = document.createElement("input");
    input.type = typeAttr; input.name = `${type}_${name}`; input.maxLength = 250;
    if (typeAttr === "text" || typeAttr === "tel") input.autocomplete = "off";
    lab.appendChild(input); grid.appendChild(lab);
  });
  card.appendChild(grid); container.appendChild(card);
  updateAddButtons();
}
function renumber(type) {
  const cfg = rowConfig[type];
  [...document.getElementById(cfg.container).children].forEach((card, i) => {
    card.querySelector(".row-card-head span").textContent = `${cfg.title} ${i + 1}`;
    const remove = card.querySelector(".remove-row");
    if (remove) remove.style.visibility = i === 0 ? "hidden" : "visible";
  });
  updateAddButtons();
}
function updateAddButtons() {
  Object.entries(rowConfig).forEach(([type,cfg]) => {
    const btn = document.querySelector(`[data-add="${type}"]`);
    btn.disabled = document.getElementById(cfg.container).children.length >= cfg.max;
    btn.textContent = btn.disabled ? `Maximum ${cfg.max} reached` : `+ Add ${type === "references" ? "reference" : type === "employment" ? "employment" : "education"}`;
  });
}
document.querySelectorAll("[data-add]").forEach(btn => btn.addEventListener("click", () => addRow(btn.dataset.add)));
addRow("education"); addRow("employment"); addRow("references");
document.getElementById("hasRelianceContacts").addEventListener("change", e => {
  document.getElementById("contact-details-wrap").hidden = e.target.value !== "Yes";
});
function readRows(type) {
  const cfg = rowConfig[type];
  return [...document.getElementById(cfg.container).children].map(card => {
    const row = {};
    cfg.fields.forEach(([key]) => row[key] = card.querySelector(`[name="${type}_${key}"]`).value.trim());
    return row;
  }).filter(row => Object.values(row).some(Boolean));
}
function formPayload() {
  const data = {};
  [...form.elements].forEach(el => {
    if (!el.name || el.name.startsWith("education_") || el.name.startsWith("employment_") || el.name.startsWith("references_")) return;
    if (el.type === "checkbox") data[el.name] = el.checked ? el.value : "";
    else data[el.name] = el.value;
  });
  data.education = readRows("education");
  data.employment = readRows("employment");
  data.references = readRows("references");
  return data;
}
function showMessage(text, kind) {
  message.textContent = text; message.className = `form-message ${kind}`;
  message.scrollIntoView({behavior:"smooth",block:"center"});
}
form.addEventListener("submit", async event => {
  event.preventDefault();
  message.className = "form-message"; message.textContent = "";
  if (!form.reportValidity()) return;
  if (form.elements.signatureName.value.trim() !== form.elements.fullName.value.trim()) {
    showMessage("Please enter your full name in the typed signature field to confirm your application.", "error");
    form.elements.signatureName.focus(); return;
  }
  submitButton.disabled = true;
  submitButton.textContent = "Submitting…";
  try {
    const response = await fetch("/api/submit", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify(formPayload())
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || "We could not submit your application right now.");
    form.reset();
    document.getElementById("education-rows").replaceChildren();
    document.getElementById("employment-rows").replaceChildren();
    document.getElementById("reference-rows").replaceChildren();
    addRow("education"); addRow("employment"); addRow("references");
    form.elements.applicationDate.value = today;
    form.elements.signatureDate.value = today;
    document.getElementById("contact-details-wrap").hidden = true;
    updateAddButtons();
    showMessage(result.message || "Your application has been submitted successfully.", "success");
  } catch (err) {
    showMessage(err.message || "We could not submit your application right now. Please try again later.", "error");
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Submit Application <span aria-hidden="true">→</span>';
  }
});
