
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const path = require("path");

const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(
  helmet({
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
  })
);

app.use(express.json({ limit: "40kb" }));
app.use(express.static(path.join(__dirname, "public"), { maxAge: "1h" }));

// Serve the website files from the repository root.
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/style.css", (req, res) => {
  res.sendFile(path.join(__dirname, "style.css"));
});

app.get("/app.js", (req, res) => {
  res.sendFile(path.join(__dirname, "app.js"));
});

// Rate limit application submissions.
const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Too many attempts. Please wait a few minutes and try again."
  }
});

const MAX_TEXT = 500;

function clean(value, max = MAX_TEXT) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return "";

  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}

function safeEmail(value) {
  const s = clean(value, 254);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : "";
}

function flattenRows(rows, keys) {
  if (!Array.isArray(rows)) return [];

  return rows.slice(0, 6).map(row => {
    const out = {};

    for (const key of keys) {
      out[key] = clean(row && row[key], 250);
    }

    return out;
  });
}

function buildPayload(body) {
  const p = {};

  const fields = [
    "applicationDate",
    "fullName",
    "presentAddress",
    "homePhone",
    "mobilePhone",
    "email",
    "age",
    "dateOfBirth",
    "nationality",
    "maritalStatus",
    "gender",
    "numberOfChildren",
    "positionAppliedFor",
    "salaryExpected",
    "hasCarAndLicense",
    "noticePeriod",
    "certificatesExtraStudies",
    "computerSkills",
    "englishLevel",
    "frenchLevel",
    "otherLanguage",
    "otherLanguageLevel",
    "hasRelianceContacts",
    "relianceContactDetails",
    "declaration",
    "signatureName",
    "signatureDate"
  ];

  for (const f of fields) {
    const max =
      f === "presentAddress" ||
      f === "certificatesExtraStudies" ||
      f === "computerSkills"
        ? 1500
        : 500;

    p[f] = clean(body[f], max);
  }

  p.education = flattenRows(body.education, [
    "schoolUniversity",
    "certificate",
    "majorDegree",
    "grade",
    "graduationDate"
  ]);

  p.employment = flattenRows(body.employment, [
    "company",
    "jobTitle",
    "from",
    "to",
    "lastPackage",
    "reasonForLeaving"
  ]);

  p.references = flattenRows(body.references, [
    "name",
    "position",
    "company",
    "phoneNumber"
  ]).slice(0, 3);

  return p;
}

function validate(p) {
  if (!p.fullName) return "Please enter your full name.";
  if (!safeEmail(p.email)) return "Please enter a valid email address.";
  if (!p.positionAppliedFor) {
    return "Please enter the position you are applying for.";
  }
  if (p.declaration !== "accepted") {
    return "Please confirm the applicant declaration before submitting.";
  }
  if (!p.signatureName) return "Please enter your typed signature.";
  if (!p.signatureDate) return "Please enter the signature date.";

  return null;
}

function labelFor(key) {
  const labels = {
    applicationDate: "Application Date",
    fullName: "Full Name",
    presentAddress: "Present Address",
    homePhone: "Home Phone",
    mobilePhone: "Mobile Phone",
    email: "Email Address",
    age: "Age",
    dateOfBirth: "Date of Birth",
    nationality: "Nationality",
    maritalStatus: "Marital Status",
    gender: "Gender",
    numberOfChildren: "Number of Children",
    positionAppliedFor: "Position Applied For",
    salaryExpected: "Expected Salary",
    hasCarAndLicense: "Car and Driving License",
    noticePeriod: "Notice Period",
    certificatesExtraStudies: "Certificates & Extra Studies",
    computerSkills: "Computer Skills & Programs",
    englishLevel: "English",
    frenchLevel: "French",
    otherLanguage: "Other Language",
    otherLanguageLevel: "Other Language Level",
    hasRelianceContacts: "Relatives/Friends at Reliance",
    relianceContactDetails: "Reliance Contact Details",
    declaration: "Applicant Declaration",
    signatureName: "Typed Signature",
    signatureDate: "Signature Date"
  };

  return labels[key] || key;
}

function val(v) {
  return v === undefined || v === null || String(v).trim() === ""
    ? "—"
    : String(v).trim();
}


