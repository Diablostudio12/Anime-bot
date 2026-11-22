"use strict";
const dns = require("node:dns").promises;
const net = require("node:net");
const cheerio = require("cheerio");
const HOSTS = [...new Set((process.env.SITE_CONNECTOR_HOSTS || "example.com,developer.mozilla.org").split(",").map(x => x.trim().toLowerCase()).filter(x => /^[a-z0-9.-]{3,253}$/.test(x) && !x.startsWith(".") && !x.endsWith(".")))].slice(0, 20);
const MAX_BYTES = 512 * 1024;
function publicIp(address) {
  if (net.isIP(address) === 4) {
    const p = address.split(".").map(Number);
    return !(p[0] === 0 || p[0] === 10 || p[0] === 127 || p[0] >= 224 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || (p[0] === 192 && p[1] === 0) || (p[0] === 198 && [18,19].includes(p[1])) || (p[0] === 198 && p[1] === 51 && p[2] === 100) || (p[0] === 203 && p[1] === 0 && p[2] === 113));
  }
  if (net.isIP(address) === 6) return !(/^(::1|::|fe80:|fc|fd)/i.test(address) || address.toLowerCase().startsWith("::ffff:"));
  return false;
}
function validatedUrl(text) {
  let url;
  try { url = new URL(text); } catch { throw new Error("Provide a valid HTTPS URL."); }
  if (url.protocol !== "https:" || url.port || url.username || url.password || !HOSTS.includes(url.hostname.toLowerCase())) throw new Error("Host not allowed. Check /sites; only configured HTTPS sites are supported.");
  if (url.href.length > 2048) throw new Error("URL too long.");
  url.hash = "";
  return url;
}
async function inspectPage(input, httpFetch = fetch, lookup = dns.lookup) {
  const url = validatedUrl(input);
  // Resolve for private-address detection. Note: a hardened network egress policy is still advised to prevent DNS rebinding.
  const ips = await lookup(url.hostname, { all: true });
  if (!Array.isArray(ips) || !ips.length || ips.some(x => !publicIp(x.address))) throw new Error("Address rejected by network safety policy.");
  let response;
  try { response = await httpFetch(url.href, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(12000), headers: { "Accept": "text/html,application/xhtml+xml", "User-Agent": "RYVAN-SiteMetadata/1.0" } }); }
  catch (error) { throw new Error(`Connection failed: ${String(error.message).slice(0,100)}`); }
  if (response.status === 403) return { status: "ACCESS_BLOCKED", host: url.hostname, http: 403, note: "Website denied this server request. No retry attempted." };
  if (response.status === 429) return { status: "RATE_LIMITED", host: url.hostname, http: 429, note: "Website rate limited this request. No retry attempted." };
  if (response.status >= 300 && response.status < 400) return { status: "REDIRECT", host: url.hostname, http: response.status, note: "Redirect not followed for security." };
  if (!response.ok) return { status: "HTTP_ERROR", host: url.hostname, http: response.status, note: "Page not available." };
  if (!/text\/html|application\/xhtml\+xml/i.test(response.headers.get("content-type") || "")) return { status: "UNSUPPORTED_CONTENT", host: url.hostname, note: "Only public HTML page metadata is supported." };
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_BYTES) return { status: "TOO_LARGE", host: url.hostname, note: "HTML page exceeds safe size limit." };
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body.");
  const buffers = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_BYTES) throw new Error("HTML page exceeds safe size limit."); buffers.push(Buffer.from(value)); } }
  finally { try { await reader.cancel(); } catch {} }
  const html = Buffer.concat(buffers).toString("utf8");
  const $ = cheerio.load(html);
  const title = ($("title").first().text().trim() || "Untitled").slice(0, 180);
  const description = ($('meta[name="description"]').attr("content") || "").trim().slice(0, 240);
  const scripts = $("script[src]").map((_, el) => String($(el).attr("src") || "")).get().join(" ").toLowerCase();
  const markup = html.toLowerCase();
  const detectors = [
    ["JW Player", /jwplayer(?:\.js|\/|\()/i], ["Video.js", /video-js|video\.js|videojs/i],
    ["Plyr", /plyr(?:\.js|\.css|__|\()/i], ["ArtPlayer", /artplayer/i],
    ["DPlayer", /dplayer/i], ["Clappr", /clappr/i], ["Shaka Player", /shaka-player|shaka\.player/i]
  ];
  const evidence = (scripts + " " + markup.slice(0, 200000));
  const players = detectors.filter(([, re]) => re.test(evidence)).map(([name]) => name);
  if ($("video").length) players.push("HTML5 video element");
  return { status: "OK", host: url.hostname, title, description, players: [...new Set(players)], iframeCount: $("iframe").length, detection: "HTML only; dynamic JavaScript players may be missed", note: "Public page metadata only. No stream URLs or access-control bypass." };
}
module.exports = { HOSTS, validatedUrl, inspectPage };
