import { localContract } from "../src/extensions";
import { Wallet } from "../src/impl/wallet";
import { Nexus } from "../typechain-hardhat/Nexus";
import { expect } from "chai";
import { Tokens } from "../src/impl/token";
import { bn18, zero } from "../src/utils";

describe("Nexus", () => {
  it.only("sponsor can emergencyWithdraw", async () => {
    const deployer = await Wallet.fake();
    const nexus = await localContract<Nexus>("Nexus", deployer.address, [deployer.address]);
    expect(await nexus.methods.USDC().call()).eq(Tokens.eth.USDC().address);
  });

  it.only("deposit & withdraw with shares", async () => {
    const deployer = await Wallet.fake();
    const owner = deployer.address;
    const nexus = await localContract<Nexus>("Nexus", owner, [owner]);
    expect(await nexus.methods.totalSupply().call()).bignumber.eq(zero);

    await nexus.methods.deposit(bn18("100")).send({ from: owner });
    expect(await nexus.methods.balanceOf(owner).call()).bignumber.eq(bn18("100"));
    expect(await nexus.methods.totalSupply().call()).bignumber.eq(bn18("100"));

    await nexus.methods.deposit(bn18("100")).send({ from: owner });
    expect(await nexus.methods.balanceOf(owner).call()).bignumber.eq(bn18("200"));
    expect(await nexus.methods.totalSupply().call()).bignumber.eq(bn18("200"));

    await nexus.methods.withdraw(bn18("100")).send({ from: owner });
    expect(await nexus.methods.balanceOf(owner).call()).bignumber.eq(bn18("100"));
    expect(await nexus.methods.totalSupply().call()).bignumber.eq(bn18("100"));

    await nexus.methods.withdrawAll().send({ from: owner });
    expect(await nexus.methods.balanceOf(owner).call()).bignumber.eq(zero);
    expect(await nexus.methods.totalSupply().call()).bignumber.eq(zero);
  });
});