function makePdf(p) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 38, bottom: 38, left: 42, right: 42 },
      info: {
        Title: "Reliance Employment Application",
        Author: "Reliance Egypt"
      }
    });

    const chunks = [];
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const navy = "#26384A";
    const muted = "#64748B";
    const border = "#CBD5E1";
    const pale = "#F1F5F9";
    const ink = "#1F2937";
    const gap = 10;
    const colWidth = (pageWidth - gap) / 2;

    function ensureSpace(height) {
      if (doc.y + height > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
      }
    }

    function section(number, title) {
      ensureSpace(38);
      const y = doc.y;
      doc.roundedRect(doc.page.margins.left, y, pageWidth, 27, 4).fill(pale);
      doc.fillColor(navy).font("Helvetica-Bold").fontSize(10)
        .text(number, doc.page.margins.left + 9, y + 8, { width: 22 });
      doc.fillColor(navy).font("Helvetica-Bold").fontSize(11)
        .text(title, doc.page.margins.left + 34, y + 7, { width: pageWidth - 42 });
      doc.y = y + 35;
    }

    function field(label, value, width, opts = {}) {
      const x = doc.page.margins.left + (opts.xOffset || 0);
      const labelHeight = 12;
      const innerWidth = width - 14;
      const valueText = val(value);
      doc.font("Helvetica").fontSize(9);
      const textHeight = Math.max(12, doc.heightOfString(valueText, { width: innerWidth, lineGap: 1 }));
      const boxHeight = Math.max(opts.minHeight || 27, textHeight + 12);
      ensureSpace(labelHeight + boxHeight + 8);
      const y = doc.y;
      doc.fillColor(muted).font("Helvetica-Bold").fontSize(7.5)
        .text(label, x, y, { width, height: labelHeight, lineBreak: false, ellipsis: true });
      doc.roundedRect(x, y + 13, width, boxHeight, 3)
        .lineWidth(0.7).strokeColor(border).stroke();
      doc.fillColor(ink).font("Helvetica").fontSize(9)
        .text(valueText, x + 7, y + 19, { width: innerWidth, lineGap: 1 });
      doc.y = y + labelHeight + boxHeight + 8;
    }

    function twoFields(labelA, valueA, labelB, valueB) {
      const startY = doc.y;
      field(labelA, valueA, colWidth);
      const endYA = doc.y;
      doc.y = startY;
      field(labelB, valueB, colWidth, { xOffset: colWidth + gap });
      const endYB = doc.y;
      doc.y = Math.max(endYA, endYB);
    }

    function fullField(label, value, minHeight = 27) {
      field(label, value, pageWidth, { minHeight });
    }

    function repeatedSection(number, title, rows, keys, labels) {
      section(number, title);
      if (!rows.length) {
        fullField("No entries provided", "—");
        return;
      }
      rows.forEach((row, index) => {
        ensureSpace(45);
        doc.fillColor(navy).font("Helvetica-Bold").fontSize(9)
          .text(title.replace(/ History$/, "") + " " + (index + 1));
        doc.moveDown(0.35);
        for (let i = 0; i < keys.length; i += 2) {
          const k1 = keys[i];
          const k2 = keys[i + 1];
          if (k2) twoFields(labels[i], row[k1], labels[i + 1], row[k2]);
          else fullField(labels[i], row[k1]);
        }
        doc.moveDown(0.35);
      });
    }

    // Official Reliance logo, matching the online application header.
    const logoPath = path.join(__dirname, "logo.png");
    const logoWidth = 210;
    const logoHeight = 95;
    doc.image(logoPath, (doc.page.width - logoWidth) / 2, doc.y, {
      fit: [logoWidth, logoHeight],
      align: "center",
      valign: "center"
    });
    doc.y += logoHeight + 4;
    doc.fillColor(navy).font("Helvetica-Bold").fontSize(14)
      .text("APPLICATION FOR EMPLOYMENT", { align: "center" });
    doc.moveDown(0.3);
    doc.fillColor(muted).font("Helvetica").fontSize(8)
      .text("Confidential recruitment document generated from the online application form.", { align: "center" });
    doc.moveDown(1);

    section("01", "Personal Information");
    twoFields("Application Date", p.applicationDate, "Full Name *", p.fullName);
    fullField("Present Address", p.presentAddress, 40);
    twoFields("Home Phone", p.homePhone, "Mobile Phone", p.mobilePhone);
    twoFields("Email Address *", p.email, "Age", p.age);
    twoFields("Date of Birth", p.dateOfBirth, "Nationality", p.nationality);
    twoFields("Marital Status", p.maritalStatus, "Gender", p.gender);
    twoFields("Number of Children", p.numberOfChildren, "Position Applied For *", p.positionAppliedFor);
    twoFields("Expected Salary", p.salaryExpected, "Car and Driving License", p.hasCarAndLicense);
    fullField("Notice Period", p.noticePeriod);

    repeatedSection("02", "Education History", p.education,
      ["schoolUniversity", "certificate", "majorDegree", "grade", "graduationDate"],
      ["School / University", "Certificate", "Major & Degree", "Grade", "Graduation Date"]);

    section("03", "Certificates & Skills");
    fullField("Certificates & Extra Studies", p.certificatesExtraStudies, 40);
    fullField("Computer Skills & Programs", p.computerSkills, 40);
    twoFields("English", p.englishLevel, "French", p.frenchLevel);
    twoFields("Other Language", p.otherLanguage, "Other Language Level", p.otherLanguageLevel);

    repeatedSection("04", "Employment History", p.employment,
      ["company", "jobTitle", "from", "to", "lastPackage", "reasonForLeaving"],
      ["Company", "Job Title", "From", "To", "Last Package", "Reason for Leaving"]);

    repeatedSection("05", "References", p.references,
      ["name", "position", "company", "phoneNumber"],
      ["Name", "Position", "Company", "Phone Number"]);

    section("06", "Additional Information");
    fullField("Relatives or friends currently working at Reliance?", p.hasRelianceContacts);
    if (p.hasRelianceContacts === "Yes") {
      fullField("Name and Position", p.relianceContactDetails, 40);
    }

    section("07", "Declaration & Signature");
    fullField("Declaration",
      "I declare that the information provided in this application is accurate and complete. I understand that any misrepresentation or omission of facts may affect my application or employment.",
      44);
    twoFields("Typed Signature (Full Name) *", p.signatureName, "Signature Date *", p.signatureDate);

    doc.moveDown(0.5);
    doc.fillColor(muted).font("Helvetica").fontSize(7.5)
      .text("Privacy notice: Application details are used for recruitment purposes only. Confidential — for Reliance Egypt recruitment.", {
        align: "center",
        width: pageWidth
      });

    doc.end();
  });
}

