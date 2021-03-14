import { expect } from "chai";
import { bn, bn18, bn6, bn8, ether, fmt, max, min, sum } from "../src/utils";

describe("utils", () => {
  it("digits", () => {
    expect(bn(1).toString()).eq("1");
    expect(bn(1)).bignumber.eq("1");

    expect(bn18("1")).bignumber.eq(ether).eq("1000000000000000000");
    expect(bn6("1").toString()).eq("1000000");
    expect(bn6("1")).bignumber.eq("1000000");
    expect(bn6("0.1")).bignumber.eq("100000");

    expect(bn8("1").toString()).eq("100000000");
    expect(bn8("1")).bignumber.eq(bn("100000000")).gt(bn6("1"));
  });

  it("format number with color and truncates digis", async () => {
    const bigNumber = bn18("123456789.1234567890123456");
    expect(fmt(bigNumber)).to.match(/\D+123,456,789\.1234\D+/);
  });

  it("uncommify before parsing", () => {
    const n = bn18("1,000,000.000");
    expect(n).bignumber.eq(bn18("1000000"));
    expect(fmt(n)).to.match(/\D+1,000,000\.0000\D+/);
  });

  it("max, min, sum", function () {
    expect(max(bn(1), bn(2))).bignumber.eq("2");
    expect(min(bn(1), bn(2))).bignumber.eq("1");
    expect(sum([bn(1), bn(2), bn(3)])).bignumber.eq("6");
  });
});
