import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseCfegHeaders,
  shouldIntercept,
  isAddrSpec,
  parsePartyField,
  normalizeHeaderInput,
  parseMailboxOrAddr,
  formatComposeChip,
  SUPPORTED_VERSIONS,
  CURRENT_CONTRACT_VERSION,
} from "../src/shared/headers.js";

describe("isAddrSpec / parseMailboxOrAddr", () => {
  it("accepts hop tokens", () => {
    assert.equal(isAddrSpec("r+ab12@example.test"), true);
  });
  it("parses mailbox form", () => {
    const p = parseMailboxOrAddr(
      '"Alice <alice@a.com>" <r+tok@example.test>',
    );
    assert.equal(p.tokenAddr, "r+tok@example.test");
    assert.equal(p.displayLabel, "Alice <alice@a.com>");
  });
  it("formatComposeChip", () => {
    assert.equal(
      formatComposeChip("Alice <alice@a.com>", "r+t@example.test"),
      '"Alice <alice@a.com>" <r+t@example.test>',
    );
  });
});

describe("parsePartyField", () => {
  it("splits email|name", () => {
    assert.deepEqual(parsePartyField("alice@example.test|Alice Example"), {
      email: "alice@example.test",
      name: "Alice Example",
    });
  });
});

describe("normalizeHeaderInput", () => {
  it("parses case-insensitive", () => {
    const m = normalizeHeaderInput("X-CFEG-Reply-To: r+x@example.test\n");
    assert.equal(m.get("x-cfeg-reply-to"), "r+x@example.test");
  });
});

describe("contract version", () => {
  it("current version is 2", () => {
    assert.equal(CURRENT_CONTRACT_VERSION, 2);
    assert.deepEqual([...SUPPORTED_VERSIONS], [2]);
  });
  it("unsupported version fail-open", () => {
    const ctx = parseCfegHeaders(`X-CFEG-Version: 99
X-CFEG-Reply-To: r+exampltoken01@example.test
`);
    assert.equal(ctx.status, "unsupported_version");
    assert.equal(shouldIntercept(ctx), false);
  });
});

describe("parseCfegHeaders (contract scenarios)", () => {
  it("S1 simple From", () => {
    const raw = `X-CFEG-Version: 2
X-CFEG-Reply-To: "Alice <alice@a.com>" <r+TOKEN@example.test>
X-CFEG-Reply-To-Addr: r+TOKEN@example.test
X-CFEG-Reply-Mailbox: desk@example.test
X-CFEG-Parties: [{"role":"primary","header":"from","name":"Alice","email":"alice@a.com","token":"r+TOKEN@example.test","suffix":null,"mailbox":"\\"Alice <alice@a.com>\\" <r+TOKEN@example.test>"}]
X-CFEG-Reply-All-Addr: r+TOKEN@example.test
`;
    const ctx = parseCfegHeaders(raw);
    assert.equal(ctx.version, 2);
    assert.equal(ctx.replyTo, "r+TOKEN@example.test");
    assert.equal(ctx.participants.length, 0);
    assert.equal(ctx.primary?.email, "alice@a.com");
  });

  it("S2 From + Cc", () => {
    const raw = `X-CFEG-Version: 2
X-CFEG-Reply-To: "Example Sender <sender@example.com>" <r+TOKEN@example.test>
X-CFEG-Reply-To-Addr: r+TOKEN@example.test
X-CFEG-Reply-To-p1: "cc-peer@example.test" <r+TOKEN.p1@example.test>
X-CFEG-Reply-To-p1-Addr: r+TOKEN.p1@example.test
X-CFEG-Reply-All-Addr: r+TOKEN@example.test, r+TOKEN.p1@example.test
X-CFEG-Parties: [{"role":"primary","header":"from","name":"Example Sender","email":"sender@example.com","token":"r+TOKEN@example.test","suffix":null,"mailbox":"x"},{"role":"cc","header":"cc","name":"","email":"cc-peer@example.test","token":"r+TOKEN.p1@example.test","suffix":"p1","mailbox":"y"}]
`;
    const ctx = parseCfegHeaders(raw);
    assert.equal(ctx.replyTo, "r+TOKEN@example.test");
    assert.equal(ctx.participants.length, 1);
    assert.equal(ctx.participants[0].replyTo, "r+TOKEN.p1@example.test");
    assert.equal(ctx.participants[0].role, "cc");
  });

  it("S3 Reply-To wins + from + cc", () => {
    const raw = `X-CFEG-Version: 2
X-CFEG-Reply-To: "Desk <desk@vendor.com>" <r+TOKEN@example.test>
X-CFEG-Reply-To-Addr: r+TOKEN@example.test
X-CFEG-Reply-To-p1: "Alice <alice@a.com>" <r+TOKEN.p1@example.test>
X-CFEG-Reply-To-p2: "Carol <carol@c.com>" <r+TOKEN.p2@example.test>
X-CFEG-Reply-All-Addr: r+TOKEN@example.test, r+TOKEN.p1@example.test, r+TOKEN.p2@example.test
`;
    const ctx = parseCfegHeaders(raw);
    assert.equal(ctx.replyTo, "r+TOKEN@example.test");
    assert.match(ctx.replyToDisplay || ctx.replyToMailbox || "", /Desk/);
    assert.equal(ctx.participants.length, 2);
    assert.equal(ctx.participants[0].replyTo, "r+TOKEN.p1@example.test");
    assert.equal(ctx.participants[1].replyTo, "r+TOKEN.p2@example.test");
  });

  it("S4 multi To/Cc via Reply-All-Addr only", () => {
    const raw = `X-CFEG-Version: 2
X-CFEG-Reply-To-Addr: r+T@example.test
X-CFEG-Reply-To: "Alice <alice@a.com>" <r+T@example.test>
X-CFEG-Reply-All-Addr: r+T@example.test, r+T.p1@example.test, r+T.p2@example.test, r+T.p3@example.test, r+T.p4@example.test
`;
    const ctx = parseCfegHeaders(raw);
    assert.equal(ctx.replyTo, "r+T@example.test");
    assert.equal(ctx.participants.length, 4);
  });

  it("S5 multi Reply-To via pN", () => {
    const raw = `X-CFEG-Version: 2
X-CFEG-Reply-To: "R1 <r1@x.com>" <r+TOKEN@example.test>
X-CFEG-Reply-To-Addr: r+TOKEN@example.test
X-CFEG-Reply-To-p1: "R2 <r2@x.com>" <r+TOKEN.p1@example.test>
X-CFEG-Reply-To-p2: "Alice <alice@a.com>" <r+TOKEN.p2@example.test>
`;
    const ctx = parseCfegHeaders(raw);
    assert.equal(
      ctx.participants.map((p) => p.replyTo).join(","),
      "r+TOKEN.p1@example.test,r+TOKEN.p2@example.test",
    );
  });

  it("activation via Addr only", () => {
    const ctx = parseCfegHeaders(
      "X-CFEG-Version: 2\nX-CFEG-Reply-To-Addr: r+only@example.test\n",
    );
    assert.equal(ctx.replyTo, "r+only@example.test");
  });

  it("missing version assumes current", () => {
    const ctx = parseCfegHeaders(
      "X-CFEG-Reply-To-Addr: r+only@example.test\n",
    );
    assert.equal(ctx.version, CURRENT_CONTRACT_VERSION);
    assert.equal(ctx.versionAssumed, true);
    assert.equal(ctx.status, "ok");
  });
});