// Receive applications and email the completed PDF.
app.post("/api/submit", submitLimiter, async (req, res) => {
  try {
    const body = req.body || {};

    // Honeypot field for basic bot protection.
    if (clean(body.website, 200)) {
      return res.status(200).json({
        ok: true,
        message: "Your application has been received."
      });
    }

    const payload = buildPayload(body);
    const problem = validate(payload);

    if (problem) {
      return res.status(400).json({ error: problem });
    }

    const requiredEnv = [
      "SMTP_HOST",
      "SMTP_PORT",
      "MAIL_FROM",
      "HR_RECIPIENT"
    ];

    const missing = requiredEnv.filter(key => !process.env[key]);

    const hasSmtpUser = Boolean(process.env.SMTP_USER);
    const hasSmtpPass = Boolean(process.env.SMTP_PASS);

    if (hasSmtpUser !== hasSmtpPass) {
      missing.push("SMTP_AUTH_CONFIGURATION");
    }

    if (missing.length) {
      return res.status(503).json({
        error: "Application submission is temporarily unavailable. Please try again later or contact HR."
      });
    }

    const pdf = await makePdf(payload);
    const port = Number(process.env.SMTP_PORT);

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure:
        String(process.env.SMTP_SECURE).toLowerCase() === "true" ||
        port === 465,
      ...(hasSmtpUser && hasSmtpPass
        ? {
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS
            }
          }
        : {}),
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });

    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: process.env.HR_RECIPIENT,
      replyTo: payload.email,
      subject: `Job Application: ${payload.positionAppliedFor}`,
      text:
        "A new job application has been submitted through the Reliance Egypt website.\n\n" +
        `Applicant: ${payload.fullName}\n` +
        `Position: ${payload.positionAppliedFor}\n\n` +
        "The completed application is attached as a PDF. Handle it as confidential personal information.",
      attachments: [
        {
          filename: "Reliance_Employment_Application.pdf",
          content: pdf,
          contentType: "application/pdf"
        }
      ]
    });

    // No database or disk writes. Application data remains transient in memory.
    return res.status(200).json({
      ok: true,
      message: "Thank you. Your application has been submitted successfully."
    });
  } catch (err) {
    console.error("Application submission failed:", {
      name: err?.name,
      code: err?.code,
      responseCode: err?.responseCode,
      command: err?.command
    });

    return res.status(500).json({
      error: "We could not submit your application right now. Please try again later."
    });
  }
});

// Health check for Render.
app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

const port = Number(process.env.PORT || 3000);

app.listen(port, "0.0.0.0", () => {
  console.log(`Reliance application server listening on port ${port}`);
});
