import { Router } from "express";
import { asyncHandler } from "../middleware/error";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/requireRole";
import { isBlockedHost } from "../lib/ssrf";

const router = Router();

// ── POST /api/proxy-request — port of proxy-request edge function ───────
// Authed + admin only. KEEPS the SSRF host blocklist exactly.
router.post(
  "/proxy-request",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { url, method = "GET", headers = {}, body } = req.body ?? {};

    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL is required" });
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return res.status(400).json({ error: "Invalid URL" });
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return res.status(400).json({ error: "Only http(s) URLs are allowed" });
    }
    if (isBlockedHost(parsed.hostname)) {
      return res.status(403).json({ error: "Requests to internal/private hosts are not allowed" });
    }

    const fetchOptions: RequestInit = {
      method,
      headers: headers as Record<string, string>,
      redirect: "manual", // prevent redirect-based SSRF bypass
    };
    if (["POST", "PUT", "PATCH"].includes(method) && body) {
      fetchOptions.body = body;
    }

    const start = Date.now();
    const response = await fetch(parsed.toString(), fetchOptions);
    const elapsed = Date.now() - start;

    const contentType = response.headers.get("content-type") || "";
    let responseBody: string;
    if (contentType.includes("json")) {
      const json = await response.json();
      responseBody = JSON.stringify(json, null, 2);
    } else {
      responseBody = await response.text();
    }

    res.json({
      status: response.status,
      statusText: response.statusText,
      time: elapsed,
      body: responseBody,
    });
  })
);

// ── POST /api/parse-trackdrive-url — port of parse-trackdrive-url ───────
router.post(
  "/parse-trackdrive-url",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { url } = req.body ?? {};
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL is required" });
    }

    const parsedUrl = new URL(url.trim());
    const domain = parsedUrl.origin;
    const trafficSourceId = parsedUrl.searchParams.get("traffic_source_id") || "";
    const numberId = parsedUrl.searchParams.get("trackdrive_number_id") || "";

    // Detect direct API URLs — extract vanity URI from path, no scraping.
    const directApiMatch = parsedUrl.pathname.match(/\/api\/v1\/inbound_webhooks\/(?:ping|post)\/(.+)/);
    if (directApiMatch) {
      const vanityUri = directApiMatch[1].replace(/\/$/, "");
      return res.json({
        vanity_uri: vanityUri,
        ping_url: `${domain}/api/v1/inbound_webhooks/ping/${vanityUri}`,
        post_url: `${domain}/api/v1/inbound_webhooks/post/${vanityUri}`,
        traffic_source_id: trafficSourceId,
        trackdrive_number_id: numberId,
        trackdrive_number: "",
      });
    }

    const pageResponse = await fetch(url.trim(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LeadSystem/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!pageResponse.ok) {
      return res.status(422).json({ error: `Failed to fetch posting instructions page (${pageResponse.status})` });
    }

    const html = await pageResponse.text();
    const pingMatch = html.match(/\/api\/v1\/inbound_webhooks\/ping\/([^"'<>&\s?]+)/);
    const postMatch = html.match(/\/api\/v1\/inbound_webhooks\/post\/([^"'<>&\s?]+)/);
    const vanityUri = pingMatch ? pingMatch[1] : null;

    if (!vanityUri) {
      return res.status(200).json({
        error: "Could not extract vanity URI from page. The page may require authentication.",
        fallback: true,
        traffic_source_id: trafficSourceId,
        trackdrive_number_id: numberId,
      });
    }

    const pingUrl = `${domain}/api/v1/inbound_webhooks/ping/${vanityUri}`;
    const postUrl = postMatch
      ? `${domain}/api/v1/inbound_webhooks/post/${postMatch[1]}`
      : `${domain}/api/v1/inbound_webhooks/post/${vanityUri}`;

    let trackdriveNumber = "";
    const phonePatterns = [/\+1[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}/g, /\+1\d{10}/g, /1-\d{3}-\d{3}-\d{4}/g];
    for (const pattern of phonePatterns) {
      const matches = html.match(pattern);
      if (matches && matches.length > 0) {
        trackdriveNumber = matches[0].replace(/[\s()-]/g, "");
        if (!trackdriveNumber.startsWith("+")) trackdriveNumber = "+" + trackdriveNumber;
        break;
      }
    }

    res.json({
      vanity_uri: vanityUri,
      ping_url: pingUrl,
      post_url: postUrl,
      traffic_source_id: trafficSourceId,
      trackdrive_number_id: numberId,
      trackdrive_number: trackdriveNumber,
    });
  })
);

export default router;
