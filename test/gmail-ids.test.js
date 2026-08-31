import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildOriginalMessageUrl,
  classifyReplyActionLabel,
  extractRawFromShowOriginalHtml,
  normalizePermMessageId,
  parseGmailAccountIndex,
  parseIkFromHtml,
} from "../src/hosts/gmail/gmail-ids.js";
import { parseCfegHeaders, shouldIntercept } from "../src/shared/headers.js";

describe("gmail-ids", () => {
  it("parseGmailAccountIndex", () => {
    assert.equal(parseGmailAccountIndex("/mail/u/0/#inbox"), "0");
    assert.equal(parseGmailAccountIndex("/mail/u/2/"), "2");
    assert.equal(parseGmailAccountIndex("/mail/"), "0");
  });

  it("normalizePermMessageId", () => {
    assert.equal(normalizePermMessageId("#msg-f:123"), "msg-f:123");
    assert.equal(normalizePermMessageId("msg-a:9"), "msg-a:9");
    assert.equal(normalizePermMessageId("1234567890"), "msg-f:1234567890");
  });

  it("buildOriginalMessageUrl", () => {
    const url = buildOriginalMessageUrl({
      origin: "https://mail.google.com",
      accountIndex: "0",
      ik: "abc123def",
      permmsgid: "#msg-f:999",
    });
    const u = new URL(url);
    assert.equal(u.searchParams.get("view"), "om");
    assert.equal(u.searchParams.get("ik"), "abc123def");
    assert.equal(u.searchParams.get("permmsgid"), "msg-f:999");
  });

  it("parseIkFromHtml", () => {
    assert.equal(parseIkFromHtml('GM_ID_KEY = "deadbeef01";'), "deadbeef01");
    assert.equal(
      parseIkFromHtml('<a href="/mail/u/0/?ik=abcdef123&amp;view=om">x</a>'),
      "abcdef123",
    );
  });

  it("extractRawFromShowOriginalHtml finds CFEG pre", () => {
    const html = `<html><body><pre>From: alice@example.test
X-CFEG-Version: 2
X-CFEG-Reply-To: r+tok@example.test

Body</pre></body></html>`;
    const raw = extractRawFromShowOriginalHtml(html);
    assert.ok(raw);
    const ctx = parseCfegHeaders(raw);
    assert.equal(shouldIntercept(ctx), true);
    assert.equal(ctx.replyTo, "r+tok@example.test");
  });

  it("classifyReplyActionLabel", () => {
    assert.equal(classifyReplyActionLabel("Reply"), "reply");
    assert.equal(classifyReplyActionLabel("Reply all"), "reply_all");
    assert.equal(classifyReplyActionLabel("Reply to all"), "reply_all");
    assert.equal(classifyReplyActionLabel("Forward"), null);
    assert.equal(classifyReplyActionLabel("New Message"), null);
    assert.equal(classifyReplyActionLabel("Compose"), null);
    assert.equal(classifyReplyActionLabel("noreply@x.com"), null);
  });
});
