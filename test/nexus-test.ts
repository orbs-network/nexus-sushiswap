import { contract, deployContract } from "../src/extensions";
import { Wallet } from "../src/impl/wallet";
import { expect } from "chai";
import { Tokens } from "../src/impl/token";
import { alot, bn18, zero } from "../src/utils";
import { IUniswapV2Router02 } from "../typechain-hardhat/IUniswapV2Router02";
import { NexusSushiSingleEthUSDC } from "../typechain-hardhat/NexusSushiSingleEthUSDC";

describe("Nexus", () => {
  it("sponsor can emergencyWithdraw", async () => {
    const deployer = await Wallet.fake();
    const nexus = await deployContract<NexusSushiSingleEthUSDC>("NexusSushiSingleEthUSDC", deployer.address);

    expect(await nexus.methods.USDC().call()).eq(Tokens.eth.USDC().address);
    //TODO
  });

  it("deposit & withdraw", async () => {
    const deployer = await Wallet.fake();
    deployer.setAsDefaultSigner();
    await buyUSDC(deployer);
    const nexus = await deployContract<NexusSushiSingleEthUSDC>("NexusSushiSingleEthUSDC", deployer.address);

    expect(await nexus.methods.totalSupply().call()).bignumber.eq(zero);

    await Tokens.eth.USDC().approveAll(nexus.options.address);
    await nexus.methods.depositAllCapital().send();

    await nexus.methods.deposit(deployer.address).send({ from: deployer.address, value: bn18("10") });

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

  async function buyUSDC(wallet: Wallet) {
    const router = contract<IUniswapV2Router02>(
      require("../artifacts/contracts/ISushiswapRouter.sol/IUniswapV2Router02.json").abi,
      "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F"
    );
    await router.methods
      .swapExactETHForTokens(0, [Tokens.eth.WETH().address, Tokens.eth.USDC().address], wallet.address, alot)
      .send({ value: (await wallet.getBalance()).divn(2) });
  }
});
