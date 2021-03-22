import { contract, deployContract } from "../src/extensions";
import { Wallet } from "../src/impl/wallet";
import { expect } from "chai";
import { Tokens } from "../src/impl/token";
import { bn, bn18, bn6, ether, many } from "../src/utils";
import { IUniswapV2Router02 } from "../typechain-hardhat/IUniswapV2Router02";
import { NexusSushiSingleEthUSDC } from "../typechain-hardhat/NexusSushiSingleEthUSDC";
import { web3 } from "../src/network";

describe("LiquidityNexus with SushiSwap single sided ETH/USDC e2e", () => {
  let deployer: Wallet;
  let nexus: NexusSushiSingleEthUSDC;

  beforeEach(async () => {
    deployer = await Wallet.fake();
    deployer.setAsDefaultSigner();
    nexus = await deployContract<NexusSushiSingleEthUSDC>("NexusSushiSingleEthUSDC", deployer.address);
    await supplyCapital();
  });

  it("sanity", async () => {
    expect(await nexus.methods.USDC().call()).eq(Tokens.eth.USDC().address);
    expect(await nexus.methods.WETH().call()).eq(Tokens.eth.WETH().address);
    expect(await nexus.methods.stopped().call()).is.false;
    expect(await nexus.methods.governance().call())
      .eq(await nexus.methods.owner().call())
      .eq(deployer.address);
    expect(await nexus.methods.totalLiquidity().call()).bignumber.zero;
    expect(await nexus.methods.totalSupply().call()).bignumber.zero;
  });

  it("owner can emergencyLiquidate", async () => {
    expect(await Tokens.eth.USDC().methods.balanceOf(nexus.options.address).call()).not.bignumber.zero;
    expect(await Tokens.eth.USDC().methods.balanceOf(deployer.address).call()).bignumber.zero;

    await nexus.methods.emergencyLiquidate().send();

    expect(await nexus.methods.stopped().call()).to.be.true;
    expect(await Tokens.eth.USDC().methods.balanceOf(nexus.options.address).call()).bignumber.zero;
    expect(await Tokens.eth.USDC().methods.balanceOf(deployer.address).call()).not.bignumber.zero;
  });

  it("user as governance, 100% share, deposit & withdraw", async () => {
    const user = await Wallet.fake(1);
    const startBalance = await user.getBalance();

    nexus.methods.setGovernance(user.address).send();

    await nexus.methods.deposit(user.address).send({ value: bn18("10"), from: user.address });
    expect(await user.getBalance()).bignumber.closeTo(startBalance.sub(bn18("10")), ether);

    let account = await nexus.methods.accounts(user.address).call();
    expect(account.eth).bignumber.closeTo(bn18("10"), bn18("0.1")); // difference due to gas costs
    expect(account.usd).not.bignumber.zero;
    expect(await nexus.methods.totalSupply().call())
      .bignumber.eq(await nexus.methods.totalLiquidity().call())
      .bignumber.eq(account.shares);

    await nexus.methods.withdrawAll(user.address).send({ from: user.address });
    expect(await user.getBalance()).bignumber.closeTo(startBalance, bn18("0.1"));

    expect(await nexus.methods.totalSupply().call()).bignumber.zero;
    account = await nexus.methods.accounts(user.address).call();
    expect(account.eth).bignumber.zero;
    expect(account.usd).bignumber.zero;
    expect(account.shares).bignumber.zero;
  });

  describe("access control", () => {
    it("should revert on improper access", async () => {
      await expectRevert(() =>
        nexus.methods.setGovernance(Wallet.random().address).send({ from: Wallet.random().address })
      );
    });
  });

  async function supplyCapital() {
    await buyUSDCIfNeeded();
    await Tokens.eth.USDC().methods.approve(nexus.options.address, many).send();
    await nexus.methods.depositAllCapital().send();
  }

  async function buyUSDCIfNeeded() {
    if (bn(await Tokens.eth.USDC().methods.balanceOf(deployer.address).call()).gte(bn6("100,000"))) {
      return;
    }
    const router = contract<IUniswapV2Router02>(
      require("../artifacts/contracts/ISushiswapRouter.sol/IUniswapV2Router02.json").abi,
      "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F"
    );
    await router.methods
      .swapExactETHForTokens(0, [Tokens.eth.WETH().address, Tokens.eth.USDC().address], deployer.address, many)
      .send({ value: (await deployer.getBalance()).divn(2) });
  }
});

async function expectRevert(fn: () => any) {
  let err: Error | null = null;
  try {
    await fn();
  } catch (e) {
    console.log(e);
    err = e;
  }
  expect(err, "expected to revert").not.undefined;
}
