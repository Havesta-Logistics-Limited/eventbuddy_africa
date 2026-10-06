import { describe, expect, it } from "vitest";
import { isValidPhoneStrict, normalizePhone } from "./validation";

describe("normalizePhone", () => {
  it.each([
    ["0801 234 5678", "+2348012345678"],
    ["08012345678", "+2348012345678"],
    ["+234 801 234 5678", "+2348012345678"],
    ["+2348012345678", "+2348012345678"],
    ["2348012345678", "+2348012345678"],
    ["(0703) 123-4567", "+2347031234567"],
    ["0905 555 1234", "+2349055551234"],
    ["+44 20 7946 0958", "+442079460958"],
    ["+1 (415) 555-2671", "+14155552671"],
  ])("accepts %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([
    "1234567", // too short, no country code
    "0801 234", // Nigerian, too short
    "080123456789", // Nigerian, too long
    "0601 234 5678", // network digit must be 7/8/9
    "+++++++",
    "(((( ))))",
    "0000000000",
    "08000000000", // repeated digit after the network digit
    "+1 234", // too few digits
    "+12345678901234567", // too many digits
    "080+12345678", // + in the middle
    "phone",
    "",
  ])("rejects %s", (input) => {
    expect(isValidPhoneStrict(input)).toBe(false);
  });
});
