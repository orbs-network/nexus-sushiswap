// SPDX-License-Identifier: MIT
// solhint-disable not-rely-on-time
// solhint-disable no-empty-blocks
pragma solidity ^0.7.6;

import "./TestNexusBase.sol";
import "../interface/ISushiswapRouter.sol";
import "./flashloan/AaveFlashLoan.sol";
import "./flashloan/SushiswapFlashLoan.sol";

contract TestSecurity is TestNexusBase, AaveFlashLoan, SushiswapFlashLoan {
    using SafeMath for uint256;
    using Strings for uint256;
    using SafeERC20 for IERC20;

    constructor(NexusLPSushi uut) payable TestNexusBase(uut) SushiswapFlashLoan(uut.SLP(), uut.WETH()) {
        IERC20(WETH).safeApprove(nexus.ROUTER(), uint256(~0));
        IERC20(USDC).safeApprove(nexus.ROUTER(), uint256(~0));
        IERC20(WETH).safeApprove(nexus.SLP(), uint256(~0));
        IERC20(USDC).safeApprove(nexus.SLP(), uint256(~0));
        IERC20(WETH).safeApprove(address(nexus), uint256(~0));
    }

    function testWhaleLoanExploitOnEntry() external {
        uint256 startBalanceUSDC = IERC20(USDC).balanceOf(address(this));
        require(startBalanceUSDC >= 100_000_000 * 1e6, "assume 100M USDC");
        uint256 startBalanceETH = IERC20(WETH).balanceOf(address(this));

        IUniswapV2Router02(nexus.ROUTER()).swapExactTokensForTokens(
            IERC20(USDC).balanceOf(address(this)),
            0,
            pathTo[WETH],
            address(this),
            DEADLINE
        );

        console.log("space", nexus.availableSpaceToDepositETH() / 1 ether);
        nexus.addLiquidity(address(this), nexus.availableSpaceToDepositETH(), DEADLINE);

        uint256 returnETH = IERC20(WETH).balanceOf(address(this)) - startBalanceETH;
        IUniswapV2Router02(nexus.ROUTER()).swapExactTokensForTokens(
            returnETH,
            0,
            pathTo[USDC],
            address(this),
            DEADLINE
        );

        require(IERC20(WETH).balanceOf(address(this)) == startBalanceETH, "back to start balanceETH");
        uint256 profit = IERC20(USDC).balanceOf(address(this)) - startBalanceUSDC;
        require(profit > 0, profit.toString());
    }
}
