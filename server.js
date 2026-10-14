const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const path = require("path");

const app = express();
app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: "40kb" }));
app.use(express.static(path.join(__dirname, "public"), { maxAge: "1h" }));

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a few minutes and try again." }
});

const MAX_TEXT = 500;
function clean(value, max = MAX_TEXT) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}
function safeEmail(value) {
  const s = clean(value, 254);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : "";
}
function flattenRows(rows, keys) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 6).map(row => {
    const out = {};
    for (const key of keys) out[key] = clean(row && row[key], 250);
    return out;
  });
}
function buildPayload(body) {
  const p = {};
  const fields = [
    "applicationDate","fullName","presentAddress","homePhone","mobilePhone","email",
    "age","dateOfBirth","nationality","maritalStatus","gender","numberOfChildren",
    "positionAppliedFor","salaryExpected","hasCarAndLicense","noticePeriod",
    "certificatesExtraStudies","computerSkills","englishLevel","frenchLevel","otherLanguage",
    "otherLanguageLevel","hasRelianceContacts","relianceContactDetails","declaration",
    "signatureName","signatureDate"
  ];
  for (const f of fields) p[f] = clean(body[f], f === "presentAddress" || f === "certificatesExtraStudies" || f === "computerSkills" ? 1500 : 500);
  p.education = flattenRows(body.education, ["schoolUniversity","certificate","majorDegree","grade","graduationDate"]);
  p.employment = flattenRows(body.employment, ["company","jobTitle","from","to","lastPackage","reasonForLeaving"]);
  p.references = flattenRows(body.references, ["name","position","company","phoneNumber"]).slice(0, 3);
  return p;
}
function validate(p) {
  if (!p.fullName) return "Please enter your full name.";
  if (!safeEmail(p.email)) return "Please enter a valid email address.";
  if (!p.positionAppliedFor) return "Please enter the position you are applying for.";
  if (p.declaration !== "accepted") return "Please confirm the applicant declaration before submitting.";
  if (!p.signatureName) return "Please enter your typed signature.";
  if (!p.signatureDate) return "Please enter the signature date.";
  return null;
}
function labelFor(key) {
  const labels = {
    applicationDate:"Application Date", fullName:"Full Name", presentAddress:"Present Address",
    homePhone:"Home Phone", mobilePhone:"Mobile Phone", email:"Email Address", age:"Age",
    dateOfBirth:"Date of Birth", nationality:"Nationality", maritalStatus:"Marital Status",
    gender:"Gender", numberOfChildren:"Number of Children", positionAppliedFor:"Position Applied For",
    salaryExpected:"Expected Salary", hasCarAndLicense:"Car and Driving License", noticePeriod:"Notice Period",
    certificatesExtraStudies:"Certificates & Extra Studies", computerSkills:"Computer Skills & Programs",
    englishLevel:"English", frenchLevel:"French", otherLanguage:"Other Language",
    otherLanguageLevel:"Other Language Level", hasRelianceContacts:"Relatives/Friends at Reliance",
    relianceContactDetails:"Reliance Contact Details", declaration:"Applicant Declaration",
    signatureName:"Typed Signature", signatureDate:"Signature Date"
  };
  return labels[key] || key;
}
function val(v) { return (v === undefined || v === null || String(v).trim() === "") ? "—" : String(v).trim(); }
function addText(doc, title, value) {
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#26384A").text(title);
  doc.font("Helvetica").fontSize(10).fillColor("#222222").text(val(value), { width: 500 });
  doc.moveDown(0.55);
}
function addRows(doc, title, rows, keys, labels) {
  doc.addPage();
  doc.font("Helvetica-Bold").fontSize(15).fillColor("#26384A").text(title);
  doc.moveDown();
  if (!rows.length) { doc.font("Helvetica").fontSize(10).text("—"); return; }
  rows.forEach((row, i) => {
    if (doc.y > 680) doc.addPage();
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#26384A").text(`${title} ${i + 1}`);
    doc.moveDown(0.3);
    keys.forEach((k, j) => addText(doc, labels[j], row[k]));
    doc.moveDown(0.4);
  });
}
function makePdf(p) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: 48, bottom: 48, left: 52, right: 52 }, info: { Title: "Reliance Employment Application", Author: "Reliance Egypt" } });
    const chunks = [];
    doc.on("data", c => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.font("Helvetica-Bold").fontSize(19).fillColor("#26384A").text("RELIANCE", { align: "center" });
    doc.moveDown(0.25);
    doc.fontSize(14).text("APPLICATION FOR EMPLOYMENT", { align: "center" });
    doc.moveDown(1);
    doc.font("Helvetica").fontSize(9).fillColor("#555555").text("Submitted through the Reliance Egypt online application form. Please handle this document as confidential personal information.", { align: "center" });
    doc.moveDown(1.2);
    doc.font("Helvetica-Bold").fontSize(15).fillColor("#26384A").text("Personal Information");
    doc.moveDown(0.7);
    [
      "applicationDate","fullName","presentAddress","homePhone","mobilePhone","email","age","dateOfBirth",
      "nationality","maritalStatus","gender","numberOfChildren","positionAppliedFor","salaryExpected",
      "hasCarAndLicense","noticePeriod"
    ].forEach(k => addText(doc, labelFor(k), p[k]));
    doc.addPage();
    doc.font("Helvetica-Bold").fontSize(15).fillColor("#26384A").text("Certificates, Skills & Languages");
    doc.moveDown();
    ["certificatesExtraStudies","computerSkills","englishLevel","frenchLevel","otherLanguage","otherLanguageLevel"].forEach(k => addText(doc, labelFor(k), p[k]));
    addRows(doc, "Education History", p.education, ["schoolUniversity","certificate","majorDegree","grade","graduationDate"], ["School / University","Certificate","Major & Degree","Grade","Graduation Date"]);
    addRows(doc, "Employment History", p.employment, ["company","jobTitle","from","to","lastPackage","reasonForLeaving"], ["Company","Job Title","From","To","Last Package","Reason for Leaving"]);
    addRows(doc, "References", p.references, ["name","position","company","phoneNumber"], ["Name","Position","Company","Phone Number"]);
    doc.addPage();
    doc.font("Helvetica-Bold").fontSize(15).fillColor("#26384A").text("Additional Information & Declaration");
    doc.moveDown();
    addText(doc, labelFor("hasRelianceContacts"), p.hasRelianceContacts);
    addText(doc, labelFor("relianceContactDetails"), p.relianceContactDetails);
    addText(doc, "Applicant Declaration", "I confirm that the information provided in this application is accurate and complete. I understand that any misrepresentation or omission of facts may affect my employment.");
    addText(doc, labelFor("signatureName"), p.signatureName);
    addText(doc, labelFor("signatureDate"), p.signatureDate);
    doc.moveDown(1);
    doc.font("Helvetica").fontSize(8).fillColor("#666666").text("Confidential — for recruitment purposes only.", { align: "center" });
    doc.end();
  });
}

