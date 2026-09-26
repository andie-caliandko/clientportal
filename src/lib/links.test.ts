import { describe, expect, it } from "vitest";
import { driveFolderId, isUrl, slackChannelId } from "./links";

describe("slackChannelId", () => {
  it("reads channel links and bare IDs", () => {
    expect(slackChannelId("https://calikoworkspace.slack.com/archives/C07ABCDE12")).toBe("C07ABCDE12");
    expect(slackChannelId("https://app.slack.com/client/T0123ABCD/C07ABCDE12")).toBe("C07ABCDE12");
    expect(slackChannelId("c07abcde12")).toBe("C07ABCDE12");
  });
  it("rejects channel names and junk", () => {
    expect(slackChannelId("#client-bloom")).toBeNull();
    expect(slackChannelId("")).toBeNull();
  });
});

describe("driveFolderId", () => {
  it("reads folder links and bare IDs", () => {
    expect(driveFolderId("https://drive.google.com/drive/folders/1AbC_dEfGhIjKlMnOp?usp=sharing")).toBe("1AbC_dEfGhIjKlMnOp");
    expect(driveFolderId("https://drive.google.com/drive/u/0/folders/1AbC_dEfGhIjKlMnOp")).toBe("1AbC_dEfGhIjKlMnOp");
    expect(driveFolderId("1AbC_dEfGhIjKlMnOp")).toBe("1AbC_dEfGhIjKlMnOp");
  });
  it("rejects file links and junk", () => {
    expect(driveFolderId("https://docs.google.com/document/d/abc/edit")).toBeNull();
    expect(driveFolderId("Bloom folder")).toBeNull();
  });
});

describe("isUrl", () => {
  it("wants a real link", () => {
    expect(isUrl("https://app.rella.social/space/bloom")).toBe(true);
    expect(isUrl("rella bloom")).toBe(false);
  });
});
