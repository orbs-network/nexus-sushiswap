import { contract, deployContract } from "../src/extensions";
import { Wallet } from "../src/impl/wallet";
import { expect } from "chai";
import { Tokens } from "../src/impl/token";
import { bn, bn18, bn6, ether, many } from "../src/utils";
import { IUniswapV2Router02 } from "../typechain-hardhat/IUniswapV2Router02";
import { NexusSushiSingleEthUSDC } from "../typechain-hardhat/NexusSushiSingleEthUSDC";
import { expectRevert } from "./test-utils";
import { impersonate, web3 } from "../src/network";
import BN from "bn.js";
import { IUniswapV2Pair } from "../typechain-hardhat/IUniswapV2Pair";

describe("LiquidityNexus with SushiSwap single sided ETH/USDC e2e", () => {
  let deployer: Wallet;
  let nexus: NexusSushiSingleEthUSDC;
  let startDeployerEthBalance: BN;
  let startNexusUsdBalance: BN;
  let sushiRouter: IUniswapV2Router02;
  let sushiPair: IUniswapV2Pair;

  beforeEach(async () => {
    deployer = await Wallet.fake();
    deployer.setAsDefaultSigner();
    nexus = await deployContract<NexusSushiSingleEthUSDC>("NexusSushiSingleEthUSDC", deployer.address);
    sushiRouter = contract<IUniswapV2Router02>(
      require("../artifacts/contracts/ISushiswapRouter.sol/IUniswapV2Router02.json").abi,
      await nexus.methods.SROUTER().call()
    );
    sushiPair = contract<IUniswapV2Pair>(
      require("../artifacts/contracts/ISushiswapRouter.sol/IUniswapV2Pair.json").abi,
      await nexus.methods.SLP().call()
    );
    await supplyCapital();
    [startDeployerEthBalance, startNexusUsdBalance] = await Promise.all([deployer.getBalance(), usdcBalance()]);
  });

  describe("sanity", () => {
    it("sanity", async () => {
      expect(await nexus.methods.USDC().call()).eq(Tokens.eth.USDC().address);
      expect(await nexus.methods.WETH().call()).eq(Tokens.eth.WETH().address);
      expect(await nexus.methods.stopped().call()).is.false;
      expect(await nexus.methods.governance().call())
        .eq(await nexus.methods.owner().call())
        .eq(deployer.address);
      expect(await nexus.methods.totalLiquidity().call()).bignumber.zero;
      expect(await nexus.methods.totalSupply().call()).bignumber.zero;

      expect(await ethBalance()).bignumber.zero;
    });
    it("should revert on improper access", async () => {
      await expectRevert(() =>
        nexus.methods.setGovernance(Wallet.random().address).send({ from: Wallet.random().address })
      );
    });
  });

  it("owner can emergencyLiquidate", async () => {
    expect(await usdcBalance()).not.bignumber.zero;
    expect(await usdcBalance(deployer.address)).bignumber.zero;

    await nexus.methods.emergencyLiquidate().send();

    expect(await nexus.methods.stopped().call()).to.be.true;
    expect(await usdcBalance()).bignumber.zero;
    expect(await usdcBalance(deployer.address)).not.bignumber.zero;
  });

  it("user is governor, 100% share, deposit & withdraw", async () => {
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

    expect(await nexus.methods.totalSupply().call()).eq(await nexus.methods.totalLiquidity().call()).bignumber.zero;
    account = await nexus.methods.accounts(user.address).call();
    expect(account.eth).bignumber.zero;
    expect(account.usd).bignumber.zero;
    expect(account.shares).bignumber.zero;

    expect(await ethBalance()).bignumber.zero;
    expect(await usdcBalance()).bignumber.eq(startNexusUsdBalance);
  });

  it("gov deposit for 2 accounts", async () => {
    const user1 = Wallet.random().address;
    const user2 = Wallet.random().address;
    await nexus.methods.deposit(user1).send({ value: bn18("10") });
    await nexus.methods.deposit(user2).send({ value: bn18("20") });
    expect(await nexus.methods.withdrawAll(user1).call()).bignumber.closeTo(bn18("10"), ether);
    expect(await nexus.methods.withdrawAll(user2).call()).bignumber.closeTo(bn18("20"), ether);
  });

  it("gracefully handle invalid input shares", async () => {
    const user1 = Wallet.random().address;

    await nexus.methods.deposit(user1).send({ value: bn18("10") });
    const shares = bn((await nexus.methods.accounts(user1).call()).shares);
    await nexus.methods.withdraw(user1, shares.muln(10)).send();

    expect(await deployer.getBalance()).bignumber.closeTo(startDeployerEthBalance, ether);
    expect(await usdcBalance()).bignumber.eq(startNexusUsdBalance);
  });

  describe("rebalance usd/eth such that eth provider takes all IL risk but receives all excess eth", () => {
    it.only("whale -> price increase -> fish -> whale exit -> fish exit", async () => {
      const whale = deployer;
      const fishy = await Wallet.fake(1);
      const price = await ethPrice();

      await nexus.methods.deposit(whale.address).send({ value: bn18("100") });
      expect(await usdcBalance()).bignumber.closeTo(startNexusUsdBalance.sub(price.muln(100)), bn6("1"));

      await increaseEthPrice(25);

      await nexus.methods.deposit(fishy.address).send({ value: bn18("1") });
      expect(await usdcBalance()).bignumber.closeTo(
        startNexusUsdBalance.sub(price.muln(100)).sub(price.muln(125).divn(100)),
        bn6("10")
      );

      // original eth after price shift without rebalancing is 89.44
      expect(await nexus.methods.withdrawAll(whale.address).call()).bignumber.closeTo(bn18("98.89"), bn18("0.1"));
    });
  });
  async function supplyCapital() {
    await buyUSDCIfNeeded();
    await Tokens.eth.USDC().methods.approve(nexus.options.address, many).send();
    await nexus.methods.depositAllCapital().send();
  }

  async function buyUSDCIfNeeded() {
    if ((await usdcBalance(deployer.address)).gte(bn6("100,000"))) {
      return;
    }
    await sushiRouter.methods
      .swapExactETHForTokens(0, [Tokens.eth.WETH().address, Tokens.eth.USDC().address], deployer.address, many)
      .send({ value: (await deployer.getBalance()).divn(2) });
  }

  async function usdcBalance(address: string = nexus.options.address) {
    return bn(await Tokens.eth.USDC().methods.balanceOf(address).call());
  }

  async function ethBalance(address: string = nexus.options.address) {
    return bn(await web3().eth.getBalance(address));
  }

  async function ethPrice() {
    return bn(await nexus.methods.ethToUsd(ether).call());
  }

  async function increaseEthPrice(percent: number) {
    console.log("increasing ETH price by", percent, "percent");

    let price = await ethPrice();
    console.log("price before", price.toString(10));

    const targetPrice = price.muln((1 + percent / 100) * 1000).divn(1000);

    const path = [Tokens.eth.USDC().address, Tokens.eth.WETH().address];
    const { reserve0, reserve1 } = await sushiPair.methods.getReserves().call();
    const rUsd = bn(reserve0).divn(1e6).toNumber();
    const rEth = bn(reserve1).div(ether).toNumber();
    const p = targetPrice.divn(1e6).toNumber();
    const t = Math.sqrt(p * rEth * rUsd);
    const usdAmountToSell = bn((t - rUsd) * 1e6);

    const usdcHolder = "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8";
    await impersonate(usdcHolder);

    await Tokens.eth.USDC().methods.approve(sushiRouter.options.address, many).send({ from: usdcHolder });
    await sushiRouter.methods
      .swapExactTokensForETH(usdAmountToSell, 0, path, usdcHolder, many)
      .send({ from: usdcHolder });

    price = await ethPrice();
    console.log("price after", price.toString(10));
  }
});
