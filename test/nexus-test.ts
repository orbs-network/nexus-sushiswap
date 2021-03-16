import { contract, localContract } from "../src/extensions";
import { Wallet } from "../src/impl/wallet";
import { Nexus } from "../typechain-hardhat/Nexus";
import { expect } from "chai";
import { Tokens } from "../src/impl/token";
import { bn, bn18, ether, zero } from "../src/utils";
import { IUniswapV2Router02 } from "../typechain-hardhat/IUniswapV2Router02";

describe("Nexus", () => {
  it("sponsor can emergencyWithdraw", async () => {
    const deployer = await Wallet.fake();
    const nexus = await localContract<Nexus>("Nexus", deployer.address);
    expect(await nexus.methods.USDC().call()).eq(Tokens.eth.USDC().address);
    //TODO
  });

  it("deposit & withdraw with shares", async () => {
    const deployer = await Wallet.fake();
    deployer.setAsDefaultSigner();

    const router = contract<IUniswapV2Router02>(
      require("../artifacts/contracts/SushiswapRouter.sol/IUniswapV2Router02.json").abi,
      "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F"
    );
    await router.methods
      .swapExactETHForTokens(0, [Tokens.eth.WETH().address, Tokens.eth.USDC().address], deployer.address, ether)
      .send({ value: (await deployer.getBalance()).divn(2) });

    const nexus = await localContract<Nexus>("Nexus", deployer.address);

    expect(await nexus.methods.totalSupply().call()).bignumber.eq(zero);

    await Tokens.eth.USDC().approveAll(nexus.options.address);
    await nexus.methods.depositAllCapital().send();

    await nexus.methods.deposit().send({ from: deployer.address, value: bn18("10") });

    // await nexus.methods.deposit(bn("100")).send({ from: owner, value: bn18("100") });
    // expect(await nexus.methods.balanceOf(owner).call()).bignumber.eq(bn("100"));
    // expect(await nexus.methods.totalSupply().call()).bignumber.eq(bn("100"));
    //
    // await nexus.methods.deposit(bn("100")).send({ from: owner });
    // expect(await nexus.methods.balanceOf(owner).call()).bignumber.eq(bn("200"));
    // expect(await nexus.methods.totalSupply().call()).bignumber.eq(bn("200"));
    //
    // await nexus.methods.withdraw(bn("100")).send({ from: owner });
    // expect(await nexus.methods.balanceOf(owner).call()).bignumber.eq(bn("100"));
    // expect(await nexus.methods.totalSupply().call()).bignumber.eq(bn("100"));
    //
    // await nexus.methods.withdrawAll().send({ from: owner });
    // expect(await nexus.methods.balanceOf(owner).call()).bignumber.eq(zero);
    // expect(await nexus.methods.totalSupply().call()).bignumber.eq(zero);
  });
});
