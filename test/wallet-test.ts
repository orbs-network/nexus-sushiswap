import { expect } from "chai";
import Web3 from "web3";
import { Wallet } from "../src/impl/wallet";
import { bn18, zero } from "../src/utils";
import { Tokens } from "../src/impl/token";
import { resetFakeNetworkFork } from "../src/network";

describe("wallet", () => {
  beforeEach(() => resetFakeNetworkFork());

  it("fakes", async () => {
    const wallet = await Wallet.fake();
    expect(Web3.utils.isAddress(wallet.address)).true;
    expect(Web3.utils.checkAddressChecksum(wallet.address)).true;

    expect(await wallet.getBalance()).bignumber.eq(bn18("10,000"));

    const other = await Wallet.fake(1);
    expect(other.address).not.eq(wallet.address);
    expect(await other.getBalance()).bignumber.eq(bn18("10,000"));
  });

  it("random", async () => {
    const wallet = Wallet.random();
    expect(await wallet.getBalance()).bignumber.eq(zero);

    const other = Wallet.random();
    expect(other.address).not.eq(wallet.address);
    expect(await other.getBalance()).bignumber.eq(zero);
  });

  it("default signer", async () => {
    const wallet = await Wallet.fake();
    wallet.setAsDefaultSigner();

    const spender = Wallet.random().address;
    await Tokens.eth.WETH().methods.approve(spender, "1").send();
    const allowance = await Tokens.eth.WETH().methods.allowance(wallet.address, spender).call();
    expect(allowance).bignumber.eq("1");
  });
});
