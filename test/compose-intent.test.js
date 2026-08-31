import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCfegHeaders } from "../src/shared/headers.js";
import { toComposeIntent } from "../src/shared/compose-intent.js";

const S2 = `X-CFEG-Version: 2
X-CFEG-Reply-To: "Example Sender <sender@example.com>" <r+TOKEN@example.test>
X-CFEG-Reply-To-Addr: r+TOKEN@example.test
X-CFEG-Reply-To-Display: Example Sender <sender@example.com>
X-CFEG-Parties: [{"role":"primary","header":"from","name":"Example Sender","email":"sender@example.com","token":"r+TOKEN@example.test","suffix":null,"mailbox":"x"},{"role":"cc","header":"cc","name":"","email":"peer@cc.example","token":"r+TOKEN.p1@example.test","suffix":"p1","mailbox":"y"},{"role":"to","header":"to","name":"Bob","email":"bob@b.com","token":"r+TOKEN.p2@example.test","suffix":"p2","mailbox":"z"}]
X-CFEG-Reply-All-Addr: r+TOKEN@example.test, r+TOKEN.p1@example.test, r+TOKEN.p2@example.test
`;

describe("toComposeIntent", () => {
  it("Reply → bare hop only, empty Cc", () => {
    const ctx = parseCfegHeaders(S2);
    const intent = toComposeIntent(ctx, "reply");
    assert.deepEqual(intent.to, ["r+TOKEN@example.test"]);
    assert.deepEqual(intent.cc, []);
    assert.match(intent.toChips[0], /r\+TOKEN@example.test/);
  });

  it("Reply-All → To=primary+to-role; Cc=cc-role only", () => {
    const ctx = parseCfegHeaders(S2);
    const intent = toComposeIntent(ctx, "reply_all");
    assert.deepEqual(intent.to, [
      "r+TOKEN@example.test",
      "r+TOKEN.p2@example.test",
    ]);
    assert.deepEqual(intent.cc, ["r+TOKEN.p1@example.test"]);
  });

  it("multiparty without roles → others on Cc", () => {
    const multi = `X-CFEG-Version: 2
X-CFEG-Reply-To: r+exampltoken01@example.test
X-CFEG-Reply-To-Display: Alice <alice@example.test>
X-CFEG-Reply-To-p1: r+exampltoken01.p1@example.test
X-CFEG-Reply-To-p2: r+exampltoken01.p2@example.test
`;
    const intent = toComposeIntent(parseCfegHeaders(multi), "reply_all");
    assert.deepEqual(intent.to, ["r+exampltoken01@example.test"]);
    assert.deepEqual(intent.cc, [
      "r+exampltoken01.p1@example.test",
      "r+exampltoken01.p2@example.test",
    ]);
  });

  it("null when unsupported version", () => {
    assert.equal(
      toComposeIntent(
        parseCfegHeaders(
          "X-CFEG-Version: 9\nX-CFEG-Reply-To: r+x@example.test\n",
        ),
        "reply",
      ),
      null,
    );
  });
});
