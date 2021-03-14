import { alot } from "../src/utils";
import { Token, Tokens } from "../src/impl/token";
import { expect } from "chai";
import { Wallet } from "../src/impl/wallet";

describe("Token", () => {
  it("erc20", async () => {
    const token = Tokens.eth.WETH();
    expect(token.address).to.not.be.empty;
    expect(token.displayName).to.eq("$WETH");

    const balance = await token.methods.balanceOf(token.address).call();
    expect(balance).not.bignumber.zero;
  });

  it("approveAll if needed", async () => {
    const wallet = await Wallet.fake();
    const token = Tokens.eth.USDC();
    const spender = (await Wallet.random()).address;

    expect(await token.methods.allowance(wallet.address, spender).call()).bignumber.zero;
    await token.approveAll(spender, { from: wallet.address });
    expect(await token.methods.allowance(wallet.address, spender).call()).bignumber.eq(alot);
  });
});
