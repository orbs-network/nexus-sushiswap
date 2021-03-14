import { localContract } from "../src/extensions";
import { Wallet } from "../src/impl/wallet";
import { Nexus } from "../typechain-hardhat/Nexus";
import { expect } from "chai";
import { Tokens } from "../src/impl/token";

describe("Nexus", () => {
  it.only("sponsor can emergencyWithdraw", async () => {
    const deployer = await Wallet.fake();
    const nexus = await localContract("Nexus", deployer.address, [deployer.address]);
    expect(await nexus.methods.USDC().call()).eq(Tokens.eth.USDC().address);
  });

  function deposit(amount: number) {}
  function withdraw(amount: number) {}
});
