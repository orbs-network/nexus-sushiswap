import { contract, deployContract } from "../src/extensions";
import { Wallet } from "../src/impl/wallet";
import { expect } from "chai";
import { Tokens } from "../src/impl/token";
import { bn18, ether, many } from "../src/utils";
import { IUniswapV2Router02 } from "../typechain-hardhat/IUniswapV2Router02";
import { NexusSushiSingleEthUSDC } from "../typechain-hardhat/NexusSushiSingleEthUSDC";

describe("LiquidityNexus with SushiSwap single sided ETH/USDC", () => {
  it("sanity", async () => {
    const deployer = await Wallet.fake();
    const nexus = await deployContract<NexusSushiSingleEthUSDC>("NexusSushiSingleEthUSDC", deployer.address);
    expect(await nexus.methods.USDC().call()).eq(Tokens.eth.USDC().address);
    expect(await nexus.methods.WETH().call()).eq(Tokens.eth.WETH().address);
    expect(await nexus.methods.stopped().call()).is.false;
    expect(await nexus.methods.governance().call())
      .eq(await nexus.methods.owner().call())
      .eq(deployer.address);
  });
  it("owner can emergencyLiquidate", async () => {
    const deployer = await Wallet.fake();
    deployer.setAsDefaultSigner();
    const nexus = await deployContract<NexusSushiSingleEthUSDC>("NexusSushiSingleEthUSDC", deployer.address);
    await buyUSDC(deployer);
    await supplyCapital(nexus);

    expect(await nexus.methods.stopped().call()).to.be.false;
    expect(await Tokens.eth.USDC().methods.balanceOf(nexus.options.address).call()).not.bignumber.zero;
    expect(await Tokens.eth.USDC().methods.balanceOf(deployer.address).call()).bignumber.zero;

    await nexus.methods.emergencyLiquidate().send();

    expect(await Tokens.eth.USDC().methods.balanceOf(nexus.options.address).call()).bignumber.zero;
    expect(await Tokens.eth.USDC().methods.balanceOf(deployer.address).call()).not.bignumber.zero;
    expect(await nexus.methods.stopped().call()).to.be.true;
  });

  it("user as governance, 100% share, deposit & withdraw", async () => {
    const deployer = await Wallet.fake();
    deployer.setAsDefaultSigner();
    const nexus = await deployContract<NexusSushiSingleEthUSDC>("NexusSushiSingleEthUSDC", deployer.address);
    await buyUSDC(deployer);
    await supplyCapital(nexus);

    expect(await nexus.methods.totalSupply().call()).bignumber.zero;

    const user = await Wallet.fake(1);
    nexus.methods.setGovernance(user.address).send();
    const startBalance = await user.getBalance();

    await nexus.methods.deposit(user.address).send({ value: bn18("10"), from: user.address });
    expect(await user.getBalance()).bignumber.closeTo(startBalance.sub(bn18("10")), ether);
    let account = await nexus.methods.accounts(user.address).call();
    expect(account.eth).bignumber.closeTo(bn18("10"), bn18("0.1")); // difference due to gas costs
    expect(account.usd).not.bignumber.zero;
    expect(await nexus.methods.totalSupply().call()).bignumber.eq(account.shares);

    await nexus.methods.withdrawAll(user.address).send({ from: user.address });
    expect(await nexus.methods.totalSupply().call()).bignumber.zero;
    account = await nexus.methods.accounts(user.address).call();
    expect(account.eth).bignumber.zero;
    expect(account.usd).bignumber.zero;
    expect(account.shares).bignumber.zero;
    expect(await user.getBalance()).bignumber.closeTo(startBalance, bn18("0.1"));
  });
});

async function buyUSDC(wallet: Wallet) {
  const router = contract<IUniswapV2Router02>(
    require("../artifacts/contracts/ISushiswapRouter.sol/IUniswapV2Router02.json").abi,
    "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F"
  );
  await router.methods
    .swapExactETHForTokens(0, [Tokens.eth.WETH().address, Tokens.eth.USDC().address], wallet.address, many)
    .send({ value: (await wallet.getBalance()).divn(2) });
}

async function supplyCapital(nexus: NexusSushiSingleEthUSDC) {
  await Tokens.eth.USDC().methods.approve(nexus.options.address, many).send();
  await nexus.methods.depositAllCapital().send();
}
