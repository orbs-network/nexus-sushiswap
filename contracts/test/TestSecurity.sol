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
    using SafeERC20 for IERC20;

    constructor(NexusLPSushi uut) payable TestNexusBase(uut) SushiswapFlashLoan(uut.SLP(), uut.WETH()) {
        IERC20(WETH).safeApprove(nexus.ROUTER(), uint256(~0));
        IERC20(USDC).safeApprove(nexus.ROUTER(), uint256(~0));
        IERC20(WETH).safeApprove(nexus.SLP(), uint256(~0));
        IERC20(USDC).safeApprove(nexus.SLP(), uint256(~0));
        IERC20(WETH).safeApprove(address(nexus), uint256(~0));
    }

    function testFlashloanExploitOnEntry() external {
        sushiswapFlashLoan(0, 99_000, "_executeFlashloanExploitOnEntry(uint256,uint256)");
    }

    function _executeFlashloanExploitOnEntry(uint256 borrowedToken, uint256 borrowedETH) external {
        printBalances("during loan", address(this));
        console.log("space", nexus.availableSpaceToDepositETH() / 1 ether);
        console.log("price", nexus.quote(1 ether) / 1e6);

        //        nexus.addLiquidity(address(this), nexus.availableSpaceToDepositETH(), DEADLINE);
        //        printBalances("after add liquidity", address(this));

        IERC20(WETH).transfer(nexus.SLP(), getSushiswapFlashloanSameTokenReturn(borrowedETH));
    }

    function _buyRemainingOwing() private {
        uint256 interest = 36_000 * 1e6;
        // 0.09% flashloan fee
        IERC20(WETH).approve(nexus.ROUTER(), uint256(~0));
        IUniswapV2Router02(nexus.ROUTER()).swapTokensForExactTokens(
            interest,
            uint256(~0),
            pathTo[USDC],
            address(this),
            DEADLINE
        );
    }

    function _dumpAllUSDC() private {
        IUniswapV2Router02(nexus.ROUTER()).swapExactTokensForTokens(
            IERC20(USDC).balanceOf(address(this)),
            0,
            pathTo[WETH],
            address(this),
            DEADLINE
        );
        printBalances("after price rise", address(this));
    }
}
