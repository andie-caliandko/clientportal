import { describe, expect, it } from "vitest";
import { driveFolderId, embedUrl, isUrl, slackChannelId } from "./links";

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

describe("embedUrl", () => {
  it("turns shared links into embeddable ones", () => {
    expect(embedUrl("https://docs.google.com/document/d/abc123/edit?usp=sharing")).toBe("https://docs.google.com/document/d/abc123/preview");
    expect(embedUrl("https://docs.google.com/spreadsheets/d/s-1/edit#gid=0")).toBe("https://docs.google.com/spreadsheets/d/s-1/preview");
    expect(embedUrl("https://drive.google.com/file/d/F_9/view")).toBe("https://drive.google.com/file/d/F_9/preview");
    expect(embedUrl("https://www.canva.com/design/DAF1/abcKey/view")).toBe("https://www.canva.com/design/DAF1/abcKey/view?embed");
    expect(embedUrl("https://www.canva.com/design/DAF1/edit")).toBe("https://www.canva.com/design/DAF1/view?embed");
    expect(embedUrl("https://www.loom.com/share/xyz")).toBe("https://www.loom.com/embed/xyz");
    expect(embedUrl("https://youtu.be/vid")).toBe("https://www.youtube.com/embed/vid");
    expect(embedUrl("https://app.tango.us/app/workflow/Posting-a-reel-in-Rella-abc123")).toBe("https://app.tango.us/app/embed/Posting-a-reel-in-Rella-abc123");
    expect(embedUrl("https://drive.google.com/drive/folders/1AbC_def")).toBe("https://drive.google.com/embeddedfolderview?id=1AbC_def#list");
  });
  it("leaves other links alone", () => {
    expect(embedUrl("https://example.com/file.pdf")).toBeNull();
    expect(embedUrl("http://docs.google.com/document/d/abc/edit")).toBeNull();
    expect(embedUrl("not a link")).toBeNull();
  });
});
