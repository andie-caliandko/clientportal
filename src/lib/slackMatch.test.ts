import { describe, expect, it } from "vitest";
import { channelBelongsToOther } from "./slackMatch";

const clients = ["100 Prince Condos", "Epting Events", "The Village Clubhouse", "Lotus Wellness"];

describe("channelBelongsToOther", () => {
  it("catches another client's channel", () => {
    expect(channelBelongsToOther("epting-events", "100 Prince Condos", clients)).toBe("Epting Events");
    expect(channelBelongsToOther("lotus-wellness", "Epting Events", clients)).toBe("Lotus Wellness");
  });
  it("accepts the client's own channel", () => {
    expect(channelBelongsToOther("100-prince", "100 Prince Condos", clients)).toBeNull();
    expect(channelBelongsToOther("the-village-clubhouse", "The Village Clubhouse", clients)).toBeNull();
  });
  it("doesn't match on common words alone", () => {
    expect(channelBelongsToOther("events-team", "100 Prince Condos", clients)).toBeNull();
  });
});
