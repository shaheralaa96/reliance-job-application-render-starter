# Reliance Egypt — Job Application Website

A mobile-friendly English job application form based on the supplied Reliance Application for Employment PDF.

## Included
- Responsive form with personal information, education, skills/languages, employment history, references, and declaration/signature.
- Server-side validation, request size limits, rate limiting, honeypot spam field, and security headers.
- Generates a PDF in memory and emails it as an attachment to `careers@relianceegypt.com`.
- No application database and no application-file writes to disk. Form data is processed in memory for the email transaction only.
- No application data is written to application logs.

## Important before going live
**Email delivery is not active until valid SMTP credentials are configured.** Never put credentials in frontend code or commit a real `.env` file.

Configure these as hosting-provider environment secrets:
- `SMTP_HOST`: SMTP server hostname from your authorized mail provider
- `SMTP_PORT`: commonly `587` for STARTTLS or `465` for implicit TLS
- `SMTP_SECURE`: `true` for port 465, otherwise `false` for port 587
- `MAIL_FROM`: sender address authorized by the mail provider (ask the mail administrator which address is approved)
- `HR_RECIPIENT`: `careers@relianceegypt.com`
- `SMTP_USER` and `SMTP_PASS`: optional only if the authorized relay uses IP allowlisting or another no-SMTP-AUTH policy. If one is set, set both.
- `PORT`: hosting platform normally sets this automatically

Use an organization-approved mail relay or transactional mail provider. Confirm that the sender address/domain is authorized and SPF/DKIM/DMARC are configured as appropriate. Do not assume the HR inbox can send SMTP mail just because it can receive mail.

## Run locally
1. Install Node.js 20 or later.
2. Install dependencies with `npm install`.
3. Set the environment variables listed above in your local environment (or use a local `.env` loader if you add one; never commit secrets).
4. Run `npm start`.
5. Open `http://localhost:3000`.

The server's `/health` endpoint only checks that the process is responding; it does not test SMTP credentials.

## Deployment checklist
1. Deploy as a Node.js web service on a provider that supports server-side Node.js and environment secrets.
2. Set all SMTP secrets in the provider's secret manager.
3. Use HTTPS only.
4. Test using a designated internal test inbox and sample data before sharing publicly.
5. Confirm the PDF attachment is readable, delivery works, and failures show a generic message.
6. Set up monitoring for availability without logging form payloads or message content.
7. Confirm the company's privacy notice, retention rules, and consent language with HR/legal before public launch.
8. Publish the URL and generate a QR code only after a successful end-to-end test.

## Data protection notes
This project does not persist application submissions in a database. The generated PDF exists only in process memory to attach to the email. The receiving mailbox will retain the application according to the organization's mailbox and recruitment retention policies. Hosting providers may keep infrastructure/access logs; configure those logs to avoid capturing request bodies and review the provider's retention settings. Add a CAPTCHA or managed bot protection if spam becomes an issue.

## Notes
- This starter does not include an official Reliance logo because no logo asset was supplied.
- The PDF is a clean, readable digital summary of the form fields, not a pixel-perfect reproduction of the original form layout.
- This starter does not currently collect uploaded CVs or other attachments.


## Deploy to Render (manual checklist)
1. Create a private GitHub repository and upload this project. Do not upload `.env` or real credentials.
2. In Render, choose **New + → Web Service**, connect that repository, and select the Node runtime.
3. Set **Build Command** to `npm install` and **Start Command** to `npm start`.
4. Add environment variables in the Render service's **Environment** settings:
   - `SMTP_HOST`: provided by your company's mail administrator
   - `SMTP_PORT`: port approved by the mail administrator
   - `SMTP_SECURE`: `true` for implicit TLS (usually port 465), `false` for STARTTLS (often port 587); follow your relay's actual requirements
   - `MAIL_FROM`: a sender address authorized by the relay
   - `HR_RECIPIENT`: `careers@relianceegypt.com`
   - `SMTP_USER` and `SMTP_PASS`: only if the relay requires SMTP authentication
5. Deploy. Wait for the service to finish building. The `/health` endpoint only proves the web process is running, not that email works.
6. Before public launch, perform an end-to-end test using dummy applicant data and confirm that the HR mailbox receives `Reliance_Employment_Application.pdf`, that the attachment opens, and that reply-to points to the test applicant.
7. Check Render logs for startup/errors only; do not enable request-body logging. Verify no submitted personal data appears in logs.
8. Only after the test succeeds should you share the public URL and generate a QR code.

## SMTP relay requirements to confirm with IT
- Exact SMTP hostname, port, and TLS mode.
- Whether SMTP AUTH is required or relay is restricted by source IP.
- Whether Render's outbound connection is permitted by company policy and the relay firewall. A relay that only accepts connections from office IPs may not accept Render traffic.
- Which `MAIL_FROM` sender is approved and whether the relay permits sending to the HR recipient.
- SPF/DKIM/DMARC and message-size limits as applicable.

Do not try to bypass company relay restrictions. If the relay only accepts internal IPs, ask IT for an approved relay path or use an approved transactional mail service.
