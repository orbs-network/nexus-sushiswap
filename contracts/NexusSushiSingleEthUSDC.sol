// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./LiquidityNexusBase.sol";
import "./SushiSwapIntegration.sol";
import "./RebalancingStrategy1.sol";

/**
 * The LiquidityNexus Auto Rebalancing Contract
 */
contract NexusSushiSingleEthUSDC is ERC20("NexusSushiSingleEthUSDC", "NexusSushiSingleEthUSDC"), RebalancingStrategy1 {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    struct Account {
        uint256 eth;
        uint256 usd;
        uint256 shares;
    }

    uint256 public totalLiquidity;
    uint256 public totalInvestedUSD;
    uint256 public totalInvestedETH;
    mapping(address => Account) public accounts;

    function deposit(address account)
        public
        payable
        onlyGovernance
        nonReentrant
        whenNotPaused
        returns (uint256 shares)
    {
        console.log("eth balance", address(this).balance);
        console.log("usd balance", IERC20(USDC).balanceOf(address(this)));
        console.log("price", ethToUsd(1e18));

        (uint256 amountToken, uint256 amountETH, uint256 liquidity) = addLiquidity();

        if (totalSupply() == 0) {
            shares = liquidity;
        } else {
            shares = liquidity.mul(totalSupply()).div(totalLiquidity);
        }
        totalLiquidity = totalLiquidity.add(liquidity);
        totalInvestedUSD = totalInvestedUSD.add(amountToken);
        totalInvestedETH = totalInvestedETH.add(amountETH);

        Account storage acc = accounts[account];
        acc.usd = acc.usd.add(amountToken);
        acc.eth = acc.eth.add(amountETH);
        acc.shares = acc.shares.add(shares);

        _mint(account, shares);
        if (msg.value > amountETH) {
            msg.sender.transfer(msg.value.sub(amountETH));
        }
    }

    function withdraw(address account, uint256 shares)
        public
        onlyGovernance
        nonReentrant
        whenNotPaused
        returns (uint256 ethExit)
    {
        console.log("eth balance", address(this).balance);
        console.log("usd balance", IERC20(USDC).balanceOf(address(this)));
        console.log("price", ethToUsd(1e18));

        Account storage acc = accounts[account];
        shares = min(shares, acc.shares);
        require(shares > 0, "0 shares");

        uint256 liquidity = shares.mul(totalLiquidity).div(totalSupply());

        (uint256 amountToken, uint256 amountETH) = removeLiquidity(liquidity);

        uint256 usdEntry = acc.usd.mul(shares).div(acc.shares);
        uint256 ethEntry = acc.eth.mul(shares).div(acc.shares);
        uint256 usdExit;
        (ethExit, usdExit) = applyRebalance(amountETH, amountToken, ethEntry, usdEntry);

        acc.usd = acc.usd.sub(usdEntry);
        acc.eth = acc.eth.sub(ethEntry);
        acc.shares = acc.shares.sub(shares);

        _burn(account, shares);
        totalLiquidity = totalLiquidity.sub(liquidity);
        totalInvestedUSD = totalInvestedUSD.sub(usdExit);
        totalInvestedETH = totalInvestedETH.sub(ethExit);

        console.log("eth balance", address(this).balance);
        console.log("usd balance", IERC20(USDC).balanceOf(address(this)));
        console.log("ethExit", ethExit);
        msg.sender.transfer(ethExit);
    }

    function withdrawAll(address account) external onlyGovernance returns (uint256 ethExit) {
        return withdraw(account, balanceOf(account));
    }

    function compoundProfits() external payable onlyGovernance nonReentrant whenNotPaused {
        // TODO swap 50% to USDC
        addLiquidity();
    }

    function emergencyLiquidate() external onlyOwner {
        removeLiquiditySupportingFee(totalLiquidity);
        totalLiquidity = 0;
        withdrawFreeCapital();
        totalInvestedUSD = 0;
        _pause();
    }
}