app.post("/api/submit", submitLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    // Honeypot: bots often fill this hidden field. Return a neutral response without sending mail.
    if (clean(body.website, 200)) return res.status(200).json({ ok: true, message: "Your application has been received." });
    const payload = buildPayload(body);
    const problem = validate(payload);
    if (problem) return res.status(400).json({ error: problem });

    // SMTP relays may use IP allowlisting and not require SMTP AUTH.
    const requiredEnv = ["SMTP_HOST","SMTP_PORT","MAIL_FROM","HR_RECIPIENT"];
    const missing = requiredEnv.filter(k => !process.env[k]);
    const hasSmtpUser = Boolean(process.env.SMTP_USER);
    const hasSmtpPass = Boolean(process.env.SMTP_PASS);
    if (hasSmtpUser !== hasSmtpPass) missing.push("SMTP_AUTH_CONFIGURATION");
    if (missing.length) {
      // Do not disclose secret names or submitted personal data to the client or logs.
      return res.status(503).json({ error: "Application submission is temporarily unavailable. Please try again later or contact HR." });
    }
    const pdf = await makePdf(payload);
    const port = Number(process.env.SMTP_PORT);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: String(process.env.SMTP_SECURE).toLowerCase() === "true" || port === 465,
      ...(hasSmtpUser && hasSmtpPass ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } } : {}),
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: process.env.HR_RECIPIENT,
      replyTo: payload.email,
      subject: `Job Application: ${payload.positionAppliedFor}`,
      text: `A new job application has been submitted through the Reliance Egypt website.\n\nApplicant: ${payload.fullName}\nPosition: ${payload.positionAppliedFor}\n\nThe completed application is attached as a PDF. Handle it as confidential personal information.`,
      attachments: [{ filename: "Reliance_Employment_Application.pdf", content: pdf, contentType: "application/pdf" }]
    });
    // No database, disk writes, or application-content logging. Payload/PDF remain transient in memory.
    return res.status(200).json({ ok: true, message: "Thank you. Your application has been submitted successfully." });
  } catch (_) {
    return res.status(500).json({ error: "We could not submit your application right now. Please try again later." });
  }
});
app.get("/health", (_req, res) => res.status(200).json({ ok: true }));
const port = Number(process.env.PORT || 3000);
app.listen(port, "0.0.0.0", () => console.log(`Reliance application server listening on port ${port}`));
