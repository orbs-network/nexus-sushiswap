import { contract, Contract } from "../src/extensions";
import { artifact, network, web3 } from "../src/network";
import { Wallet } from "../src/impl/wallet";
import { Nexus } from "../typechain-hardhat/Nexus";
import { expect } from "chai";
import { Tokens } from "../src/impl/token";

describe("Nexus", () => {
  it.only("sponsor can emergencyWithdraw", async () => {
    const deployer = await Wallet.fake();

    expect(await nexus.methods.USDC().call()).eq(Tokens.eth.USDC().address);
  });
});
