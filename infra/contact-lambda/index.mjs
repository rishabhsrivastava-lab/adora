import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const ses = new SESClient({ region: process.env.AWS_REGION || "ap-south-1" });
const TO_EMAIL = process.env.TO_EMAIL || "info@adoracoatings.com";
const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@adoracoatings.com";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",");

// Rate limiting: simple in-memory (resets when Lambda cold starts)
let requestCount = 0;
let windowStart = Date.now();
const MAX_REQUESTS_PER_HOUR = 20;

function checkRateLimit() {
  const now = Date.now();
  if (now - windowStart > 3600000) {
    requestCount = 0;
    windowStart = now;
  }
  requestCount++;
  return requestCount <= MAX_REQUESTS_PER_HOUR;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateMobile(mobile) {
  return /^[+]?[\d\s\-()]{7,15}$/.test(mobile.replace(/\s/g, ''));
}

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.some(o => origin && origin.includes(o));
  return {
    "Access-Control-Allow-Origin": allowed ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
}

export const handler = async (event) => {
  const origin = event.headers?.origin || event.headers?.Origin || "";
  const headers = corsHeaders(origin);

  // Handle CORS preflight
  if (event.requestContext?.http?.method === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  // Rate limit
  if (!checkRateLimit()) {
    return { statusCode: 429, headers, body: JSON.stringify({ error: "Too many requests. Please try again later." }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");

    // Honeypot check
    if (body._gotcha) {
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    const { name, email, mobile, subject, message, page } = body;

    // Validate required fields
    if (!name || name.trim().length < 2) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Please enter your name." }) };
    }

    if (!message || message.trim().length < 5) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Please enter a message." }) };
    }

    // Must provide either email or mobile
    if (!email && !mobile) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Please provide either email or mobile number." }) };
    }

    if (email && !validateEmail(email)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Please enter a valid email address." }) };
    }

    if (mobile && !validateMobile(mobile)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Please enter a valid mobile number." }) };
    }

    // Build email
    const contactInfo = [
      email ? `Email: ${email}` : null,
      mobile ? `Mobile: ${mobile}` : null,
    ].filter(Boolean).join("\n");

    const emailBody = `
New enquiry from Adora Coatings website

Name: ${name.trim()}
${contactInfo}
${subject ? `Subject: ${subject.trim()}` : ""}
Page: ${page || "Unknown"}

Message:
${message.trim()}

---
Sent from adoracoatings.com contact form
    `.trim();

    const emailHtml = `
<h2>New Enquiry from Adora Coatings Website</h2>
<table style="font-family:Arial;font-size:14px;border-collapse:collapse;">
<tr><td style="padding:8px;font-weight:bold;">Name:</td><td style="padding:8px;">${escapeHtml(name.trim())}</td></tr>
${email ? `<tr><td style="padding:8px;font-weight:bold;">Email:</td><td style="padding:8px;"><a href="mailto:${encodeURIComponent(email)}">${escapeHtml(email)}</a></td></tr>` : ""}
${mobile ? `<tr><td style="padding:8px;font-weight:bold;">Mobile:</td><td style="padding:8px;"><a href="tel:${encodeURIComponent(mobile)}">${escapeHtml(mobile)}</a></td></tr>` : ""}
${subject ? `<tr><td style="padding:8px;font-weight:bold;">Subject:</td><td style="padding:8px;">${escapeHtml(subject.trim())}</td></tr>` : ""}
<tr><td style="padding:8px;font-weight:bold;">Page:</td><td style="padding:8px;">${escapeHtml(page || "Unknown")}</td></tr>
</table>
<h3>Message:</h3>
<p style="font-family:Arial;font-size:14px;white-space:pre-wrap;">${escapeHtml(message.trim())}</p>
<hr>
<p style="font-size:12px;color:#666;">Sent from adoracoatings.com contact form</p>
    `.trim();

    await ses.send(new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: [TO_EMAIL] },
      Message: {
        Subject: { Data: `[Adora Coatings] New enquiry from ${name.trim().slice(0, 100)}` },
        Body: {
          Text: { Data: emailBody },
          Html: { Data: emailHtml },
        },
      },
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: "Thank you! Your message has been sent." }),
    };

  } catch (err) {
    console.error("Error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Something went wrong. Please try again." }),
    };
  }
};
